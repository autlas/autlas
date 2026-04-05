use rusqlite::Connection;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use crate::db;

/// Get the INI path (same logic as the old get_ini_path)
fn get_ini_path() -> PathBuf {
    use directories::ProjectDirs;
    if let Some(proj_dirs) = ProjectDirs::from("com", "heavym", "ahkmanager") {
        let config_dir = proj_dirs.config_dir();
        let _ = fs::create_dir_all(config_dir);
        config_dir.join("manager_data.ini")
    } else {
        PathBuf::from("manager_data.ini")
    }
}

struct IniData {
    /// path (original case) -> tags
    script_tags: Vec<(String, Vec<String>)>,
    hidden_folders: Vec<String>,
    scan_paths: Vec<String>,
    tag_order: Vec<String>,
    tag_icons: HashMap<String, String>,
    close_to_tray: Option<bool>,
}

fn parse_ini() -> Option<IniData> {
    let ini_path = get_ini_path();
    let bytes = fs::read(&ini_path).ok()?;
    if bytes.is_empty() { return None; }

    let content = if bytes.len() >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE {
        let utf16: Vec<u16> = bytes[2..].chunks_exact(2).map(|a| u16::from_le_bytes([a[0], a[1]])).collect();
        String::from_utf16_lossy(&utf16)
    } else {
        String::from_utf8_lossy(&bytes).to_string()
    };

    let mut data = IniData {
        script_tags: Vec::new(),
        hidden_folders: Vec::new(),
        scan_paths: Vec::new(),
        tag_order: Vec::new(),
        tag_icons: HashMap::new(),
        close_to_tray: None,
    };

    let mut current_section = String::new();

    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with(';') { continue; }

        if line.starts_with('[') && line.ends_with(']') {
            current_section = line[1..line.len()-1].to_lowercase();
            continue;
        }

        if let Some(pos) = line.find('=') {
            let key = line[..pos].trim();
            let val = line[pos+1..].trim();

            match current_section.as_str() {
                "scripts" => {
                    let tags: Vec<String> = val.split(',')
                        .map(|s| s.trim().to_string())
                        .filter(|s| !s.is_empty())
                        .collect();
                    if !key.is_empty() {
                        data.script_tags.push((key.to_string(), tags));
                    }
                }
                "hiddenfolders" => {
                    if !key.is_empty() {
                        data.hidden_folders.push(key.to_string());
                    }
                }
                "scanpaths" => {
                    if !key.is_empty() {
                        data.scan_paths.push(key.to_string());
                    }
                }
                "general" => {
                    if key.to_lowercase() == "tag_order" {
                        data.tag_order = val.split(',')
                            .map(|s| s.trim().to_string())
                            .filter(|s| !s.is_empty())
                            .collect();
                    }
                }
                "tagicons" => {
                    if !key.is_empty() && !val.is_empty() {
                        data.tag_icons.insert(key.to_string(), val.to_string());
                    }
                }
                "settings" => {
                    if key.to_lowercase() == "close_to_tray" {
                        data.close_to_tray = Some(val != "0" && val.to_lowercase() != "false");
                    }
                }
                _ => {}
            }
        }
    }

    Some(data)
}

/// Run migration from INI to SQLite. Returns true if migration happened.
pub fn migrate_if_needed(conn: &Connection) -> bool {
    // Check if migration already completed
    if let Some(val) = db::get_setting(conn, "migration_complete") {
        if val == "1" {
            return false;
        }
    }

    let ini_path = get_ini_path();
    if !ini_path.exists() {
        // No INI file — nothing to migrate, mark as complete
        let _ = db::set_setting(conn, "migration_complete", "1");
        return false;
    }

    let data = match parse_ini() {
        Some(d) => d,
        None => {
            let _ = db::set_setting(conn, "migration_complete", "1");
            return false;
        }
    };

    println!("[Migration] Starting INI → SQLite migration...");
    println!("[Migration]   Scripts: {}", data.script_tags.len());
    println!("[Migration]   Hidden folders: {}", data.hidden_folders.len());
    println!("[Migration]   Scan paths: {}", data.scan_paths.len());
    println!("[Migration]   Tag icons: {}", data.tag_icons.len());
    println!("[Migration]   Tag order: {} tags", data.tag_order.len());
    let now = db::now_iso();

    // Wrap in transaction
    let tx = match conn.execute_batch("BEGIN TRANSACTION") {
        Ok(_) => true,
        Err(e) => {
            println!("[Migration] Failed to begin transaction: {}", e);
            return false;
        }
    };

    if tx {
        let result = (|| -> Result<(), String> {
            // Migrate scripts and their tags
            for (path, tags) in &data.script_tags {
                let id = uuid::Uuid::new_v4().to_string();
                let path_buf = std::path::PathBuf::from(path);
                let filename = path_buf.file_name()
                    .map(|f| f.to_string_lossy().to_string())
                    .unwrap_or_default();
                let path_lower = path.to_lowercase();

                // Compute content hash if file exists
                let content_hash = db::compute_file_hash(&path_buf).unwrap_or_default();

                conn.execute(
                    "INSERT OR IGNORE INTO scripts (id, path, filename, content_hash, first_seen, last_seen)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
                    rusqlite::params![id, path_lower, filename, content_hash, now],
                ).map_err(|e| e.to_string())?;

                // Get the actual id (might be different if path already existed)
                let actual_id: String = conn.query_row(
                    "SELECT id FROM scripts WHERE path = ?1",
                    rusqlite::params![path_lower],
                    |row| row.get(0),
                ).map_err(|e| e.to_string())?;

                for tag in tags {
                    conn.execute(
                        "INSERT OR IGNORE INTO script_tags (script_id, tag) VALUES (?1, ?2)",
                        rusqlite::params![actual_id, tag],
                    ).map_err(|e| e.to_string())?;
                }
            }

            // Migrate hidden folders
            for folder in &data.hidden_folders {
                conn.execute(
                    "INSERT OR IGNORE INTO hidden_folders (path) VALUES (?1)",
                    rusqlite::params![folder],
                ).map_err(|e| e.to_string())?;
            }

            // Migrate scan paths
            for p in &data.scan_paths {
                conn.execute(
                    "INSERT OR IGNORE INTO scan_paths (path) VALUES (?1)",
                    rusqlite::params![p],
                ).map_err(|e| e.to_string())?;
            }

            // Migrate tag icons
            for (tag, icon) in &data.tag_icons {
                conn.execute(
                    "INSERT INTO tag_meta (tag, icon) VALUES (?1, ?2) ON CONFLICT(tag) DO UPDATE SET icon = ?2",
                    rusqlite::params![tag, icon],
                ).map_err(|e| e.to_string())?;
            }

            // Migrate tag order
            if !data.tag_order.is_empty() {
                for (i, tag) in data.tag_order.iter().enumerate() {
                    conn.execute(
                        "INSERT INTO tag_meta (tag, sort_order) VALUES (?1, ?2) ON CONFLICT(tag) DO UPDATE SET sort_order = ?2",
                        rusqlite::params![tag, i as i64],
                    ).map_err(|e| e.to_string())?;
                }
            }

            // Migrate settings
            if let Some(close_to_tray) = data.close_to_tray {
                db::set_setting(conn, "close_to_tray", if close_to_tray { "true" } else { "false" })
                    .map_err(|e| e.to_string())?;
            }

            // Mark migration complete
            db::set_setting(conn, "migration_complete", "1")
                .map_err(|e| e.to_string())?;

            Ok(())
        })();

        match result {
            Ok(()) => {
                let _ = conn.execute_batch("COMMIT");
                // Backup the INI file
                let backup_path = ini_path.with_extension("ini.bak");
                let _ = fs::copy(&ini_path, &backup_path);
                println!("[Migration] INI → SQLite migration completed successfully. Backup at {:?}", backup_path);
                true
            }
            Err(e) => {
                println!("[Migration] Migration failed: {}. Rolling back.", e);
                let _ = conn.execute_batch("ROLLBACK");
                false
            }
        }
    } else {
        false
    }
}
