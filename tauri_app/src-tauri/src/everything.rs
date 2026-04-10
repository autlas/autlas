use crate::cmd;

fn find_everything_exe() -> Option<String> {
    // 1. Check if Everything.exe is in PATH
    if let Ok(output) = cmd("where.exe").arg("Everything.exe").output() {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if let Some(line) = stdout.lines().next() {
                let p = line.trim();
                if !p.is_empty() && std::path::Path::new(p).exists() {
                    return Some(p.to_string());
                }
            }
        }
    }

    // 2. Check registry via reg.exe
    if let Ok(output) = cmd("reg.exe")
        .args(&["query", r"HKCU\Software\voidtools\Everything", "/v", "InstallFolder"])
        .output()
    {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            // Parse: "    InstallFolder    REG_SZ    C:\Program Files\Everything"
            for line in stdout.lines() {
                if let Some(idx) = line.find("REG_SZ") {
                    let folder = line[idx + 6..].trim();
                    let exe = std::path::PathBuf::from(folder).join("Everything.exe");
                    if exe.exists() {
                        return Some(exe.to_string_lossy().to_string());
                    }
                }
            }
        }
    }

    // 3. Common paths
    for path in &[
        r"C:\Program Files\Everything\Everything.exe",
        r"C:\Program Files (x86)\Everything\Everything.exe",
        r"C:\Program Files\Everything 1.5a\Everything.exe",
    ] {
        if std::path::Path::new(path).exists() {
            return Some(path.to_string());
        }
    }

    // 4. If es.exe is in PATH, find Everything.exe next to it
    if let Ok(output) = cmd("where.exe").arg("es.exe").output() {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if let Some(line) = stdout.lines().next() {
                let es_path = std::path::Path::new(line.trim());
                if let Some(parent) = es_path.parent() {
                    let exe = parent.join("Everything.exe");
                    if exe.exists() {
                        return Some(exe.to_string_lossy().to_string());
                    }
                    let exe64 = parent.join("Everything64.exe");
                    if exe64.exists() {
                        return Some(exe64.to_string_lossy().to_string());
                    }
                }
            }
        }
    }

    None
}

fn es_exe_available() -> bool {
    // Actually try running es.exe — WindowsApps stubs exist even after uninstall
    cmd("es.exe")
        .arg("-get-everything-version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn is_everything_running() -> bool {
    // Check if Everything IPC is actually available (not just the process)
    if let Ok(output) = cmd("es.exe")
        .arg("-get-result-count")
        .output()
    {
        output.status.success()
    } else {
        false
    }
}

// Returns: "running" | "installed" | "not_installed"
#[tauri::command]
pub(crate) async fn check_everything_status() -> String {
    if is_everything_running() {
        "running".to_string()
    } else if find_everything_exe().is_some() || es_exe_available() {
        "installed".to_string()
    } else {
        "not_installed".to_string()
    }
}

#[tauri::command]
pub(crate) async fn launch_everything() -> Result<(), String> {
    if let Some(exe_path) = find_everything_exe() {
        cmd(&exe_path)
            .arg("-startup")
            .spawn()
            .map_err(|e| format!("Failed to launch Everything: {}", e))?;
        // Give it a moment to start and build index
        std::thread::sleep(std::time::Duration::from_millis(1500));
        Ok(())
    } else {
        Err("Everything.exe not found".to_string())
    }
}

#[tauri::command]
pub(crate) async fn install_everything(window: tauri::Window) -> Result<(), String> {
    use tauri::Emitter;

    // Try direct download first, fallback to winget
    match install_everything_direct(&window).await {
        Ok(()) => {}
        Err(direct_err) => {
            println!("[Rust] Direct download failed: {}. Trying winget...", direct_err);
            let _ = window.emit("everything-install-progress", serde_json::json!({
                "phase": "installing",
                "progress": 0
            }));
            install_everything_winget().map_err(|e| format!("Both methods failed. Direct: {}. Winget: {}", direct_err, e))?;
        }
    }

    // Launch Everything in tray mode
    std::thread::sleep(std::time::Duration::from_millis(500));
    if let Some(exe_path) = find_everything_exe() {
        let _ = cmd(&exe_path)
            .arg("-startup")
            .spawn();
        std::thread::sleep(std::time::Duration::from_millis(1500));
    }

    Ok(())
}

async fn install_everything_direct(window: &tauri::Window) -> Result<(), String> {
    use futures_util::StreamExt;
    use tauri::Emitter;

    let url = "https://www.voidtools.com/Everything-1.4.1.1026.x64-Setup.exe";
    let temp_dir = std::env::temp_dir();
    let installer_path = temp_dir.join("EverythingSetup.exe");

    let response = reqwest::get(url).await.map_err(|e| format!("Download failed: {}", e))?;
    let total_size = response.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();

    let mut file = tokio::fs::File::create(&installer_path).await
        .map_err(|e| format!("Failed to create temp file: {}", e))?;

    use tokio::io::AsyncWriteExt;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Download error: {}", e))?;
        file.write_all(&chunk).await.map_err(|e| format!("Write error: {}", e))?;
        downloaded += chunk.len() as u64;
        if total_size > 0 {
            let progress = (downloaded as f64 / total_size as f64 * 100.0) as u32;
            let _ = window.emit("everything-install-progress", serde_json::json!({
                "phase": "downloading",
                "progress": progress
            }));
        }
    }
    file.flush().await.map_err(|e| format!("Flush error: {}", e))?;
    drop(file);

    let _ = window.emit("everything-install-progress", serde_json::json!({
        "phase": "installing",
        "progress": 100
    }));

    let status = cmd(&installer_path)
        .arg("/S")
        .status()
        .map_err(|e| format!("Installer failed: {}", e))?;

    let _ = std::fs::remove_file(&installer_path);

    if !status.success() {
        return Err("Installer exited with error".to_string());
    }

    Ok(())
}

fn install_everything_winget() -> Result<(), String> {
    let output = cmd("winget")
        .args(&["install", "voidtools.Everything", "--silent", "--accept-package-agreements", "--accept-source-agreements"])
        .output()
        .map_err(|e| format!("Failed to run winget: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        Err(format!("winget failed: {} {}", stdout, stderr))
    }
}

pub(crate) fn scan_with_everything(scan_dirs: &[std::path::PathBuf]) -> Option<Vec<String>> {
    if scan_dirs.is_empty() {
        return Some(Vec::new());
    }

    // Build query: ext:ahk under each scan path
    // es.exe supports multiple path: filters with OR logic, but simpler to call once per dir
    let mut all_paths = Vec::new();
    for dir in scan_dirs {
        let dir_str = dir.to_string_lossy();
        let output = cmd("es.exe")
            .args(&["ext:ahk", &format!("path:{}", dir_str)])
            .output();

        match output {
            Ok(out) if out.status.success() => {
                let stdout = String::from_utf8_lossy(&out.stdout);
                for line in stdout.lines() {
                    let trimmed = line.trim();
                    if !trimmed.is_empty() {
                        all_paths.push(trimmed.to_string());
                    }
                }
            }
            Ok(out) => {
                println!("[Rust] Everything es.exe returned error: {}", String::from_utf8_lossy(&out.stderr));
                return None;
            }
            Err(e) => {
                println!("[Rust] Everything es.exe not available: {}", e);
                return None;
            }
        }
    }
    Some(all_paths)
}
