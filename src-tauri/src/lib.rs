pub mod commands;
pub mod engine;
pub mod github;
pub mod ipc;
pub mod terminal;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            ipc::open_repository,
            ipc::list_branches,
            ipc::list_tags,
            ipc::build_commit_graph,
            ipc::execute_git_command,
            ipc::preview_command,
            ipc::capture_pre_mutation_snapshot,
            ipc::rollback_snapshot,
            ipc::get_undo_stack,
            ipc::execute_interactive_rebase,
            ipc::fetch_pull_requests,
            ipc::fetch_pr_diff,
            ipc::request_device_code,
            ipc::poll_for_access_token,
            ipc::get_token,
            ipc::store_token,
            ipc::remove_token,
            ipc::create_pty_session,
            ipc::write_to_pty,
            ipc::read_from_pty,
            ipc::resize_pty,
            ipc::close_pty_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
