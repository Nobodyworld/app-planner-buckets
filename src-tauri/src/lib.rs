mod desktop_storage;

use desktop_storage::*;
use tauri::{Emitter, Manager, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            let root = app.path().app_local_data_dir()?;
            app.manage(DesktopStorageState::new(root).map_err(std::io::Error::other)?);
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if let Some(storage) = window.try_state::<DesktopStorageState>() {
                    if storage.close_requires_flush() {
                        api.prevent_close();
                        let _ = window.emit("planner-storage-close-requested", ());
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            desktop_storage_bootstrap,
            desktop_storage_save,
            desktop_storage_recover,
            desktop_storage_create_operation_snapshot,
            desktop_storage_commit_restore,
            desktop_storage_mark_migration_complete,
            desktop_storage_read_restore_recovery,
            desktop_storage_clear_restore_recovery,
            desktop_storage_list_backups,
            desktop_storage_prune_backups,
            desktop_storage_enable_close_guard,
            desktop_storage_finish_close,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Planner Buckets");
}
