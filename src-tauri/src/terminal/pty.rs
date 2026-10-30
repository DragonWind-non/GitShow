use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    read_buffer: Arc<Mutex<Vec<u8>>>,
    child: Box<dyn Child + Send + Sync>,
}

pub struct PtySessionManager {
    sessions: Arc<Mutex<HashMap<u32, PtySession>>>,
    next_id: AtomicU32,
}

impl Default for PtySessionManager {
    fn default() -> Self {
        Self::new()
    }
}

impl PtySessionManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            next_id: AtomicU32::new(1),
        }
    }

    pub fn global() -> &'static PtySessionManager {
        static INSTANCE: OnceLock<PtySessionManager> = OnceLock::new();
        INSTANCE.get_or_init(PtySessionManager::new)
    }

    pub fn create_session(&self, cwd: &str, cols: u16, rows: u16) -> Result<u32, String> {
        let cwd_path = Path::new(cwd);
        if !cwd_path.exists() || !cwd_path.is_dir() {
            return Err(format!("Directory does not exist or is not a directory: {cwd}"));
        }

        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to open PTY pair: {e}"))?;

        let shell = default_shell();
        let mut cmd = CommandBuilder::new(&shell);
        cmd.cwd(cwd_path);

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn shell '{shell}': {e}"))?;

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to acquire PTY writer: {e}"))?;

        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to clone PTY reader: {e}"))?;

        let session_id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let read_buffer = Arc::new(Mutex::new(Vec::new()));
        let buffer_clone = Arc::clone(&read_buffer);

        std::thread::Builder::new()
            .name(format!("pty-reader-{session_id}"))
            .spawn(move || {
                let mut buf = [0u8; 4096];
                loop {
                    match reader.read(&mut buf) {
                        Ok(0) => break,
                        Ok(n) => {
                            let mut lock = buffer_clone.lock().unwrap_or_else(|e| e.into_inner());
                            lock.extend_from_slice(&buf[..n]);
                        }
                        Err(_) => break,
                    }
                }
            })
            .map_err(|e| format!("Failed to spawn PTY reader thread: {e}"))?;

        let session = PtySession {
            master: pair.master,
            writer,
            read_buffer,
            child,
        };

        let mut sessions = self
            .sessions
            .lock()
            .map_err(|e| format!("Mutex poisoned: {e}"))?;
        sessions.insert(session_id, session);

        Ok(session_id)
    }

    pub fn write(&self, session_id: u32, data: &[u8]) -> Result<(), String> {
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|e| format!("Mutex poisoned: {e}"))?;
        let session = sessions
            .get_mut(&session_id)
            .ok_or_else(|| format!("Session {session_id} not found"))?;

        session
            .writer
            .write_all(data)
            .map_err(|e| format!("Failed to write to PTY: {e}"))?;
        session
            .writer
            .flush()
            .map_err(|e| format!("Failed to flush PTY writer: {e}"))?;

        Ok(())
    }

    pub fn resize(&self, session_id: u32, cols: u16, rows: u16) -> Result<(), String> {
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|e| format!("Mutex poisoned: {e}"))?;
        let session = sessions
            .get_mut(&session_id)
            .ok_or_else(|| format!("Session {session_id} not found"))?;

        session
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to resize PTY: {e}"))?;

        Ok(())
    }

    pub fn read(&self, session_id: u32) -> Result<Vec<u8>, String> {
        let sessions = self
            .sessions
            .lock()
            .map_err(|e| format!("Mutex poisoned: {e}"))?;
        let session = sessions
            .get(&session_id)
            .ok_or_else(|| format!("Session {session_id} not found"))?;

        let mut buffer = session
            .read_buffer
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        let data = std::mem::take(&mut *buffer);
        Ok(data)
    }

    pub fn close_session(&self, session_id: u32) -> Result<(), String> {
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|e| format!("Mutex poisoned: {e}"))?;
        let mut session = sessions
            .remove(&session_id)
            .ok_or_else(|| format!("Session {session_id} not found"))?;

        let _ = session.child.kill();
        // Dropping session closes master, writer and child
        Ok(())
    }
}

fn default_shell() -> String {
    #[cfg(windows)]
    {
        if let Ok(windir) = std::env::var("SystemRoot") {
            let ps_path = Path::new(&windir)
                .join("System32")
                .join("WindowsPowerShell")
                .join("v1.0")
                .join("powershell.exe");
            if ps_path.exists() {
                return ps_path.to_string_lossy().to_string();
            }
        }
        "powershell.exe".to_string()
    }
    #[cfg(not(windows))]
    {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string())
    }
}

pub fn create_pty_session(cwd: &str, cols: u16, rows: u16) -> Result<u32, String> {
    PtySessionManager::global().create_session(cwd, cols, rows)
}

pub fn write_to_pty(session_id: u32, data: &[u8]) -> Result<(), String> {
    PtySessionManager::global().write(session_id, data)
}

pub fn resize_pty(session_id: u32, cols: u16, rows: u16) -> Result<(), String> {
    PtySessionManager::global().resize(session_id, cols, rows)
}

pub fn read_from_pty(session_id: u32) -> Result<Vec<u8>, String> {
    PtySessionManager::global().read(session_id)
}

pub fn close_pty_session(session_id: u32) -> Result<(), String> {
    PtySessionManager::global().close_session(session_id)
}
