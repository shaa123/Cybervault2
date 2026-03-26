use crate::{VaultFile, VaultStats};
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

/// Obfuscated directory names that look like system folders
const DECOY_DIRS: &[&str] = &[
    "$WINDOWS.~BT", "$WinREAgent", "PerfLogs", "System Volume Information",
    "$Recycle.Bin", "Config.Msi", "MSOCache", "Recovery",
    "ProgramData", "Intel", "AMD", "NVIDIA",
    "Windows.old", "bootmgr.tmp", "hiberfil.sys.tmp",
    "swapfile.sys.bak", "pagefile.sys.tmp", "ntldr.old",
    ".cache", ".thumbnails", ".local", ".config",
    "__pycache__", "node_modules", ".git", ".svn",
    "AppData", "Application Data", "Local Settings",
    ".Trash-1000", "lost+found", ".dbus", ".gvfs",
];

/// Fake file extensions to disguise hidden files
const FAKE_EXTENSIONS: &[&str] = &[
    ".sys", ".dll", ".drv", ".tmp", ".log", ".dat",
    ".etl", ".evt", ".nls", ".mui", ".cat",
];

#[derive(Serialize, Deserialize, Clone)]
struct VaultEntry {
    id: String,
    original_name: String,
    category: String,
    size: u64,
    hidden_at: String,
    hidden_path: String,
    mime_hint: String,
    original_category: Option<String>,
    #[serde(default)]
    tag: String,
}

#[derive(Serialize, Deserialize)]
struct VaultIndex {
    entries: HashMap<String, VaultEntry>,
}

pub struct VaultManager {
    vault_root: PathBuf,
    index: VaultIndex,
    index_path: PathBuf,
}

impl VaultManager {
    pub fn new() -> Result<Self, String> {
        let vault_root = Self::get_vault_root()?;
        fs::create_dir_all(&vault_root).map_err(|e| e.to_string())?;

        // Migrate from old paths that used ".." components
        Self::migrate_old_vault(&vault_root);

        let index_path = vault_root.join(".vault_idx");
        let index = if index_path.exists() {
            let data = fs::read_to_string(&index_path).map_err(|e| e.to_string())?;
            // Index is stored with bytes shifted
            let decoded = Self::deobfuscate_index(&data);
            serde_json::from_str(&decoded).unwrap_or(VaultIndex {
                entries: HashMap::new(),
            })
        } else {
            VaultIndex {
                entries: HashMap::new(),
            }
        };

        Ok(Self {
            vault_root,
            index,
            index_path,
        })
    }

    fn migrate_old_vault(new_root: &Path) {
        // Check for index in all previous vault paths and copy it over
        let new_idx = new_root.join(".vault_idx");
        if new_idx.exists() {
            return; // Already migrated or fresh install
        }

        let old_paths: Vec<PathBuf> = {
            #[cfg(target_os = "windows")]
            {
                let local = std::env::var("LOCALAPPDATA").unwrap_or_default();
                vec![
                    PathBuf::from(&local).join("Microsoft\\Windows\\INetCache\\Content.MSO\\SystemTelemetry\\DiagTrack\\.cybervault_store"),
                    PathBuf::from(&local).join("Microsoft\\Windows\\INetCache\\Content.MSO\\SystemTelemetry\\DiagTrack\\cache"),
                ]
            }
            #[cfg(not(target_os = "windows"))]
            {
                let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
                vec![
                    PathBuf::from(&home).join(".local/share/.cache/.thumbnails/.dbus-monitor/.gvfs-metadata/.cybervault_store"),
                    PathBuf::from(&home).join(".local/share/.cache/.thumbnails/.dbus-monitor/.gvfs-metadata"),
                ]
            }
        };

        for old_root in old_paths {
            let old_idx = old_root.join(".vault_idx");
            if old_idx.exists() {
                let _ = fs::copy(&old_idx, &new_idx);
                return;
            }
        }
    }

    fn get_vault_root() -> Result<PathBuf, String> {
        // Use %APPDATA% on Windows, ~/.config on Linux — these always exist
        #[cfg(target_os = "windows")]
        {
            let app_data = std::env::var("APPDATA")
                .unwrap_or_else(|_| {
                    std::env::var("USERPROFILE")
                        .unwrap_or_else(|_| "C:\\Users\\Public".to_string())
                        + "\\AppData\\Roaming"
                });
            let root = PathBuf::from(app_data)
                .join(".cybervault");
            Ok(root)
        }
        #[cfg(not(target_os = "windows"))]
        {
            let home = std::env::var("HOME")
                .unwrap_or_else(|_| "/tmp".to_string());
            let root = PathBuf::from(home)
                .join(".config")
                .join(".cybervault");
            Ok(root)
        }
    }

    /// Generate a deeply nested obfuscated path for hiding a file
    fn generate_hidden_path(&self) -> PathBuf {
        let mut rng = rand::thread_rng();
        let depth = rng.gen_range(4..8);
        let mut path = self.vault_root.clone();

        for _ in 0..depth {
            let dir_name = DECOY_DIRS[rng.gen_range(0..DECOY_DIRS.len())];
            let suffix: u16 = rng.gen_range(0..9999);
            path = path.join(format!("{}.{:04}", dir_name, suffix));
        }

        path
    }

    /// Generate a fake system filename
    fn generate_fake_name(&self) -> String {
        let mut rng = rand::thread_rng();
        let prefixes = [
            "ntoskrnl", "csrss", "svchost", "wininit", "lsass",
            "services", "smss", "dwm", "winlogon", "taskhostw",
            "dllhost", "sihost", "fontdrvhost", "ctfmon",
        ];
        let prefix = prefixes[rng.gen_range(0..prefixes.len())];
        let ext = FAKE_EXTENSIONS[rng.gen_range(0..FAKE_EXTENSIONS.len())];
        let hash: u64 = rng.gen();
        format!("{}_{:016x}{}", prefix, hash, ext)
    }

    fn obfuscate_index(data: &str) -> String {
        // Simple byte-shift obfuscation for the index file
        data.bytes().map(|b| (b.wrapping_add(47)) as char).collect()
    }

    fn deobfuscate_index(data: &str) -> String {
        data.bytes().map(|b| (b.wrapping_sub(47)) as char).collect()
    }

    fn save_index(&self) -> Result<(), String> {
        let json = serde_json::to_string(&self.index).map_err(|e| e.to_string())?;
        let obfuscated = Self::obfuscate_index(&json);
        fs::write(&self.index_path, obfuscated).map_err(|e| e.to_string())?;

        // Set hidden attribute on Windows
        #[cfg(target_os = "windows")]
        {
            use std::process::Command;
            let _ = Command::new("attrib")
                .args(["+H", "+S", &self.index_path.to_string_lossy()])
                .output();
        }

        Ok(())
    }

    fn guess_mime(name: &str) -> String {
        let lower = name.to_lowercase();
        if lower.ends_with(".jpg") || lower.ends_with(".jpeg") || lower.ends_with(".png")
            || lower.ends_with(".gif") || lower.ends_with(".bmp") || lower.ends_with(".webp")
            || lower.ends_with(".svg") || lower.ends_with(".ico") || lower.ends_with(".tiff")
        {
            "image".to_string()
        } else if lower.ends_with(".mp4") || lower.ends_with(".avi") || lower.ends_with(".mkv")
            || lower.ends_with(".mov") || lower.ends_with(".wmv") || lower.ends_with(".flv")
            || lower.ends_with(".webm")
        {
            "video".to_string()
        } else if lower.ends_with(".pdf") || lower.ends_with(".doc") || lower.ends_with(".docx")
            || lower.ends_with(".xls") || lower.ends_with(".xlsx") || lower.ends_with(".ppt")
            || lower.ends_with(".pptx") || lower.ends_with(".txt") || lower.ends_with(".rtf")
            || lower.ends_with(".csv") || lower.ends_with(".odt")
        {
            "document".to_string()
        } else {
            "document".to_string()
        }
    }

    pub fn hide_file(&mut self, source_path: &str, category: &str) -> Result<VaultFile, String> {
        let source = Path::new(source_path);
        if !source.exists() {
            return Err(format!("File not found: {}", source_path));
        }

        let original_name = source
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        let metadata = fs::metadata(source).map_err(|e| e.to_string())?;
        let size = metadata.len();

        let mime_hint = Self::guess_mime(&original_name);
        let cat = if category == "auto" { &mime_hint } else { category };

        let hidden_dir = self.generate_hidden_path();
        fs::create_dir_all(&hidden_dir).map_err(|e| e.to_string())?;

        let fake_name = self.generate_fake_name();
        let hidden_path = hidden_dir.join(&fake_name);

        // Move the file (fast, no copy needed on same filesystem)
        fs::rename(source, &hidden_path).or_else(|_| {
            // Fallback: copy + delete if rename fails (cross-filesystem)
            fs::copy(source, &hidden_path)
                .and_then(|_| fs::remove_file(source))
                .map(|_| ())
        }).map_err(|e| format!("Failed to hide file: {}", e))?;

        // Set hidden/system attributes on Windows
        #[cfg(target_os = "windows")]
        {
            use std::process::Command;
            let _ = Command::new("attrib")
                .args(["+H", "+S", &hidden_path.to_string_lossy()])
                .output();
            // Also hide all parent directories
            let mut dir = hidden_dir.clone();
            while dir != self.vault_root {
                let _ = Command::new("attrib")
                    .args(["+H", "+S", &dir.to_string_lossy()])
                    .output();
                if let Some(parent) = dir.parent() {
                    dir = parent.to_path_buf();
                } else {
                    break;
                }
            }
        }

        let id = Uuid::new_v4().to_string();
        let now = chrono_now();

        let entry = VaultEntry {
            id: id.clone(),
            original_name: original_name.clone(),
            category: cat.to_string(),
            size,
            hidden_at: now.clone(),
            hidden_path: hidden_path.to_string_lossy().to_string(),
            mime_hint: mime_hint.clone(),
            original_category: None,
            tag: String::new(),
        };

        self.index.entries.insert(id.clone(), entry);
        self.save_index()?;

        Ok(VaultFile {
            id,
            original_name,
            category: cat.to_string(),
            size,
            hidden_at: now,
            mime_hint,
            tag: String::new(),
        })
    }

    pub fn list_files(&self, category: &str) -> Vec<VaultFile> {
        self.index
            .entries
            .values()
            .filter(|e| {
                if category == "all" {
                    e.category != "trash"
                } else {
                    e.category == category
                }
            })
            .map(|e| VaultFile {
                id: e.id.clone(),
                original_name: e.original_name.clone(),
                category: e.category.clone(),
                size: e.size,
                hidden_at: e.hidden_at.clone(),
                mime_hint: e.mime_hint.clone(),
                tag: e.tag.clone(),
            })
            .collect()
    }

    pub fn set_file_tag(&mut self, file_id: &str, tag: &str) -> Result<(), String> {
        let entry = self.index.entries.get_mut(file_id)
            .ok_or("File not found in vault")?;
        entry.tag = tag.to_string();
        self.save_index()
    }

    pub fn set_files_tag(&mut self, file_ids: &[String], tag: &str) -> Result<(), String> {
        for id in file_ids {
            if let Some(entry) = self.index.entries.get_mut(id.as_str()) {
                entry.tag = tag.to_string();
            }
        }
        self.save_index()
    }

    pub fn list_tags(&self, category: &str) -> Vec<String> {
        let mut tags: Vec<String> = self.index.entries.values()
            .filter(|e| e.category == category && !e.tag.is_empty())
            .map(|e| e.tag.clone())
            .collect::<std::collections::HashSet<_>>()
            .into_iter()
            .collect();
        tags.sort();
        tags
    }

    pub fn unhide_file(&mut self, file_id: &str, destination: &str) -> Result<(), String> {
        let entry = self.index.entries.get(file_id)
            .ok_or("File not found in vault")?
            .clone();

        let hidden = Path::new(&entry.hidden_path);
        if !hidden.exists() {
            self.index.entries.remove(file_id);
            self.save_index()?;
            return Err("Hidden file no longer exists".to_string());
        }

        let dest = Path::new(destination).join(&entry.original_name);

        fs::rename(hidden, &dest).or_else(|_| {
            fs::copy(hidden, &dest)
                .and_then(|_| fs::remove_file(hidden))
                .map(|_| ())
        }).map_err(|e| format!("Failed to unhide: {}", e))?;

        // Cleanup empty parent dirs
        self.cleanup_empty_dirs(&entry.hidden_path);

        self.index.entries.remove(file_id);
        self.save_index()?;
        Ok(())
    }

    pub fn move_to_trash(&mut self, file_id: &str) -> Result<(), String> {
        let entry = self.index.entries.get_mut(file_id)
            .ok_or("File not found in vault")?;
        entry.original_category = Some(entry.category.clone());
        entry.category = "trash".to_string();
        self.save_index()
    }

    pub fn restore_from_trash(&mut self, file_id: &str) -> Result<(), String> {
        let entry = self.index.entries.get_mut(file_id)
            .ok_or("File not found in vault")?;
        if entry.category != "trash" {
            return Err("File is not in trash".to_string());
        }
        let original = entry.original_category.clone().unwrap_or("document".to_string());
        entry.category = original;
        entry.original_category = None;
        self.save_index()
    }

    pub fn purge_trash(&mut self) -> Result<(), String> {
        let trash_ids: Vec<String> = self.index.entries
            .iter()
            .filter(|(_, e)| e.category == "trash")
            .map(|(id, _)| id.clone())
            .collect();

        for id in trash_ids {
            if let Some(entry) = self.index.entries.remove(&id) {
                let path = Path::new(&entry.hidden_path);
                if path.exists() {
                    let _ = fs::remove_file(path);
                    self.cleanup_empty_dirs(&entry.hidden_path);
                }
            }
        }
        self.save_index()
    }

    pub fn get_stats(&self) -> VaultStats {
        let mut stats = VaultStats {
            total_files: 0,
            images: 0,
            videos: 0,
            documents: 0,
            notes: 0,
            trash: 0,
        };

        for entry in self.index.entries.values() {
            stats.total_files += 1;
            match entry.category.as_str() {
                "image" => stats.images += 1,
                "video" => stats.videos += 1,
                "document" => stats.documents += 1,
                "note" => stats.notes += 1,
                "trash" => stats.trash += 1,
                _ => stats.documents += 1,
            }
        }
        stats
    }

    pub fn get_file_base64(&self, file_id: &str) -> Result<String, String> {
        let entry = self.index.entries.get(file_id)
            .ok_or("File not found")?;

        let data = fs::read(&entry.hidden_path).map_err(|e| e.to_string())?;
        use base64::Engine;
        Ok(base64::engine::general_purpose::STANDARD.encode(&data))
    }

    pub fn save_note(&mut self, title: &str, content: &str) -> Result<VaultFile, String> {
        let hidden_dir = self.generate_hidden_path();
        fs::create_dir_all(&hidden_dir).map_err(|e| e.to_string())?;

        let fake_name = self.generate_fake_name();
        let hidden_path = hidden_dir.join(&fake_name);

        fs::write(&hidden_path, content.as_bytes()).map_err(|e| e.to_string())?;

        let id = Uuid::new_v4().to_string();
        let now = chrono_now();
        let size = content.len() as u64;

        let entry = VaultEntry {
            id: id.clone(),
            original_name: format!("{}.txt", title),
            category: "note".to_string(),
            size,
            hidden_at: now.clone(),
            hidden_path: hidden_path.to_string_lossy().to_string(),
            mime_hint: "text".to_string(),
            original_category: None,
            tag: String::new(),
        };

        self.index.entries.insert(id.clone(), entry);
        self.save_index()?;

        Ok(VaultFile {
            id,
            original_name: format!("{}.txt", title),
            category: "note".to_string(),
            size,
            hidden_at: now,
            mime_hint: "text".to_string(),
            tag: String::new(),
        })
    }

    pub fn read_note(&self, file_id: &str) -> Result<String, String> {
        let entry = self.index.entries.get(file_id)
            .ok_or("Note not found")?;
        fs::read_to_string(&entry.hidden_path).map_err(|e| e.to_string())
    }

    fn cleanup_empty_dirs(&self, file_path: &str) {
        let mut dir = Path::new(file_path).parent().map(|p| p.to_path_buf());
        while let Some(d) = dir {
            if d == self.vault_root || !d.starts_with(&self.vault_root) {
                break;
            }
            if fs::read_dir(&d).map(|mut r| r.next().is_none()).unwrap_or(false) {
                let _ = fs::remove_dir(&d);
            } else {
                break;
            }
            dir = d.parent().map(|p| p.to_path_buf());
        }
    }
}

fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = duration.as_secs();
    // Format as ISO-ish timestamp
    let days = secs / 86400;
    let years = 1970 + days / 365;
    let remaining_days = days % 365;
    let months = remaining_days / 30 + 1;
    let day = remaining_days % 30 + 1;
    let hours = (secs % 86400) / 3600;
    let minutes = (secs % 3600) / 60;
    let seconds = secs % 60;
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}",
        years, months, day, hours, minutes, seconds
    )
}
