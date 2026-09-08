use crate::desktop_storage::{desktop_storage_create_operation_snapshot, DesktopStorageState};
use serde_json::json;
use std::sync::Mutex;
use tauri::{AppHandle, State, Window};
use tauri_plugin_updater::{Update, UpdaterExt};

const UPDATE_ENDPOINT: &str =
    "https://github.com/Nobodyworld/app-planner-buckets/releases/latest/download/latest.json";

pub struct DesktopUpdaterState {
    pending: Mutex<Option<Update>>,
}

impl DesktopUpdaterState {
    pub fn new() -> Self {
        Self {
            pending: Mutex::new(None),
        }
    }
}

fn updater_public_key() -> Result<&'static str, String> {
    option_env!("PLANNER_BUCKETS_UPDATER_PUBKEY")
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Signed updater is not configured in this build.".into())
}

fn main_window(window: &Window) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("Unsupported window.".into())
    }
}

#[tauri::command]
pub async fn desktop_update_check(
    window: Window,
    app: AppHandle,
    state: State<'_, DesktopUpdaterState>,
) -> Result<String, String> {
    main_window(&window)?;
    let pubkey = match updater_public_key() {
        Ok(value) => value,
        Err(error) => {
            return Ok(json!({
                "configured": false,
                "available": false,
                "message": error,
                "currentVersion": app.package_info().version.to_string()
            })
            .to_string())
        }
    };
    let endpoint = UPDATE_ENDPOINT
        .parse()
        .map_err(|error| format!("Invalid updater endpoint: {error}"))?;
    let update = app
        .updater_builder()
        .pubkey(pubkey)
        .endpoints(vec![endpoint])
        .map_err(|error| error.to_string())?
        .build()
        .map_err(|error| error.to_string())?
        .check()
        .await
        .map_err(|error| error.to_string())?;

    let response = match update.as_ref() {
        Some(update) => json!({
            "configured": true,
            "available": true,
            "version": update.version,
            "currentVersion": update.current_version,
            "notes": update.body
        }),
        None => json!({
            "configured": true,
            "available": false,
            "currentVersion": app.package_info().version.to_string()
        }),
    };
    *state
        .pending
        .lock()
        .map_err(|_| "Updater state lock failed.".to_string())? = update;
    Ok(response.to_string())
}

#[tauri::command]
pub async fn desktop_update_install(
    window: Window,
    serialized: String,
    timestamp: String,
    session: u64,
    updater_state: State<'_, DesktopUpdaterState>,
    storage_state: State<'_, DesktopStorageState>,
) -> Result<(), String> {
    main_window(&window)?;

    let update = updater_state
        .pending
        .lock()
        .map_err(|_| "Updater state lock failed.".to_string())?
        .as_ref()
        .cloned()
        .ok_or_else(|| "No checked update is pending. Check again before installing.".to_string())?;

    // This native command is the only install path exposed by Planner Buckets. The
    // durable pre-update snapshot is therefore mandatory and immediately precedes
    // the signed updater download/install operation.
    desktop_storage_create_operation_snapshot(
        serialized,
        "pre-update".into(),
        timestamp,
        session,
        storage_state,
    )?;

    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|error| error.to_string())?;

    if let Ok(mut pending) = updater_state.pending.lock() {
        *pending = None;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn updater_endpoint_is_https_and_static_github_metadata() {
        assert!(UPDATE_ENDPOINT.starts_with("https://"));
        assert!(UPDATE_ENDPOINT.ends_with("/releases/latest/download/latest.json"));
    }

    #[test]
    fn public_key_is_build_configuration_not_repository_fallback() {
        if let Ok(key) = updater_public_key() {
            assert!(!key.trim().is_empty());
        }
    }
}
