use gitshow_lib::terminal::pty::{
    close_pty_session, create_pty_session, read_from_pty, resize_pty, write_to_pty,
    PtySessionManager,
};
use std::thread::sleep;
use std::time::{Duration, Instant};
use tempfile::tempdir;

#[test]
fn test_pty_session_lifecycle() {
    let dir = tempdir().expect("tempdir");
    let cwd = dir.path().to_str().expect("valid path string");

    let session_id = create_pty_session(cwd, 80, 24).expect("failed to create pty session");
    assert!(session_id > 0);

    // Write a command that outputs our test token
    let cmd: &[u8] = if cfg!(windows) {
        b"echo gitshow_pty_test\r\n"
    } else {
        b"echo gitshow_pty_test\n"
    };
    write_to_pty(session_id, cmd).expect("failed to write to pty");

    // Poll read_from_pty until output contains token or timeout
    let start = Instant::now();
    let timeout = Duration::from_secs(10);
    let mut collected = String::new();
    let mut found = false;

    while start.elapsed() < timeout {
        match read_from_pty(session_id) {
            Ok(bytes) => {
                if !bytes.is_empty() {
                    let text = String::from_utf8_lossy(&bytes);
                    collected.push_str(&text);
                    if collected.contains("gitshow_pty_test") {
                        found = true;
                        break;
                    }
                }
            }
            Err(e) => panic!("read_from_pty failed: {e}"),
        }
        sleep(Duration::from_millis(50));
    }

    assert!(
        found,
        "Did not receive expected token 'gitshow_pty_test' in output: {:?}",
        collected
    );

    // Test resize
    resize_pty(session_id, 120, 40).expect("failed to resize pty");

    // Close session
    close_pty_session(session_id).expect("failed to close pty session");

    // Subsequent operations must fail
    assert!(write_to_pty(session_id, b"test").is_err());
    assert!(read_from_pty(session_id).is_err());
    assert!(resize_pty(session_id, 80, 24).is_err());
    assert!(close_pty_session(session_id).is_err());
}

#[test]
fn test_pty_invalid_session_id() {
    let non_existent_id = 999_999;
    assert!(write_to_pty(non_existent_id, b"test").is_err());
    assert!(read_from_pty(non_existent_id).is_err());
    assert!(resize_pty(non_existent_id, 80, 24).is_err());
    assert!(close_pty_session(non_existent_id).is_err());
}

#[test]
fn test_pty_invalid_cwd() {
    let invalid_cwd = if cfg!(windows) {
        "Z:\\non_existent_directory_for_gitshow_pty_test_12345"
    } else {
        "/non_existent_directory_for_gitshow_pty_test_12345"
    };

    let result = create_pty_session(invalid_cwd, 80, 24);
    assert!(result.is_err(), "creating session in non-existent directory should fail");
}

#[test]
fn test_pty_session_manager_instance() {
    let dir = tempdir().expect("tempdir");
    let cwd = dir.path().to_str().expect("valid path string");

    let manager = PtySessionManager::new();
    let session_id = manager.create_session(cwd, 80, 24).expect("failed to create session");
    assert!(session_id > 0);

    manager.resize(session_id, 100, 30).expect("failed to resize");
    manager.close_session(session_id).expect("failed to close");
    assert!(manager.read(session_id).is_err());
}
