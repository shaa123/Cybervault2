mod vault;

use vault::{VaultManager, AuditEntry, VaultSettings};
use std::sync::{Arc, Mutex};
use tauri::State;
use serde::{Deserialize, Serialize};
use rand::Rng;

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
fn unhide_files(state: State<AppState>, file_ids: Vec<String>, destination: String) -> Result<usize, String> {
    let mut vault = state.vault.lock().map_err(|e| e.to_string())?;
    let mut count = 0;
    for id in file_ids {
        if vault.unhide_file(&id, &destination).is_ok() {
            count += 1;
        }
    }
    Ok(count)
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
fn get_cached_thumb_ids(state: State<AppState>) -> Result<Vec<String>, String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    Ok(vault.get_cached_thumb_ids())
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

/// Generate thumbnails for a batch of files that don't have them.
/// Processes in parallel using threads. Returns how many were generated.
#[tauri::command]
fn generate_thumbs_batch(state: State<AppState>, batch_size: usize) -> Result<usize, String> {
    let missing: Vec<(String, String)> = {
        let vault = state.vault.lock().map_err(|e| e.to_string())?;
        let all = vault.get_missing_thumb_ids();
        all.into_iter().take(batch_size).collect()
    };

    if missing.is_empty() { return Ok(0); }

    let vault_root = {
        let vault = state.vault.lock().map_err(|e| e.to_string())?;
        vault.vault_root_path().to_path_buf()
    };

    let thumb_dir = vault_root.join(".thumbs");
    let _ = std::fs::create_dir_all(&thumb_dir);

    // Process in parallel threads
    let thumb_dir = Arc::new(thumb_dir);
    let handles: Vec<_> = missing.into_iter().map(|(file_id, hidden_path)| {
        let td = thumb_dir.clone();
        std::thread::spawn(move || {
            let thumb = vault::VaultManager::generate_thumbnail_static(
                std::path::Path::new(&hidden_path), &td
            );
            if !thumb.is_empty() {
                Some((file_id, thumb))
            } else {
                None
            }
        })
    }).collect();

    // Collect results
    let results: Vec<(String, String)> = handles.into_iter()
        .filter_map(|h| h.join().ok().flatten())
        .collect();

    let generated = results.len();

    // Single lock to save all thumb paths at once
    if generated > 0 {
        if let Ok(mut vault) = state.vault.lock() {
            for (file_id, thumb) in &results {
                let _ = vault.set_thumb_path(file_id, thumb);
            }
        }
    }

    Ok(generated)
}

/// Read first N bytes of a file as base64 (for video frame capture)
#[tauri::command]
fn get_file_preview_chunk(state: State<AppState>, file_id: String, max_bytes: usize) -> Result<String, String> {
    let file_path = {
        let vault = state.vault.lock().map_err(|e| e.to_string())?;
        vault.get_file_path(&file_id)?
    };

    use std::io::Read;
    let mut file = std::fs::File::open(&file_path).map_err(|e| e.to_string())?;
    let file_size = file.metadata().map(|m| m.len() as usize).unwrap_or(0);
    let read_size = max_bytes.min(file_size);
    let mut buf = vec![0u8; read_size];
    file.read_exact(&mut buf).map_err(|e| e.to_string())?;

    use base64::Engine;
    Ok(base64::engine::general_purpose::STANDARD.encode(&buf))
}

/// Save a frontend-generated thumbnail (e.g. video frame capture)
#[tauri::command]
fn save_thumb_data(state: State<AppState>, file_id: String, thumb_base64: String) -> Result<(), String> {
    use base64::Engine;
    let data = base64::engine::general_purpose::STANDARD
        .decode(&thumb_base64)
        .map_err(|e| format!("Invalid base64: {}", e))?;

    let vault_root = {
        let vault = state.vault.lock().map_err(|e| e.to_string())?;
        vault.vault_root_path().to_path_buf()
    };

    let thumb_dir = vault_root.join(".thumbs");
    let _ = std::fs::create_dir_all(&thumb_dir);

    let thumb_name = format!("t_{:016x}.jpg", rand::thread_rng().gen::<u64>());
    let thumb_path = thumb_dir.join(&thumb_name);
    std::fs::write(&thumb_path, &data).map_err(|e| e.to_string())?;

    let mut vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.set_thumb_path(&file_id, &thumb_path.to_string_lossy())
}

/// Get list of video file IDs that don't have thumbnails
#[tauri::command]
fn get_missing_video_thumb_ids(state: State<AppState>) -> Result<Vec<String>, String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    Ok(vault.get_missing_video_thumb_ids())
}

#[tauri::command]
fn get_storage_info(state: State<AppState>) -> Result<serde_json::Value, String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    let root = vault.vault_root_path().to_path_buf();
    drop(vault);

    // Get disk space for the vault drive
    let mut total: u64 = 0;
    let mut free: u64 = 0;

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        // Get drive letter from vault path
        let drive = root.to_string_lossy().chars().next().unwrap_or('C');
        if let Ok(output) = Command::new("wmic")
            .args(["logicaldisk", "where", &format!("DeviceID='{drive}:'"), "get", "Size,FreeSpace", "/format:csv"])
            .output()
        {
            let text = String::from_utf8_lossy(&output.stdout);
            for line in text.lines() {
                let parts: Vec<&str> = line.split(',').collect();
                if parts.len() >= 3 {
                    free = parts[1].trim().parse().unwrap_or(0);
                    total = parts[2].trim().parse().unwrap_or(0);
                }
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        use std::process::Command;
        if let Ok(output) = Command::new("df")
            .args(["-B1", &root.to_string_lossy()])
            .output()
        {
            let text = String::from_utf8_lossy(&output.stdout);
            if let Some(line) = text.lines().nth(1) {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 4 {
                    total = parts[1].parse().unwrap_or(0);
                    free = parts[3].parse().unwrap_or(0);
                }
            }
        }
    }

    Ok(serde_json::json!({
        "total": total,
        "free": free,
        "used": total.saturating_sub(free),
    }))
}

#[tauri::command]
fn list_folder_files(path: String) -> Result<Vec<String>, String> {
    use walkdir::WalkDir;
    let mut files = Vec::new();
    for entry in WalkDir::new(&path).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            files.push(entry.path().to_string_lossy().to_string());
        }
    }
    Ok(files)
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, &content).map_err(|e| format!("Write failed: {}", e))
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Read failed: {}", e))
}

#[tauri::command]
fn read_bg_file(path: String) -> Result<String, String> {
    let data = std::fs::read(&path).map_err(|e| format!("Failed to read bg: {}", e))?;
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&data);
    let ext = std::path::Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let mime = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "mkv" => "video/x-matroska",
        "avi" => "video/x-msvideo",
        "mov" => "video/quicktime",
        _ => "application/octet-stream",
    };
    Ok(format!("data:{};base64,{}", mime, b64))
}

/// Read a vault file by ID and return as data URL (for BG from vault)
#[tauri::command]
fn read_vault_file_as_data_url(state: State<AppState>, file_id: String) -> Result<String, String> {
    let (hidden_path, original_name) = {
        let vault = state.vault.lock().map_err(|e| e.to_string())?;
        let p = vault.get_file_path(&file_id)?;
        let n = vault.get_original_name(&file_id)?;
        (p, n)
    };
    let data = std::fs::read(&hidden_path).map_err(|e| e.to_string())?;
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&data);
    let mime = guess_mime_type(&original_name);
    Ok(format!("data:{};base64,{}", mime, b64))
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
            let path = uri.strip_prefix("http://vault.localhost/")
                .or_else(|| uri.strip_prefix("https://vault.localhost/"))
                .or_else(|| uri.strip_prefix("vault://localhost/"))
                .or_else(|| uri.strip_prefix("vault:///"))
                .or_else(|| uri.strip_prefix("vault://"))
                .unwrap_or("");

            let (kind, file_id_raw) = if let Some(id) = path.strip_prefix("file/") {
                ("file", id)
            } else if let Some(id) = path.strip_prefix("thumb/") {
                ("thumb", id)
            } else {
                responder.respond(tauri::http::Response::builder()
                    .status(404).body(b"Not found".to_vec()).unwrap());
                return;
            };

            let file_id = file_id_raw.split('?').next().unwrap_or(file_id_raw);

            let (thumb_path_result, hidden_path, original_name) = {
                let v = match vault.lock() {
                    Ok(v) => v,
                    Err(_) => {
                        responder.respond(tauri::http::Response::builder()
                            .status(500).body(b"Lock failed".to_vec()).unwrap());
                        return;
                    }
                };
                let tp = if kind == "thumb" { v.get_thumb_file_path(file_id).ok() } else { None };
                let hp = v.get_file_path(file_id).ok();
                let name = v.get_original_name(file_id).unwrap_or_default();
                (tp, hp, name)
            };

            let file_path;

            if kind == "file" {
                file_path = match hidden_path {
                    Some(p) => p,
                    None => {
                        responder.respond(tauri::http::Response::builder()
                            .status(404).body(b"Not found".to_vec()).unwrap());
                        return;
                    }
                };
            } else {
                if let Some(tp) = thumb_path_result {
                    file_path = tp;
                } else {
                    responder.respond(tauri::http::Response::builder()
                        .status(404).body(b"No thumbnail".to_vec()).unwrap());
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
                    responder.respond(tauri::http::Response::builder()
                        .status(404).body(b"File missing".to_vec()).unwrap());
                    return;
                }
            };

            const MAX_CHUNK: u64 = 4 * 1024 * 1024;
            use std::io::{Read as _, Seek as _, SeekFrom};

            let is_video_type = mime.starts_with("video/");

            let range = request.headers()
                .get("range")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| parse_range(s, file_size));

            if !is_video_type && range.is_none() {
                match std::fs::read(&file_path) {
                    Ok(data) => {
                        responder.respond(tauri::http::Response::builder()
                            .status(200)
                            .header("Content-Type", mime)
                            .header("Content-Length", data.len().to_string())
                            .header("Accept-Ranges", "bytes")
                            .body(data)
                            .unwrap());
                        return;
                    }
                    Err(_) => {
                        responder.respond(tauri::http::Response::builder()
                            .status(500).body(b"Read error".to_vec()).unwrap());
                        return;
                    }
                }
            }

            let (start, end) = match range {
                Some((s, e)) => {
                    let clamped_end = s.saturating_add(MAX_CHUNK - 1).min(e);
                    (s, clamped_end)
                }
                None => (0, MAX_CHUNK.min(file_size) - 1),
            };

            let length = end - start + 1;
            let mut file = match std::fs::File::open(&file_path) {
                Ok(f) => f,
                Err(_) => {
                    responder.respond(tauri::http::Response::builder()
                        .status(500).body(b"Read error".to_vec()).unwrap());
                    return;
                }
            };
            let _ = file.seek(SeekFrom::Start(start));
            let mut buf = vec![0u8; length as usize];
            let bytes_read = file.read(&mut buf).unwrap_or(0);
            buf.truncate(bytes_read);

            responder.respond(tauri::http::Response::builder()
                .status(206)
                .header("Content-Type", mime)
                .header("Content-Length", bytes_read.to_string())
                .header("Content-Range", format!("bytes {}-{}/{}", start, start + bytes_read as u64 - 1, file_size))
                .header("Accept-Ranges", "bytes")
                .body(buf)
                .unwrap());
            }); // end thread
        })
        .manage(AppState {
            vault: vault_arc.clone(),
        })
        .invoke_handler(tauri::generate_handler![
            hide_files,
            hide_files_batch,
            list_files,
            unhide_file,
            unhide_files,
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
            get_cached_thumb_ids,
            generate_thumbs_batch,
            get_file_preview_chunk,
            save_thumb_data,
            get_missing_video_thumb_ids,
            has_thumbnail,
            get_storage_info,
            list_folder_files,
            write_file,
            read_file,
            read_bg_file,
            read_vault_file_as_data_url,
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
