mod vault;

use vault::VaultManager;
use std::sync::Mutex;
use tauri::State;
use serde::{Deserialize, Serialize};

struct AppState {
    vault: Mutex<VaultManager>,
}

#[derive(Serialize, Deserialize, Clone)]
struct VaultFile {
    id: String,
    original_name: String,
    category: String,
    size: u64,
    hidden_at: String,
    mime_hint: String,
    #[serde(default)]
    tag: String,
}

#[derive(Serialize, Deserialize)]
struct VaultStats {
    total_files: usize,
    images: usize,
    videos: usize,
    documents: usize,
    notes: usize,
    trash: usize,
}

#[tauri::command]
fn hide_files(state: State<AppState>, paths: Vec<String>, category: String) -> Result<Vec<VaultFile>, String> {
    let mut vault = state.vault.lock().map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for path in paths {
        match vault.hide_file(&path, &category) {
            Ok(vf) => results.push(vf),
            Err(e) => return Err(format!("Failed to hide {}: {}", path, e)),
        }
    }
    Ok(results)
}

#[tauri::command]
fn list_files(state: State<AppState>, category: String) -> Result<Vec<VaultFile>, String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    Ok(vault.list_files(&category))
}

#[tauri::command]
fn unhide_file(state: State<AppState>, file_id: String, destination: String) -> Result<(), String> {
    let mut vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.unhide_file(&file_id, &destination)
}

#[tauri::command]
fn delete_file(state: State<AppState>, file_id: String) -> Result<(), String> {
    let mut vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.move_to_trash(&file_id)
}

#[tauri::command]
fn restore_file(state: State<AppState>, file_id: String) -> Result<(), String> {
    let mut vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.restore_from_trash(&file_id)
}

#[tauri::command]
fn purge_trash(state: State<AppState>) -> Result<(), String> {
    let mut vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.purge_trash()
}

#[tauri::command]
fn get_stats(state: State<AppState>) -> Result<VaultStats, String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    Ok(vault.get_stats())
}

#[tauri::command]
fn get_file_preview(state: State<AppState>, file_id: String) -> Result<String, String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.get_file_base64(&file_id)
}

#[tauri::command]
fn save_note(state: State<AppState>, title: String, content: String) -> Result<VaultFile, String> {
    let mut vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.save_note(&title, &content)
}

#[tauri::command]
fn read_note(state: State<AppState>, file_id: String) -> Result<String, String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.read_note(&file_id)
}

#[tauri::command]
fn set_file_tag(state: State<AppState>, file_id: String, tag: String) -> Result<(), String> {
    let mut vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.set_file_tag(&file_id, &tag)
}

#[tauri::command]
fn set_files_tag(state: State<AppState>, file_ids: Vec<String>, tag: String) -> Result<(), String> {
    let mut vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.set_files_tag(&file_ids, &tag)
}

#[tauri::command]
fn list_tags(state: State<AppState>, category: String) -> Result<Vec<String>, String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    Ok(vault.list_tags(&category))
}

#[tauri::command]
fn create_tag(state: State<AppState>, category: String, tag: String) -> Result<(), String> {
    let mut vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.create_tag(&category, &tag)
}

#[tauri::command]
fn delete_tag(state: State<AppState>, category: String, tag: String) -> Result<(), String> {
    let mut vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.delete_tag(&category, &tag)
}

#[tauri::command]
fn delete_files(state: State<AppState>, file_ids: Vec<String>) -> Result<(), String> {
    let mut vault = state.vault.lock().map_err(|e| e.to_string())?;
    for id in file_ids {
        vault.move_to_trash(&id)?;
    }
    Ok(())
}

#[tauri::command]
fn debug_info(state: State<AppState>) -> Result<String, String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    Ok(vault.debug_info())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let vault = VaultManager::new().expect("Failed to initialize vault");

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .manage(AppState {
            vault: Mutex::new(vault),
        })
        .invoke_handler(tauri::generate_handler![
            hide_files,
            list_files,
            unhide_file,
            delete_file,
            restore_file,
            purge_trash,
            get_stats,
            get_file_preview,
            save_note,
            read_note,
            set_file_tag,
            set_files_tag,
            list_tags,
            create_tag,
            delete_tag,
            delete_files,
            debug_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
