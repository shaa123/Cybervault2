mod vault;

use vault::{VaultManager, AuditEntry, VaultSettings};
use std::sync::{Arc, Mutex};
use tauri::State;
use serde::{Deserialize, Serialize};

struct AppState {
    vault: Arc<Mutex<VaultManager>>,
}

fn guess_mime_type(name: &str) -> &'static str {
    let n = name.to_lowercase();
    if n.ends_with(".jpg") || n.ends_with(".jpeg") { "image/jpeg" }
    else if n.ends_with(".png") { "image/png" }
    else if n.ends_with(".gif") { "image/gif" }
    else if n.ends_with(".webp") { "image/webp" }
    else if n.ends_with(".bmp") { "image/bmp" }
    else if n.ends_with(".svg") { "image/svg+xml" }
    else if n.ends_with(".mp4") { "video/mp4" }
    else if n.ends_with(".webm") { "video/webm" }
    else if n.ends_with(".mkv") { "video/x-matroska" }
    else if n.ends_with(".avi") { "video/x-msvideo" }
    else if n.ends_with(".mov") { "video/quicktime" }
    else if n.ends_with(".pdf") { "application/pdf" }
    else if n.ends_with(".txt") { "text/plain" }
    else { "application/octet-stream" }
}

/// Parse Range header: "bytes=START-END" or "bytes=START-"
fn parse_range(header: &str, file_size: u64) -> Option<(u64, u64)> {
    let s = header.strip_prefix("bytes=")?;
    let parts: Vec<&str> = s.split('-').collect();
    if parts.len() != 2 { return None; }
    let start: u64 = parts[0].parse().ok()?;
    let end: u64 = if parts[1].is_empty() {
        file_size - 1
    } else {
        parts[1].parse().ok()?
    };
    if start > end || start >= file_size { return None; }
    Some((start, end.min(file_size - 1)))
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
            Err(e) => eprintln!("Failed to hide {}: {}", path, e),
        }
    }
    Ok(results)
}

#[tauri::command]
fn hide_files_batch(state: State<AppState>, paths: Vec<String>, category: String) -> Result<usize, String> {
    let mut vault = state.vault.lock().map_err(|e| e.to_string())?;
    Ok(vault.hide_files_fast(&paths, &category))
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
fn get_thumbnail(state: State<AppState>, file_id: String) -> Result<String, String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.get_thumbnail(&file_id)
}

#[tauri::command]
fn has_thumbnail(state: State<AppState>, file_id: String) -> Result<bool, String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    Ok(vault.has_thumbnail(&file_id))
}

#[tauri::command]
fn debug_info(state: State<AppState>) -> Result<String, String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    Ok(vault.debug_info())
}

#[tauri::command]
fn set_pin(state: State<AppState>, pin: String) -> Result<(), String> {
    let mut vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.set_pin(&pin)
}

#[tauri::command]
fn verify_pin(state: State<AppState>, pin: String) -> Result<bool, String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    Ok(vault.verify_pin(&pin))
}

#[tauri::command]
fn has_pin(state: State<AppState>) -> Result<bool, String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    Ok(vault.has_pin())
}

#[tauri::command]
fn remove_pin(state: State<AppState>) -> Result<(), String> {
    let mut vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.remove_pin()
}

#[tauri::command]
fn get_settings(state: State<AppState>) -> Result<VaultSettings, String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    Ok(vault.get_settings())
}

#[tauri::command]
fn update_settings(state: State<AppState>, settings: serde_json::Value) -> Result<(), String> {
    let mut vault = state.vault.lock().map_err(|e| e.to_string())?;
    let parsed: VaultSettings = serde_json::from_value(settings)
        .map_err(|e| format!("Invalid settings: {}", e))?;
    vault.update_settings(parsed)
}

#[tauri::command]
fn get_audit_log(state: State<AppState>) -> Result<Vec<AuditEntry>, String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    Ok(vault.get_audit_log())
}

#[tauri::command]
fn clear_audit_log(state: State<AppState>) -> Result<(), String> {
    let mut vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.clear_audit_log()
}

#[tauri::command]
fn create_backup(state: State<AppState>) -> Result<String, String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.create_backup()
}

#[tauri::command]
fn restore_backup(state: State<AppState>, backup_data: String) -> Result<String, String> {
    let mut vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.restore_backup(&backup_data)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let vault_arc = Arc::new(Mutex::new(
        VaultManager::new().expect("Failed to initialize vault")
    ));
    let vault_for_protocol = vault_arc.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .register_asynchronous_uri_scheme_protocol("vault", move |_ctx, request, responder| {
            let vault = vault_for_protocol.clone();
            std::thread::spawn(move || {
                let uri = request.uri().to_string();
                // Parse: vault://localhost/file/{id} or vault://localhost/thumb/{id}
                let path = uri.strip_prefix("vault://localhost/")
                    .or_else(|| uri.strip_prefix("vault:///"))
                    .or_else(|| uri.strip_prefix("vault://"))
                    .unwrap_or("");

                let (kind, file_id) = if let Some(id) = path.strip_prefix("file/") {
                    ("file", id)
                } else if let Some(id) = path.strip_prefix("thumb/") {
                    ("thumb", id)
                } else {
                    responder.respond(
                        tauri::http::Response::builder()
                            .status(404)
                            .body(b"Not found".to_vec())
                            .unwrap()
                    );
                    return;
                };

                // Lock mutex only to get the path, then release
                let (file_path, original_name) = {
                    let v = match vault.lock() {
                        Ok(v) => v,
                        Err(_) => {
                            responder.respond(
                                tauri::http::Response::builder()
                                    .status(500)
                                    .body(b"Lock failed".to_vec())
                                    .unwrap()
                            );
                            return;
                        }
                    };
                    let fp = if kind == "thumb" {
                        v.get_thumb_file_path(file_id)
                    } else {
                        v.get_file_path(file_id)
                    };
                    let name = v.get_original_name(file_id).unwrap_or_default();
                    (fp, name)
                }; // Mutex released here

                let file_path = match file_path {
                    Ok(p) => p,
                    Err(_) => {
                        responder.respond(
                            tauri::http::Response::builder()
                                .status(404)
                                .body(b"File not found".to_vec())
                                .unwrap()
                        );
                        return;
                    }
                };

                let mime = if kind == "thumb" {
                    "image/jpeg"
                } else {
                    guess_mime_type(&original_name)
                };

                let file_size = match std::fs::metadata(&file_path) {
                    Ok(m) => m.len(),
                    Err(_) => {
                        responder.respond(
                            tauri::http::Response::builder()
                                .status(404)
                                .body(b"File missing on disk".to_vec())
                                .unwrap()
                        );
                        return;
                    }
                };

                // Check for Range header
                let range_header = request.headers()
                    .get("range")
                    .and_then(|v| v.to_str().ok())
                    .map(String::from);

                if let Some(ref range_str) = range_header {
                    if let Some((start, end)) = parse_range(range_str, file_size) {
                        let length = end - start + 1;
                        use std::io::{Read, Seek, SeekFrom};
                        let mut file = match std::fs::File::open(&file_path) {
                            Ok(f) => f,
                            Err(_) => {
                                responder.respond(
                                    tauri::http::Response::builder()
                                        .status(500)
                                        .body(b"Read error".to_vec())
                                        .unwrap()
                                );
                                return;
                            }
                        };
                        let _ = file.seek(SeekFrom::Start(start));
                        let mut buf = vec![0u8; length as usize];
                        let _ = file.read_exact(&mut buf);

                        responder.respond(
                            tauri::http::Response::builder()
                                .status(206)
                                .header("Content-Type", mime)
                                .header("Content-Length", length.to_string())
                                .header("Content-Range", format!("bytes {}-{}/{}", start, end, file_size))
                                .header("Accept-Ranges", "bytes")
                                .header("Access-Control-Allow-Origin", "*")
                                .body(buf)
                                .unwrap()
                        );
                        return;
                    }
                }

                // Full response
                let data = match std::fs::read(&file_path) {
                    Ok(d) => d,
                    Err(_) => {
                        responder.respond(
                            tauri::http::Response::builder()
                                .status(500)
                                .body(b"Read error".to_vec())
                                .unwrap()
                        );
                        return;
                    }
                };

                responder.respond(
                    tauri::http::Response::builder()
                        .status(200)
                        .header("Content-Type", mime)
                        .header("Content-Length", data.len().to_string())
                        .header("Accept-Ranges", "bytes")
                        .header("Access-Control-Allow-Origin", "*")
                        .body(data)
                        .unwrap()
                );
            });
        })
        .manage(AppState {
            vault: vault_arc.clone(),
        })
        .invoke_handler(tauri::generate_handler![
            hide_files,
            hide_files_batch,
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
            get_thumbnail,
            has_thumbnail,
            debug_info,
            set_pin,
            verify_pin,
            has_pin,
            remove_pin,
            get_settings,
            update_settings,
            get_audit_log,
            clear_audit_log,
            create_backup,
            restore_backup,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
