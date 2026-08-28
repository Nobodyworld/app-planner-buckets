mod desktop_storage;

use desktop_storage::{
    desktop_storage_bootstrap, desktop_storage_clear_restore_recovery,
    desktop_storage_create_operation_snapshot, desktop_storage_mark_migration_complete,
    desktop_storage_read_restore_recovery, desktop_storage_recover, desktop_storage_save,
    desktop_storage_write_restore_recovery, DesktopStorageState,
};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            let root = app.path().app_local_data_dir()?;
            let storage = DesktopStorageState::new(root).map_err(std::io::Error::other)?;
            app.manage(storage);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            desktop_storage_bootstrap,
            desktop_storage_save,
            desktop_storage_recover,
            desktop_storage_create_operation_snapshot,
            desktop_storage_mark_migration_complete,
            desktop_storage_read_restore_recovery,
            desktop_storage_write_restore_recovery,
            desktop_storage_clear_restore_recovery,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Planner Buckets");
}
