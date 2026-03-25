use directories::UserDirs;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::process::Command;
use sysinfo::System;
use walkdir::WalkDir;

#[derive(Serialize, Deserialize, Clone)]
struct Script {
    path: String,
    filename: String,
    parent: String,
    tags: Vec<String>,
    is_hidden: bool,
    is_running: bool,
}

#[derive(Serialize, Deserialize)]
struct ManagerMetadata {
    tags: HashMap<String, Vec<String>>, // Path -> Tags
    hidden_folders: Vec<String>,
}

fn get_ini_path() -> String {
    let target = "manager_data.ini";
    if std::path::Path::new(target).exists() {
        return target.to_string();
    }
    let p1 = format!("../{}", target);
    if std::path::Path::new(&p1).exists() {
        return p1;
    }
    let p2 = format!("../../{}", target);
    if std::path::Path::new(&p2).exists() {
        return p2;
    }
    p2
}

fn load_metadata() -> ManagerMetadata {
    let mut metadata = ManagerMetadata {
        tags: HashMap::new(),
        hidden_folders: Vec::new(),
    };

    let ini_path = get_ini_path();
    let bytes = match fs::read(&ini_path) {
        Ok(b) => b,
        Err(_) => return metadata,
    };

    let content = if bytes.len() >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE {
        let utf16: Vec<u16> = bytes[2..].chunks_exact(2).map(|a| u16::from_le_bytes([a[0], a[1]])).collect();
        String::from_utf16_lossy(&utf16)
    } else {
        String::from_utf8_lossy(&bytes).to_string()
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
            
            if current_section == "scripts" {
                let tags: Vec<String> = val.split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect();
                metadata.tags.insert(key.to_lowercase(), tags);
            } else if current_section == "hiddenfolders" {
                if !key.is_empty() {
                    metadata.hidden_folders.push(key.to_lowercase());
                }
            }
        }
    }
    metadata
}

#[tauri::command]
fn save_script_tags(path: String, tags: Vec<String>) -> Result<(), String> {
    save_script_tags_internal(path, tags)
}

fn save_script_tags_internal(path: String, tags: Vec<String>) -> Result<(), String> {
    let ini_path = get_ini_path();
    let bytes = fs::read(&ini_path).unwrap_or_default();
    let content = if bytes.len() >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE {
        let utf16: Vec<u16> = bytes[2..].chunks_exact(2).map(|a| u16::from_le_bytes([a[0], a[1]])).collect();
        String::from_utf16_lossy(&utf16)
    } else {
        String::from_utf8_lossy(&bytes).to_string()
    };

    let mut lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();
    let mut in_scripts = false;
    let mut found_key = false;
    let path_lower = path.to_lowercase();
    let new_entry = format!("{}={}", path, tags.join(","));

    for line in lines.iter_mut() {
        let trimmed = line.trim();
        if trimmed.to_lowercase() == "[scripts]" {
            in_scripts = true;
            continue;
        }
        if trimmed.starts_with('[') {
            in_scripts = false;
            continue;
        }
        
        if in_scripts {
            if let Some(pos) = trimmed.find('=') {
                if trimmed[..pos].trim().to_lowercase() == path_lower {
                    *line = new_entry.clone();
                    found_key = true;
                    break;
                }
            }
        }
    }

    if !found_key {
        let scripts_idx = lines.iter().position(|l| l.trim().to_lowercase() == "[scripts]");
        if let Some(idx) = scripts_idx {
            lines.insert(idx + 1, new_entry);
        } else {
            lines.push("[Scripts]".to_string());
            lines.push(new_entry);
        }
    }

    fs::write(&ini_path, lines.join("\r\n")).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_scripts() -> Vec<Script> {
    let mut sys = System::new_all();
    sys.refresh_all();
    
    let metadata = load_metadata();
    let mut running_cmds = Vec::new();
    for (_pid, process) in sys.processes() {
        let name = process.name().to_string_lossy().to_lowercase();
        if name.contains("autohotkey") {
            let cmd: Vec<String> = process.cmd().iter().map(|s| s.to_string_lossy().into_owned()).collect();
            running_cmds.push(cmd.join(" ").to_lowercase());
        }
    }

    let mut scripts = Vec::new();
    let mut scan_dirs = Vec::new();
    
    if let Some(user_dirs) = UserDirs::new() {
        if let Some(desktop) = user_dirs.desktop_dir() {
            scan_dirs.push(desktop.to_path_buf());
        }
    }
    scan_dirs.push(std::path::PathBuf::from(".."));

    for dir in scan_dirs {
        for entry in WalkDir::new(&dir).into_iter().filter_map(|e| e.ok()) {
            if entry.path().extension().map_or(false, |ext| ext == "ahk") {
                let path_buf = entry.path().to_path_buf();
                let path_str = path_buf.to_string_lossy().to_string();
                let path_lower = path_str.to_lowercase();
                
                let filename = entry.file_name().to_string_lossy().to_string();
                let parent = entry.path().parent().map_or("".to_string(), |p| p.file_name().map_or("".to_string(), |f| f.to_string_lossy().to_string()));
                
                let tags = metadata.tags.get(&path_lower).cloned().unwrap_or_default();
                let is_hidden = metadata.hidden_folders.iter().any(|h| path_lower.contains(&h.to_lowercase()));
                let is_running = running_cmds.iter().any(|cmd| cmd.contains(&path_lower));

                scripts.push(Script {
                    path: path_str,
                    filename,
                    parent,
                    tags,
                    is_hidden,
                    is_running,
                });
            }
        }
    }
    scripts.sort_by(|a, b| a.path.cmp(&b.path));
    scripts.dedup_by(|a, b| a.path == b.path);
    scripts
}

#[tauri::command]
fn run_script(path: String) -> Result<(), String> {
    Command::new("explorer").arg(&path).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn kill_script(path: String) -> Result<(), String> {
    let mut sys = System::new_all();
    sys.refresh_all();
    let path_lower = path.to_lowercase();
    for (_pid, process) in sys.processes() {
        let name = process.name().to_string_lossy().to_lowercase();
        if name.contains("autohotkey") {
            let cmd: Vec<String> = process.cmd().iter().map(|s| s.to_string_lossy().into_owned()).collect();
            let cmd_str = cmd.join(" ").to_lowercase();
            if cmd_str.contains(&path_lower) {
                process.kill();
            }
        }
    }
    Ok(())
}

#[tauri::command]
fn open_in_explorer(path: String) -> Result<(), String> {
    // On Windows, use "explorer /select," to highlight the file
    let path_buf = std::path::PathBuf::from(&path);
    if path_buf.exists() {
        Command::new("explorer")
            .arg("/select,")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn edit_script(path: String) -> Result<(), String> {
    // Open in default editor using the 'Edit' verb
    Command::new("powershell")
        .arg("-NoProfile")
        .arg("-Command")
        .arg(format!("Start-Process -FilePath '{}' -Verb Edit", path))
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn add_script_tag(path: String, tag: String) -> Result<(), String> {
    let metadata = load_metadata();
    let key = path.to_lowercase();
    let mut tags = metadata.tags.get(&key).cloned().unwrap_or_default();
    
    if !tags.iter().any(|t| t.to_lowercase() == tag.to_lowercase()) {
        tags.push(tag);
        return save_script_tags_internal(path, tags);
    }
    Ok(())
}

#[tauri::command]
fn rename_tag(old_tag: String, new_tag: String) -> Result<(), String> {
    let metadata = load_metadata();
    let ini_path = get_ini_path();
    let bytes = fs::read(&ini_path).unwrap_or_default();
    let content = if bytes.len() >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE {
        let utf16: Vec<u16> = bytes[2..].chunks_exact(2).map(|a| u16::from_le_bytes([a[0], a[1]])).collect();
        String::from_utf16_lossy(&utf16)
    } else {
        String::from_utf8_lossy(&bytes).to_string()
    };

    let mut lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();
    let mut in_scripts = false;
    let old_lower = old_tag.to_lowercase();

    for line in lines.iter_mut() {
        let trimmed = line.trim();
        if trimmed.to_lowercase() == "[scripts]" {
            in_scripts = true;
            continue;
        }
        if trimmed.starts_with('[') {
            in_scripts = false;
            continue;
        }

        if in_scripts {
            if let Some(pos) = line.find('=') {
                let key = &line[..pos];
                let val = &line[pos+1..];
                let mut tags: Vec<String> = val.split(',')
                    .map(|s| s.trim().to_string())
                    .collect();
                
                let mut changed = false;
                for tag in tags.iter_mut() {
                    if tag.to_lowercase() == old_lower {
                        *tag = new_tag.clone();
                        changed = true;
                    }
                }

                if changed {
                    tags.dedup_by(|a, b| a.to_lowercase() == b.to_lowercase());
                    *line = format!("{}={}", key, tags.join(","));
                }
            }
        }
    }

    fs::write(&ini_path, lines.join("\r\n")).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn save_tag_order(order: Vec<String>) -> Result<(), String> {
    let ini_path = get_ini_path();
    let bytes = fs::read(&ini_path).unwrap_or_default();
    let content = String::from_utf8_lossy(&bytes).to_string();
    let mut lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();
    
    let section_header = "[General]";
    let key_prefix = "tag_order=";
    let new_entry = format!("{}{}", key_prefix, order.join(","));
    
    let mut section_found = false;
    let mut key_found = false;
    
    for i in 0..lines.len() {
        let trimmed = lines[i].trim();
        if trimmed.to_lowercase() == section_header.to_lowercase() {
            section_found = true;
            continue;
        }
        if section_found && trimmed.starts_with('[') {
            // End of section, insert key before this
            lines.insert(i, new_entry.clone());
            key_found = true;
            break;
        }
        if section_found && trimmed.to_lowercase().starts_with(key_prefix) {
            lines[i] = new_entry.clone();
            key_found = true;
            break;
        }
    }
    
    if !section_found {
        lines.push(section_header.to_string());
        lines.push(new_entry);
    } else if !key_found {
        // If section was found but key wasn't, find section index again
        if let Some(idx) = lines.iter().position(|l| l.trim().to_lowercase() == section_header.to_lowercase()) {
            lines.insert(idx + 1, new_entry);
        }
    }
    
    fs::write(&ini_path, lines.join("\r\n")).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_tag_order() -> Vec<String> {
    let ini_path = get_ini_path();
    let content = fs::read_to_string(&ini_path).unwrap_or_default();
    let mut in_general = false;
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.to_lowercase() == "[general]" {
            in_general = true;
            continue;
        }
        if trimmed.starts_with('[') {
            in_general = false;
            continue;
        }
        if in_general && trimmed.to_lowercase().starts_with("tag_order=") {
            if let Some(pos) = line.find('=') {
                return line[pos+1..].split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect();
            }
        }
    }
    Vec::new()
}

#[tauri::command]
fn delete_tag(tag: String) -> Result<(), String> {
    let ini_path = get_ini_path();
    let bytes = fs::read(&ini_path).unwrap_or_default();
    let content = if bytes.len() >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE {
        let utf16: Vec<u16> = bytes[2..].chunks_exact(2).map(|a| u16::from_le_bytes([a[0], a[1]])).collect();
        String::from_utf16_lossy(&utf16)
    } else {
        String::from_utf8_lossy(&bytes).to_string()
    };

    let mut lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();
    let mut in_scripts = false;
    let mut in_general = false;
    let target_lower = tag.to_lowercase();

    for line in lines.iter_mut() {
        let trimmed = line.trim();
        let trimmed_lower = trimmed.to_lowercase();
        
        if trimmed_lower == "[scripts]" {
            in_scripts = true;
            in_general = false;
            continue;
        }
        if trimmed_lower == "[general]" {
            in_general = true;
            in_scripts = false;
            continue;
        }
        if trimmed.starts_with('[') {
            in_scripts = false;
            in_general = false;
            continue;
        }

        if in_scripts {
             if let Some(pos) = line.find('=') {
                let key = &line[..pos];
                let val = &line[pos+1..];
                let mut tags: Vec<String> = val.split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty() && s.to_lowercase() != target_lower)
                    .collect();
                *line = format!("{}={}", key, tags.join(","));
             }
        } else if in_general && trimmed_lower.starts_with("tag_order=") {
            if let Some(pos) = line.find('=') {
                let prefix = &line[..pos+1];
                let val = &line[pos+1..];
                let mut tags: Vec<String> = val.split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty() && s.to_lowercase() != target_lower)
                    .collect();
                *line = format!("{}{}", prefix, tags.join(","));
            }
        }
    }

    fs::write(&ini_path, lines.join("\r\n")).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_scripts,
            run_script,
            kill_script,
            save_script_tags,
            add_script_tag,
            rename_tag,
            save_tag_order,
            get_tag_order,
            open_in_explorer,
            edit_script,
            delete_tag
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
