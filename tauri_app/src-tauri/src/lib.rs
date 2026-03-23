use std::process::Command;
use sysinfo::System;
use walkdir::WalkDir;

#[tauri::command]
fn scan_scripts(directories: Vec<String>) -> Vec<String> {
    let mut scripts = Vec::new();
    for dir in directories {
        for entry in WalkDir::new(&dir).into_iter().filter_map(|e| e.ok()) {
            if entry.path().extension().map_or(false, |ext| ext == "ahk") {
                if let Some(path_str) = entry.path().to_str() {
                    scripts.push(path_str.to_string());
                }
            }
        }
    }
    scripts
}

#[tauri::command]
fn get_running_scripts() -> Vec<String> {
    let mut sys = System::new_all();
    sys.refresh_all();
    let mut running = Vec::new();

    for (_pid, process) in sys.processes() {
        let name = process.name().to_string_lossy().to_lowercase();
        if name.contains("autohotkey") {
            let cmd: Vec<String> = process.cmd().iter().map(|s| s.to_string_lossy().into_owned()).collect();
            let cmd_str = cmd.join(" ");
            running.push(cmd_str);
        }
    }
    running
}

#[tauri::command]
fn run_script(path: String) -> Result<(), String> {
    Command::new("explorer") // Best way to run default associated program in Windows
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn kill_script(path: String) -> Result<(), String> {
    let mut sys = System::new_all();
    sys.refresh_all();
    for (_pid, process) in sys.processes() {
        let name = process.name().to_string_lossy().to_lowercase();
        if name.contains("autohotkey") {
            let cmd: Vec<String> = process.cmd().iter().map(|s| s.to_string_lossy().into_owned()).collect();
            let cmd_str = cmd.join(" ");
            if cmd_str.contains(&path) {
                process.kill();
                return Ok(());
            }
        }
    }
    Err("Process not found".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            scan_scripts,
            get_running_scripts,
            run_script,
            kill_script
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
