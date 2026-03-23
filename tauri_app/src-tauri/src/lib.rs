use directories::UserDirs;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::process::Command;
use sysinfo::System;
use walkdir::WalkDir;
use configparser::ini::Ini;

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
    "../manager_data.ini".to_string()
}

fn load_metadata() -> ManagerMetadata {
    let mut metadata = ManagerMetadata {
        tags: HashMap::new(),
        hidden_folders: Vec::new(),
    };

    let ini_path = get_ini_path();
    let mut config = Ini::new();
    
    if let Ok(sections) = config.load(ini_path) {
        // Parse tags
        if let Some(tags_section) = sections.get("scripttags") {
            for (path, tags_option) in tags_section {
                if let Some(tags_str) = tags_option {
                    let tags: Vec<String> = tags_str.split(',')
                        .map(|s| s.trim().to_string())
                        .filter(|s| !s.is_empty())
                        .collect();
                    metadata.tags.insert(path.to_string(), tags);
                }
            }
        }
        // Parse hidden folders
        if let Some(hidden_section) = sections.get("hiddenfolders") {
            for (path, _) in hidden_section {
                metadata.hidden_folders.push(path.to_string());
            }
        }
    }
    metadata
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
    
    // Add Desktop
    if let Some(user_dirs) = UserDirs::new() {
        if let Some(desktop) = user_dirs.desktop_dir() {
            scan_dirs.push(desktop.to_path_buf());
        }
    }
    
    // Add parent folder of the app
    scan_dirs.push(std::path::PathBuf::from(".."));

    for dir in scan_dirs {
        for entry in WalkDir::new(&dir).into_iter().filter_map(|e| e.ok()) {
            if entry.path().extension().map_or(false, |ext| ext == "ahk") {
                let path_buf = entry.path().to_path_buf();
                let path_str = path_buf.to_string_lossy().to_string();
                let path_lower = path_str.to_lowercase();
                
                let filename = entry.file_name().to_string_lossy().to_string();
                let parent = entry.path().parent().map_or("".to_string(), |p| p.file_name().map_or("".to_string(), |f| f.to_string_lossy().to_string()));
                
                // Try to find tags (configparser lowers keys by default)
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
    
    // De-duplicate scripts by path
    scripts.sort_by(|a, b| a.path.cmp(&b.path));
    scripts.dedup_by(|a, b| a.path == b.path);
    
    scripts
}

#[tauri::command]
fn run_script(path: String) -> Result<(), String> {
    Command::new("explorer")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_scripts,
            run_script,
            kill_script
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
