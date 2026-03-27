use directories::UserDirs;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::process::Command;
use std::sync::Mutex;
use sysinfo::System;
use tauri::Emitter;
use walkdir::WalkDir;

// ── Managed state: single source of truth for tags, prevents race conditions ──
pub struct TagsState(pub Mutex<HashMap<String, Vec<String>>>);

#[derive(Serialize, Deserialize, Clone)]
struct Script {
    path: String,
    filename: String,
    parent: String,
    tags: Vec<String>,
    is_hidden: bool,
    is_running: bool,
    has_ui: bool,
}

#[derive(Serialize, Deserialize)]
struct ManagerMetadata {
    tags: HashMap<String, Vec<String>>, // Path -> Tags
    hidden_folders: Vec<String>,
}

fn get_ini_path() -> std::path::PathBuf {
    use directories::ProjectDirs;
    
    // Attempt to get persistent AppData location
    if let Some(proj_dirs) = ProjectDirs::from("com", "heavym", "ahkmanager") {
        let config_dir = proj_dirs.config_dir(); // C:\Users\<Usr>\AppData\Roaming\heavym\ahkmanager\config on Win
        let _ = std::fs::create_dir_all(config_dir);
        config_dir.join("manager_data.ini")
    } else {
        std::path::PathBuf::from("manager_data.ini")
    }
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
async fn save_script_tags(
    app: tauri::AppHandle,
    state: tauri::State<'_, TagsState>,
    path: String,
    tags: Vec<String>,
) -> Result<(), String> {
    save_tags_and_emit(&app, &state, path, tags)
}

fn save_tags_and_emit(
    app: &tauri::AppHandle,
    state: &tauri::State<'_, TagsState>,
    path: String,
    tags: Vec<String>,
) -> Result<(), String> {
    // Lock mutex: prevents concurrent writes from racing on the INI file
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    map.insert(path.to_lowercase(), tags.clone());
    drop(map); // release lock before doing I/O

    save_script_tags_internal(path.clone(), tags.clone())?;

    // Push event to frontend — instant update, no polling needed
    let _ = app.emit("script-tags-changed", serde_json::json!({ "path": path, "tags": tags }));
    Ok(())
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
async fn get_scripts() -> Vec<Script> {
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

                // Super fast static scan to see if the script supports AHK Manager UI triggers
                // ONLY DO THIS FOR RUNNING SCRIPTS to avoid slowing down the directory scan!
                let has_ui = if is_running {
                    if let Ok(content) = fs::read_to_string(&path_buf) {
                        let text = content.to_lowercase();
                        text.contains("0x0401") || text.contains("0x401")
                    } else {
                        false
                    }
                } else {
                    false
                };

                scripts.push(Script {
                    path: path_str,
                    filename,
                    parent,
                    tags,
                    is_hidden,
                    is_running,
                    has_ui,
                });
            }
        }
    }
    scripts.sort_by(|a, b| a.path.cmp(&b.path));
    scripts.dedup_by(|a, b| a.path == b.path);
    scripts
}

#[tauri::command]
async fn run_script(path: String) -> Result<(), String> {
    Command::new("explorer").arg(&path).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn kill_script(path: String) -> Result<(), String> {
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
async fn restart_script(path: String) -> Result<(), String> {
    // 1. Kill the script
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
    
    // 2. Wait a bit for the process to fully close
    std::thread::sleep(std::time::Duration::from_millis(150));
    
    // 3. Run it again
    Command::new("explorer").arg(&path).spawn().map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
async fn show_script_ui(path: String) -> Result<(), String> {
    println!("[show_script_ui] Request for path: {}", path);
    let mut sys = System::new_all();
    sys.refresh_all();
    let path_lower = path.to_lowercase().replace("/", "\\");
    
    for (pid, process) in sys.processes() {
        let name = process.name().to_string_lossy().to_lowercase();
        if name.contains("autohotkey") {
            let cmd: Vec<String> = process.cmd().iter().map(|s| s.to_string_lossy().into_owned()).collect();
            let cmd_str = cmd.join(" ").to_lowercase().replace("/", "\\");
            
            if cmd_str.contains(&path_lower) {
                let pid_val = pid.as_u32();
                println!("[show_script_ui] Found matching process PID: {}", pid_val);
                
                // Ultimate foolproof solution: C# implementation compiled by PowerShell.
                // 1. Move the EnumWindows loop entirely into C# to bypass PowerShell callback scope limits.
                // 2. The C# class stores the target PID, enumerates windows natively, and calls PostMessage.
                let ps_script = format!(
                    "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class Win32 {{ \
                        [DllImport(\"user32.dll\")] public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam); \
                        [DllImport(\"user32.dll\")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId); \
                        public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam); \
                        [DllImport(\"user32.dll\")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam); \
                        private static uint TargetPid; \
                        private static int Count; \
                        public static int TriggerAhkUi(uint pid) {{ \
                            TargetPid = pid; Count = 0; \
                            EnumWindows(EnumProc, IntPtr.Zero); \
                            return Count; \
                        }} \
                        private static bool EnumProc(IntPtr hWnd, IntPtr lParam) {{ \
                            uint pId; \
                            GetWindowThreadProcessId(hWnd, out pId); \
                            if (pId == TargetPid) {{ \
                                PostMessage(hWnd, 0x0401, IntPtr.Zero, IntPtr.Zero); \
                                Count++; \
                            }} \
                            return true; \
                        }} \
                     }}'; \
                     $c = [Win32]::TriggerAhkUi({}); \
                     if ($c -gt 0) {{ Write-Output \"Sent message to $c windows for PID {}\"; }} else {{ Write-Error \"No windows found for PID {}\"; }}",
                    pid_val, pid_val, pid_val
                );
                
                let output = Command::new("powershell")
                    .arg("-NoProfile")
                    .arg("-Command")
                    .arg(ps_script)
                    .output()
                    .map_err(|e| e.to_string())?;
                
                println!("[show_script_ui] PS Output: {}", String::from_utf8_lossy(&output.stdout));
                if !output.stderr.is_empty() {
                    println!("[show_script_ui] PS Error: {}", String::from_utf8_lossy(&output.stderr));
                }
                
                return Ok(());
            }
        }
    }
    
    println!("[show_script_ui] FAIL: No running process found for path: {}", path);
    Err("Script is not running".into())
}

#[tauri::command]
async fn open_in_explorer(path: String) -> Result<(), String> {
    let path_buf = std::path::PathBuf::from(&path);
    if path_buf.exists() {
        let mut cmd = Command::new("explorer");
        if path_buf.is_file() {
            cmd.arg("/select,");
        }
        cmd.arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn edit_script(path: String) -> Result<(), String> {
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
async fn add_script_tag(
    app: tauri::AppHandle,
    state: tauri::State<'_, TagsState>,
    path: String,
    tag: String,
) -> Result<(), String> {
    // Read current tags from managed state (no disk read needed)
    let current_tags = {
        let map = state.0.lock().map_err(|e| e.to_string())?;
        map.get(&path.to_lowercase()).cloned().unwrap_or_default()
    };

    if current_tags.iter().any(|t| t.to_lowercase() == tag.to_lowercase()) {
        return Ok(()); // already has this tag
    }

    let mut new_tags = current_tags;
    new_tags.push(tag);
    save_tags_and_emit(&app, &state, path, new_tags)
}

#[tauri::command]
async fn remove_script_tag(
    app: tauri::AppHandle,
    state: tauri::State<'_, TagsState>,
    path: String,
    tag: String,
) -> Result<(), String> {
    let current_tags = {
        let map = state.0.lock().map_err(|e| e.to_string())?;
        map.get(&path.to_lowercase()).cloned().unwrap_or_default()
    };

    let tag_lower = tag.to_lowercase();
    let new_tags: Vec<String> = current_tags.into_iter()
        .filter(|t| t.to_lowercase() != tag_lower)
        .collect();

    save_tags_and_emit(&app, &state, path, new_tags)
}

#[tauri::command]
async fn rename_tag(old_tag: String, new_tag: String) -> Result<(), String> {
    let _metadata = load_metadata();
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
async fn save_tag_order(order: Vec<String>) -> Result<(), String> {
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
async fn get_tag_order() -> Vec<String> {
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
async fn toggle_hide_folder(path: String) -> Result<(), String> {
    let ini_path = get_ini_path();
    let bytes = fs::read(&ini_path).unwrap_or_default();
    let content = if bytes.len() >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE {
        let utf16: Vec<u16> = bytes[2..].chunks_exact(2).map(|a| u16::from_le_bytes([a[0], a[1]])).collect();
        String::from_utf16_lossy(&utf16)
    } else {
        String::from_utf8_lossy(&bytes).to_string()
    };

    let lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();
    let mut in_hidden = false;
    let mut found = false;
    let path_lower = path.to_lowercase();

    // Try to find if it exists and remove it
    let mut new_lines = Vec::new();
    for line in lines.iter() {
        let trimmed = line.trim();
        let trimmed_lower = trimmed.to_lowercase();
        
        if trimmed_lower == "[hiddenfolders]" {
            in_hidden = true;
            new_lines.push(line.clone());
            continue;
        }
        if trimmed.starts_with('[') {
            in_hidden = false;
            new_lines.push(line.clone());
            continue;
        }

        if in_hidden {
            if let Some(pos) = trimmed.find('=') {
                if trimmed[..pos].trim().to_lowercase() == path_lower {
                    found = true;
                    continue; // Remove it
                }
            } else if trimmed_lower == path_lower {
                found = true;
                continue; // Remove it (key-only style)
            }
        }
        new_lines.push(line.clone());
    }

    if !found {
        // Add it
        let mut final_lines = Vec::new();
        let mut added = false;
        for line in new_lines.iter() {
            final_lines.push(line.clone());
            if line.trim().to_lowercase() == "[hiddenfolders]" {
                final_lines.push(format!("{}=hidden", path));
                added = true;
            }
        }
        if !added {
            final_lines.push("[hiddenfolders]".to_string());
            final_lines.push(format!("{}=hidden", path));
        }
        fs::write(&ini_path, final_lines.join("\r\n")).map_err(|e| e.to_string())?;
    } else {
        fs::write(&ini_path, new_lines.join("\r\n")).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
async fn delete_tag(tag: String) -> Result<(), String> {
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
                let tags: Vec<String> = val.split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty() && s.to_lowercase() != target_lower)
                    .collect();
                *line = format!("{}={}", key, tags.join(","));
             }
        } else if in_general && trimmed_lower.starts_with("tag_order=") {
            if let Some(pos) = line.find('=') {
                let prefix = &line[..pos+1];
                let val = &line[pos+1..];
                let tags: Vec<String> = val.split(',')
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
    // Seed the tags state from disk on startup
    let initial_tags = load_metadata().tags;

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(TagsState(Mutex::new(initial_tags)))
        .invoke_handler(tauri::generate_handler![
            get_scripts,
            run_script,
            kill_script,
            save_script_tags,
            add_script_tag,
            remove_script_tag,
            rename_tag,
            save_tag_order,
            get_tag_order,
            open_in_explorer,
            edit_script,
            delete_tag,
            toggle_hide_folder,
            show_script_ui,
            restart_script
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
