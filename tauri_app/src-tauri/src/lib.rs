use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::process::Command;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::sync::Mutex;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Create a `Command` that does not flash a console window on Windows.
pub(crate) fn cmd<S: AsRef<std::ffi::OsStr>>(program: S) -> Command {
    let mut c = Command::new(program);
    #[cfg(windows)]
    c.creation_flags(CREATE_NO_WINDOW);
    c
}
use sysinfo::{System, ProcessesToUpdate, ProcessRefreshKind, UpdateKind};
use tauri::tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState, TrayIcon};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::{Emitter, Manager, Wry};
use walkdir::WalkDir;

mod db;
mod everything;
mod reconcile;

/// Lightweight process-only refresh. Returns a ready-to-query System.
/// We need process names (always available) and cmd args for path matching.
fn refreshed_processes() -> System {
    let mut sys = System::new();
    sys.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::nothing().with_cmd(UpdateKind::Always),
    );
    sys
}

#[cfg(target_os = "windows")]
mod native_popup;

// ── Managed state ──
struct TraySettingsState(Mutex<TraySettings>);

#[derive(Serialize, Deserialize, Clone)]
struct TraySettings {
    close_to_tray: bool,
}

struct WatcherShutdown(std::sync::Arc<std::sync::atomic::AtomicBool>);

#[derive(Serialize, Clone)]
struct ScriptStatusEvent {
    path: String,
    is_running: bool,
    has_ui: bool,
}

fn get_running_ahk_paths(sys: &System) -> HashSet<String> {
    let mut paths = HashSet::new();
    for (_pid, process) in sys.processes() {
        let name = process.name().to_string_lossy().to_lowercase();
        if name.contains("autohotkey") {
            for arg in process.cmd() {
                let s = arg.to_string_lossy()
                    .trim_matches('"')
                    .replace('/', "\\")
                    .to_lowercase();
                if s.ends_with(".ahk") {
                    paths.insert(s);
                }
            }
        }
    }
    paths
}

fn build_tray_menu(app: &tauri::AppHandle, running: &HashSet<String>) -> tauri::Result<Menu<tauri::Wry>> {
    let menu = Menu::new(app)?;

    if !running.is_empty() {
        let header = MenuItem::with_id(app, "header_running", format!("Running ({})", running.len()), false, None::<&str>)?;
        menu.append(&header)?;
        menu.append(&PredefinedMenuItem::separator(app)?)?;

        let mut sorted: Vec<&String> = running.iter().collect();
        sorted.sort();

        for path in sorted {
            let filename = std::path::Path::new(path.as_str())
                .file_name()
                .map(|f| f.to_string_lossy().to_string())
                .unwrap_or_else(|| path.clone());
            let stop_item = MenuItem::with_id(app, format!("stop|{}", path), format!("  {} \u{2014} Stop", filename), true, None::<&str>)?;
            menu.append(&stop_item)?;
        }

        menu.append(&PredefinedMenuItem::separator(app)?)?;
        let stop_all = MenuItem::with_id(app, "stop_all", "Stop All Scripts", true, None::<&str>)?;
        menu.append(&stop_all)?;
        menu.append(&PredefinedMenuItem::separator(app)?)?;
    }

    let show = MenuItem::with_id(app, "show_window", "Show Window", true, None::<&str>)?;
    menu.append(&show)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    menu.append(&quit)?;

    Ok(menu)
}

#[cfg(target_os = "windows")]
fn collect_running_scripts(paths: &HashSet<String>) -> Vec<native_popup::RunningScript> {
    paths.iter().map(|path| {
        let pb = std::path::PathBuf::from(path);
        let filename = pb.file_name()
            .and_then(|_| {
                pb.canonicalize().ok()
                    .and_then(|c| c.file_name().map(|n| n.to_string_lossy().to_string()))
            })
            .unwrap_or_else(|| pb.file_name().map(|f| f.to_string_lossy().to_string()).unwrap_or(path.clone()));
        let has_ui = fs::read_to_string(path)
            .map(|c| { let t = c.to_lowercase(); t.contains("0x0401") || t.contains("0x401") })
            .unwrap_or(false);
        native_popup::RunningScript { path: path.clone(), filename, has_ui }
    }).collect()
}

fn start_process_watcher(app: tauri::AppHandle, shutdown: std::sync::Arc<std::sync::atomic::AtomicBool>) {
    std::thread::spawn(move || {
        let mut sys = System::new();
        sys.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing().with_cmd(UpdateKind::Always));
        let mut prev = get_running_ahk_paths(&sys);
        println!("[Watcher] Started. Initially running: {:?}", prev);

        while !shutdown.load(std::sync::atomic::Ordering::Relaxed) {
            std::thread::sleep(std::time::Duration::from_millis(1500));
            if shutdown.load(std::sync::atomic::Ordering::Relaxed) { break; }
            // Reuse the same System and only refresh processes (not CPU/RAM/disks/network).
            // remove_dead_processes=true ensures dead PIDs are cleaned up.
            sys.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing().with_cmd(UpdateKind::Always));
            let current = get_running_ahk_paths(&sys);

            if current != prev {
                println!("[Watcher] Change detected. prev={:?} current={:?}", prev.len(), current.len());
            }

            for path in current.difference(&prev) {
                println!("[Watcher] Script started: {}", path);
                let has_ui = fs::read_to_string(path)
                    .map(|c| { let t = c.to_lowercase(); t.contains("0x0401") || t.contains("0x401") })
                    .unwrap_or(false);
                // Record last_run for any detected start (including external launches)
                if let Ok(conn) = app.state::<db::DbState>().0.lock() {
                    let _ = db::set_last_run(&conn, path, &db::now_iso());
                }
                let _ = app.emit("script-status-changed", ScriptStatusEvent {
                    path: path.clone(),
                    is_running: true,
                    has_ui,
                });
            }

            for path in prev.difference(&current) {
                println!("[Watcher] Script stopped: {}", path);
                let _ = app.emit("script-status-changed", ScriptStatusEvent {
                    path: path.clone(),
                    is_running: false,
                    has_ui: false,
                });
            }

            // Update tray menu and popup when running scripts change
            if current != prev {
                if let Some(tray) = app.tray_by_id("main_tray") {
                    if let Ok(menu) = build_tray_menu(&app, &current) {
                        let _ = tray.set_menu(Some(menu));
                    }
                }
                #[cfg(target_os = "windows")]
                {
                    let running = collect_running_scripts(&current);
                    native_popup::refresh(running);
                }
            }

            prev = current;
        }
    });
}

#[derive(Serialize, Deserialize, Clone)]
struct Script {
    id: String,
    path: String,
    filename: String,
    parent: String,
    tags: Vec<String>,
    is_hidden: bool,
    is_running: bool,
    has_ui: bool,
    size: u64,
    created_at: String,
    modified_at: String,
    last_run: String,
    is_hub: bool,
}


#[tauri::command]
async fn save_script_tags(
    app: tauri::AppHandle,
    state: tauri::State<'_, db::DbState>,
    id: String,
    tags: Vec<String>,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::set_tags_for_script(&conn, &id, &tags).map_err(|e| e.to_string())?;
    let _ = app.emit("script-tags-changed", serde_json::json!({ "id": id, "tags": tags }));
    Ok(())
}

fn load_cache_from_db(conn: &rusqlite::Connection) -> Option<Vec<String>> {
    let paths: Vec<String> = db::get_all_active_scripts(conn)
        .into_iter()
        .map(|(_, path)| path)
        .collect();
    if paths.is_empty() { None } else { Some(paths) }
}

#[tauri::command]
async fn get_scripts(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, db::DbState>,
    force_scan: bool,
) -> Result<Vec<Script>, String> {
    use tauri::Emitter;
    let start = std::time::Instant::now();

    // Collect running processes on a blocking thread (avoids stalling the tokio runtime)
    let running_cmds: Vec<String> = tokio::task::spawn_blocking(|| {
        let sys = refreshed_processes();
        let mut cmds = Vec::new();
        for (_pid, process) in sys.processes() {
            let name = process.name().to_string_lossy().to_lowercase();
            if name.contains("autohotkey") {
                let proc_cmd: Vec<String> = process.cmd().iter().map(|s| s.to_string_lossy().into_owned()).collect();
                cmds.push(proc_cmd.join(" ").to_lowercase());
            }
        }
        cmds
    }).await.map_err(|e| e.to_string())?;

    // Read config from DB (short lock)
    let (scan_paths_list, hidden_folders, blacklist) = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        (db::get_scan_paths(&conn), db::get_hidden_folders(&conn), db::get_scan_blacklist(&conn))
    };
    // Pre-normalize blacklist entries once for prefix matching below.
    let blacklist_norm: Vec<String> = blacklist.iter()
        .map(|p| p.to_lowercase().replace('/', r"\").trim_end_matches('\\').to_string())
        .collect();
    let is_blacklisted = |path: &str| -> bool {
        let p = path.to_lowercase().replace('/', r"\");
        blacklist_norm.iter().any(|b| p == *b || p.starts_with(&format!("{}\\", b)))
    };

    // Resolve script paths
    let mut script_paths: Vec<String>;
    let tags_map: HashMap<String, Vec<String>>;
    let id_map: HashMap<String, String>;
    let hub_ids: HashSet<String>;

    // Capture our generation. Bump global counter so any in-flight scan
    // started before us knows it has been superseded and will discard
    // its results when it eventually returns.
    use std::sync::atomic::Ordering;
    let my_gen = state.1.fetch_add(1, Ordering::SeqCst) + 1;

    if force_scan {
        // FULL SCAN: disk scan + reconciliation
        println!("[Rust] Manual refresh requested (force_scan=true, gen={}). Starting full disk scan...", my_gen);
        let scan_start = std::time::Instant::now();
        let mut scan_dirs = Vec::new();
        for p in &scan_paths_list {
            let pb = std::path::PathBuf::from(p);
            if pb.exists() && pb.is_dir() { scan_dirs.push(pb); }
        }

        let app_for_scan = app_handle.clone();
        let scan_start_clone = scan_start;
        script_paths = tokio::task::spawn_blocking(move || {
            let everything_result = everything::scan_with_everything(&scan_dirs);
            if let Some(paths) = everything_result {
                println!("[Rust] Everything scan completed: {} scripts in {:.1?}", paths.len(), scan_start_clone.elapsed());
                paths
            } else {
                let mut paths = Vec::new();
                let mut last_emitted = 0usize;
                for dir in scan_dirs {
                    for entry in WalkDir::new(&dir).into_iter().filter_map(|e| e.ok()) {
                        if entry.path().extension().map_or(false, |ext| ext == "ahk") {
                            paths.push(entry.path().to_string_lossy().to_string());
                            let count = paths.len();
                            if count >= last_emitted + 25 {
                                last_emitted = count;
                                let _ = app_for_scan.emit("scan-progress", count);
                            }
                        }
                    }
                }
                println!("[Rust] WalkDir scan completed: {} scripts in {:.1?}", paths.len(), scan_start_clone.elapsed());
                paths
            }
        }).await.map_err(|e| e.to_string())?;
        // Cache is implicitly saved by reconciliation (upsert_script writes paths to DB)

        // Resolve symlinks/junctions and deduplicate
        script_paths = script_paths.into_iter().map(|p| {
            std::fs::canonicalize(&p)
                .map(|c| {
                    let s = c.to_string_lossy().to_string();
                    // Strip \\?\ prefix added by canonicalize on Windows
                    s.strip_prefix(r"\\?\").map(|stripped| stripped.to_string()).unwrap_or(s)
                })
                .unwrap_or(p)
        }).collect();
        let mut seen = HashSet::new();
        script_paths.retain(|p| seen.insert(p.to_lowercase()));
        // Drop blacklisted paths so reconciliation marks them as removed and
        // they disappear from the tree on the next render.
        script_paths.retain(|p| !is_blacklisted(p));

        let disk_paths: HashSet<String> = script_paths.iter()
            .map(|p| p.to_lowercase())
            .filter(|p| std::path::Path::new(p).exists())
            .collect();

        // Bail out if a newer scan started while we were walking the disk.
        // Without this, a slow WalkDir scan kicked off when Everything was
        // unavailable would later overwrite a fast Everything scan triggered
        // after the user installed/launched Everything.
        if state.1.load(Ordering::SeqCst) != my_gen {
            println!("[Rust] Scan gen={} superseded; discarding stale results", my_gen);
            return Err("scan superseded".to_string());
        }

        // Reconciliation + tag/ID loading in single lock (prevents watcher interleaving)
        let _ = app_handle.emit("scan-phase", "reconciling");
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        let pending = reconcile::reconcile(&conn, &disk_paths)?;
        let _ = app_handle.emit("scan-phase", "loading-meta");
        if !pending.is_empty() {
            println!("[Rust] {} pending matches need user confirmation", pending.len());
            let _ = app_handle.emit("orphan-matches-found", &pending);
        }
        tags_map = db::get_all_tags_map(&conn);
        id_map = db::get_all_active_scripts(&conn)
            .into_iter().map(|(id, path)| (path, id)).collect();
        hub_ids = db::get_hub_flags(&conn);
        drop(conn);
    } else {
        // FAST LOAD: cache only, no reconciliation
        // Single lock for cache + tags + IDs (prevents watcher interleaving)
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        if let Some(cached) = load_cache_from_db(&conn) {
            println!("[Rust] Fast load from DB ({} paths)", cached.len());
            script_paths = cached.into_iter()
                .map(|p| p.trim_start_matches(r"\\?\").to_string())
                .collect();
            let mut seen = HashSet::new();
            script_paths.retain(|p| seen.insert(p.to_lowercase()));
            // Apply blacklist on the cached load path too — otherwise the tree
            // shows blacklisted scripts until the user manually rescans.
            script_paths.retain(|p| !is_blacklisted(p));
        } else {
            println!("[Rust] No scripts in DB — returning empty (user should refresh or set up scan paths)");
            script_paths = Vec::new();
        }
        tags_map = db::get_all_tags_map(&conn);
        id_map = db::get_all_active_scripts(&conn)
            .into_iter().map(|(id, path)| (path, id)).collect();
        hub_ids = db::get_hub_flags(&conn);
        drop(conn);
    }

    let tagged_count = tags_map.len();
    let total_tags: usize = tags_map.values().map(|v| v.len()).sum();

    // Enrich scripts (file I/O for running scripts only)
    if force_scan {
        let _ = app_handle.emit("scan-phase", "enriching");
    }
    let mut scripts = Vec::new();
    let conn_for_runs = state.0.lock().map_err(|e| e.to_string())?;
    for path_str in &script_paths {
        let path_lower = path_str.to_lowercase();

        // Restore original filesystem casing via canonicalize (DB stores lowercase)
        let real_path = std::fs::canonicalize(path_str)
            .map(|c| {
                let s = c.to_string_lossy().to_string();
                s.strip_prefix(r"\\?\").map(|stripped| stripped.to_string()).unwrap_or(s)
            })
            .unwrap_or_else(|_| path_str.clone());
        let path_buf = std::path::PathBuf::from(&real_path);

        let filename = path_buf.file_name().map_or("".to_string(), |f| f.to_string_lossy().to_string());
        let parent = path_buf.parent().map_or("".to_string(), |p| p.file_name().map_or("".to_string(), |f| f.to_string_lossy().to_string()));

        let script_id = id_map.get(&path_lower).cloned().unwrap_or_default();
        let tags = tags_map.get(&path_lower).cloned().unwrap_or_default();
        let is_hidden = hidden_folders.iter().any(|h| {
            let h_norm = h.to_lowercase().replace('/', "\\");
            let h_trimmed = h_norm.trim_end_matches('\\');
            path_lower.starts_with(h_trimmed) &&
                (path_lower.len() == h_trimmed.len() || path_lower.as_bytes().get(h_trimmed.len()) == Some(&b'\\'))
        });
        let is_running = running_cmds.iter().any(|cmd| cmd.contains(&path_lower));

        let has_ui = if is_running {
            if let Ok(content) = fs::read_to_string(&path_buf) {
                let text = content.to_lowercase();
                text.contains("0x0401") || text.contains("0x401")
            } else { false }
        } else { false };

        // exists() + size + dates from same syscall
        let meta = match fs::metadata(&path_buf) {
            Ok(m) => m,
            Err(_) => continue, // skip deleted files
        };
        let size = meta.len();
        let created_at = meta.created().map(format_system_time).unwrap_or_default();
        let modified_at = meta.modified().map(format_system_time).unwrap_or_default();
        let last_run_val = db::get_last_run(&conn_for_runs, &path_lower).unwrap_or_default();

        let is_hub = hub_ids.contains(&script_id);
        scripts.push(Script {
            id: script_id,
            path: real_path,
            filename,
            parent,
            tags,
            is_hidden,
            is_running,
            has_ui,
            size,
            created_at,
            modified_at,
            last_run: last_run_val,
            is_hub,
        });
    }
    drop(conn_for_runs);

    scripts.sort_by(|a, b| a.path.to_lowercase().cmp(&b.path.to_lowercase()));
    scripts.dedup_by(|a, b| a.path.to_lowercase() == b.path.to_lowercase());
    println!("[Rust] get_scripts done: {} scripts, {} tagged ({} tags) in {:.1?}",
        scripts.len(), tagged_count, total_tags, start.elapsed());
    Ok(scripts)
}

#[tauri::command]
async fn run_script(
    state: tauri::State<'_, db::DbState>,
    path: String,
) -> Result<(), String> {
    cmd("explorer").arg(&path).spawn().map_err(|e| e.to_string())?;
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let _ = db::set_last_run(&conn, &path.to_lowercase(), &db::now_iso());
    Ok(())
}

#[tauri::command]
async fn kill_script(path: String) -> Result<(), String> {
    let sys = refreshed_processes();
    let path_lower = path.to_lowercase().replace('/', "\\");
    let mut killed = false;
    for (pid, process) in sys.processes() {
        let name = process.name().to_string_lossy().to_lowercase();
        if name.contains("autohotkey") {
            let matched = process.cmd().iter().any(|arg| {
                let s = arg.to_string_lossy()
                    .trim_matches('"')
                    .replace('/', "\\")
                    .to_lowercase();
                s == path_lower
            });
            if matched {
                let output = cmd("taskkill")
                    .args(["/F", "/T", "/PID", &pid.as_u32().to_string()])
                    .output()
                    .map_err(|e| format!("failed to run taskkill: {}", e))?;
                if !output.status.success() {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    return Err(format!("taskkill failed for PID {}: {}", pid.as_u32(), stderr.trim()));
                }
                killed = true;
            }
        }
    }
    if !killed {
        // Process already exited — not an error, watcher will catch up.
    }
    Ok(())
}

#[tauri::command]
async fn restart_script(
    state: tauri::State<'_, db::DbState>,
    path: String,
) -> Result<(), String> {
    // 1. Kill the script
    let sys = refreshed_processes();
    let path_lower = path.to_lowercase().replace('/', "\\");
    for (pid, process) in sys.processes() {
        let name = process.name().to_string_lossy().to_lowercase();
        if name.contains("autohotkey") {
            let matched = process.cmd().iter().any(|arg| {
                let s = arg.to_string_lossy()
                    .trim_matches('"')
                    .replace('/', "\\")
                    .to_lowercase();
                s == path_lower
            });
            if matched {
                let output = cmd("taskkill")
                    .args(["/F", "/T", "/PID", &pid.as_u32().to_string()])
                    .output()
                    .map_err(|e| format!("failed to run taskkill: {}", e))?;
                if !output.status.success() {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    return Err(format!("taskkill failed for PID {}: {}", pid.as_u32(), stderr.trim()));
                }
            }
        }
    }

    // 2. Wait a bit for the process to fully close (async — doesn't block tokio runtime)
    tokio::time::sleep(std::time::Duration::from_millis(150)).await;

    // 3. Run it again
    cmd("explorer").arg(&path).spawn().map_err(|e| e.to_string())?;
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let _ = db::set_last_run(&conn, &path.to_lowercase(), &db::now_iso());
    Ok(())
}

#[tauri::command]
async fn show_script_ui(path: String) -> Result<(), String> {
    println!("[show_script_ui] Request for path: {}", path);
    let sys = refreshed_processes();
    let path_lower = path.to_lowercase().replace("/", "\\");
    
    for (pid, process) in sys.processes() {
        let name = process.name().to_string_lossy().to_lowercase();
        if name.contains("autohotkey") {
            let proc_cmd: Vec<String> = process.cmd().iter().map(|s| s.to_string_lossy().into_owned()).collect();
            let cmd_str = proc_cmd.join(" ").to_lowercase().replace("/", "\\");
            
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
                
                let output = cmd("powershell")
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
        let mut c = cmd("explorer");
        if path_buf.is_file() {
            c.arg("/select,");
        }
        c.arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(windows)]
fn shell_execute(verb: &str, file: &str) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::UI::Shell::ShellExecuteW;
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    let to_wide = |s: &str| -> Vec<u16> {
        std::ffi::OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
    };
    let verb_w = to_wide(verb);
    let file_w = to_wide(file);

    // ShellExecuteW returns HINSTANCE; values <= 32 indicate failure.
    let result = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            verb_w.as_ptr(),
            file_w.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            SW_SHOWNORMAL,
        )
    };
    if (result as isize) <= 32 {
        Err(format!("ShellExecuteW failed (code {})", result as isize))
    } else {
        Ok(())
    }
}

#[tauri::command]
async fn edit_script(path: String) -> Result<(), String> {
    // Validate that the path exists and is a file before invoking the shell.
    let p = std::path::PathBuf::from(&path);
    if !p.is_file() {
        return Err("file does not exist".into());
    }
    #[cfg(windows)]
    {
        // Try the 'edit' verb first; fall back to 'open' if no editor is registered.
        if shell_execute("edit", &path).is_err() {
            shell_execute("open", &path)?;
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        Err("edit_script is only supported on Windows".into())
    }
}

#[tauri::command]
async fn open_url(url: String) -> Result<(), String> {
    // Whitelist safe schemes only — no arbitrary file:// or shell: URIs.
    let lower = url.trim().to_ascii_lowercase();
    let allowed = lower.starts_with("http://")
        || lower.starts_with("https://")
        || lower.starts_with("mailto:");
    if !allowed {
        return Err("only http(s) and mailto URLs are allowed".into());
    }
    #[cfg(windows)]
    {
        shell_execute("open", &url)
    }
    #[cfg(not(windows))]
    {
        Err("open_url is only supported on Windows".into())
    }
}

#[tauri::command]
async fn open_with(path: String) -> Result<(), String> {
    // Convert to short (8.3) path to avoid rundll32 issues with spaces
    let short_path = get_short_path(&path).unwrap_or_else(|| path.clone());

    cmd("rundll32.exe")
        .arg("shell32.dll,OpenAs_RunDLL")
        .arg(&short_path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn get_short_path(path: &str) -> Option<String> {
    use std::os::windows::ffi::OsStrExt;
    let wide: Vec<u16> = std::ffi::OsStr::new(path).encode_wide().chain(std::iter::once(0)).collect();
    let len = unsafe { windows_sys::Win32::Storage::FileSystem::GetShortPathNameW(wide.as_ptr(), std::ptr::null_mut(), 0) };
    if len == 0 { return None; }
    let mut buf = vec![0u16; len as usize];
    let written = unsafe { windows_sys::Win32::Storage::FileSystem::GetShortPathNameW(wide.as_ptr(), buf.as_mut_ptr(), len) };
    if written == 0 || written >= len { return None; }
    buf.truncate(written as usize);
    Some(String::from_utf16_lossy(&buf))
}

#[tauri::command]
async fn add_script_tag(
    app: tauri::AppHandle,
    state: tauri::State<'_, db::DbState>,
    id: String,
    tag: String,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::add_tag_to_script(&conn, &id, &tag).map_err(|e| e.to_string())?;
    let tags = db::get_tags_for_script(&conn, &id);
    let _ = app.emit("script-tags-changed", serde_json::json!({ "id": id, "tags": tags }));
    Ok(())
}

#[tauri::command]
async fn remove_script_tag(
    app: tauri::AppHandle,
    state: tauri::State<'_, db::DbState>,
    id: String,
    tag: String,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::remove_tag_from_script(&conn, &id, &tag).map_err(|e| e.to_string())?;
    let tags = db::get_tags_for_script(&conn, &id);
    let _ = app.emit("script-tags-changed", serde_json::json!({ "id": id, "tags": tags }));
    Ok(())
}

#[tauri::command]
async fn set_script_hub(
    app: tauri::AppHandle,
    state: tauri::State<'_, db::DbState>,
    id: String,
    hub: bool,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::set_script_hub(&conn, &id, hub).map_err(|e| e.to_string())?;
    let _ = app.emit("script-hub-changed", serde_json::json!({ "id": id, "hub": hub }));
    Ok(())
}

#[tauri::command]
async fn rename_tag(
    app: tauri::AppHandle,
    state: tauri::State<'_, db::DbState>,
    old_tag: String,
    new_tag: String,
) -> Result<(), String> {
    use tauri::Emitter;
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let affected_ids = db::rename_tag_all(&conn, &old_tag, &new_tag).map_err(|e| e.to_string())?;
    // Emit per-script tag updates so all mounted ScriptTree instances refresh.
    for id in affected_ids {
        let tags = db::get_tags_for_script(&conn, &id);
        let _ = app.emit("script-tags-changed", serde_json::json!({ "id": id, "tags": tags }));
    }
    Ok(())
}

#[tauri::command]
async fn save_tag_order(
    state: tauri::State<'_, db::DbState>,
    order: Vec<String>,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::save_tag_order(&conn, &order).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn get_tag_order(state: tauri::State<'_, db::DbState>) -> Result<Vec<String>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    Ok(db::get_tag_order(&conn))
}

#[tauri::command]
async fn toggle_hide_folder(
    state: tauri::State<'_, db::DbState>,
    path: String,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::toggle_hidden_folder(&conn, &path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn get_hidden_folders(state: tauri::State<'_, db::DbState>) -> Result<Vec<String>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    Ok(db::get_hidden_folders(&conn))
}

/// Count .ahk files under each given folder. Used by Settings to show
/// per-entry script counts on blacklist + hidden folder lists, where the
/// in-memory script list can't be used because those entries are deliberately
/// filtered out before reaching the frontend.
#[tauri::command]
async fn count_ahk_files(paths: Vec<String>) -> Result<Vec<usize>, String> {
    let mut counts = Vec::with_capacity(paths.len());
    for p in &paths {
        let pb = std::path::PathBuf::from(p);
        if !pb.exists() || !pb.is_dir() {
            counts.push(0);
            continue;
        }
        let n = WalkDir::new(&pb)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().extension().map_or(false, |ext| ext == "ahk"))
            .count();
        counts.push(n);
    }
    Ok(counts)
}

#[tauri::command]
async fn get_tag_icons(state: tauri::State<'_, db::DbState>) -> Result<HashMap<String, String>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    Ok(db::get_tag_icons(&conn))
}

#[tauri::command]
async fn save_tag_icon(
    state: tauri::State<'_, db::DbState>,
    tag: String,
    icon: String,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::save_tag_icon(&conn, &tag, &icon).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn load_icon_cache(state: tauri::State<'_, db::DbState>) -> Result<HashMap<String, (String, String)>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    Ok(db::load_icon_svg_cache(&conn))
}

#[tauri::command]
async fn save_icon_to_cache(
    state: tauri::State<'_, db::DbState>,
    name: String,
    bold: String,
    fill: String,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::save_icon_svg(&conn, &name, &bold, &fill).map_err(|e| e.to_string())
}

#[tauri::command]
async fn search_icons(query: String, prefix: String) -> Result<Vec<String>, String> {
    if query.len() < 2 {
        return Ok(Vec::new());
    }
    let url = format!(
        "https://api.iconify.design/search?query={}&prefix={}&limit=999",
        urlencoding(&query),
        urlencoding(&prefix)
    );
    let resp = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    let text = resp.text().await.map_err(|e| e.to_string())?;
    let parsed: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;

    let icons = parsed["icons"].as_array().ok_or("Invalid API response")?;
    let prefix_colon = format!("{}:", prefix);
    let suffixes = ["-bold", "-fill", "-thin", "-light", "-duotone"];
    let mut base_names: Vec<String> = Vec::new();
    let mut seen = HashSet::new();

    for icon in icons {
        if let Some(s) = icon.as_str() {
            let name = s.strip_prefix(&prefix_colon).unwrap_or(s);
            let mut base = name.to_string();
            if prefix == "ph" {
                for suffix in &suffixes {
                    if let Some(stripped) = base.strip_suffix(suffix) {
                        base = stripped.to_string();
                        break;
                    }
                }
            }
            if !base.is_empty() && seen.insert(base.clone()) {
                base_names.push(base);
            }
        }
    }
    Ok(base_names)
}

fn urlencoding(s: &str) -> String {
    let mut result = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                result.push(b as char);
            }
            _ => {
                result.push_str(&format!("%{:02X}", b));
            }
        }
    }
    result
}

#[tauri::command]
async fn fetch_icon_paths(
    state: tauri::State<'_, db::DbState>,
    names: Vec<String>,
    prefix: String,
) -> Result<HashMap<String, (String, String)>, String> {
    let mut result: HashMap<String, (String, String)> = HashMap::new();
    let is_phosphor = prefix == "ph";

    // Batch into groups of 40
    for chunk in names.chunks(40) {
        let icon_names: Vec<String> = if is_phosphor {
            chunk.iter()
                .flat_map(|n| vec![format!("{}-bold", n), format!("{}-fill", n)])
                .collect()
        } else {
            chunk.iter().map(|n| n.clone()).collect()
        };
        let url = format!(
            "https://api.iconify.design/{}.json?icons={}",
            prefix,
            icon_names.join(",")
        );
        let resp = reqwest::get(&url).await.map_err(|e| e.to_string())?;
        let text = resp.text().await.map_err(|e| e.to_string())?;
        let parsed: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;

        if let Some(icons) = parsed["icons"].as_object() {
            for base_name in chunk {
                if is_phosphor {
                    let bold_key = format!("{}-bold", base_name);
                    let fill_key = format!("{}-fill", base_name);
                    let bold_body = icons.get(&bold_key)
                        .and_then(|v| v["body"].as_str())
                        .unwrap_or("")
                        .to_string();
                    let fill_body = icons.get(&fill_key)
                        .and_then(|v| v["body"].as_str())
                        .unwrap_or("")
                        .to_string();
                    if !bold_body.is_empty() && !fill_body.is_empty() {
                        // Namespace Phosphor cache rows so they can't collide
                        // with other libraries that share short names.
                        let cache_key = format!("phosphor:{}", base_name);
                        result.insert(cache_key, (bold_body, fill_body));
                    }
                } else {
                    // Simple Icons: one path, same for both slots
                    let body = icons.get(base_name)
                        .and_then(|v| v["body"].as_str())
                        .unwrap_or("")
                        .to_string();
                    if !body.is_empty() {
                        let cache_key = format!("si:{}", base_name);
                        result.insert(cache_key, (body.clone(), body));
                    }
                }
            }
        }
    }

    // Auto-save to DB
    if !result.is_empty() {
        if let Ok(conn) = state.0.lock() {
            let _ = db::save_icon_svgs_batch(&conn, &result);
        }
    }

    Ok(result)
}

#[tauri::command]
async fn delete_tag(
    state: tauri::State<'_, db::DbState>,
    tag: String,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::delete_tag_all(&conn, &tag).map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Serialize)]
struct ScriptStatus {
    is_running: bool,
    has_ui: bool,
}

#[tauri::command]
async fn read_script_content(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {}", path, e))
}

#[derive(Serialize)]
struct ScriptMeta {
    hash: String,
    created: String,
    modified: String,
    last_run: String,
}

fn format_system_time(t: std::time::SystemTime) -> String {
    let d = t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
    let secs = d.as_secs();
    let (y, m, day) = db::days_to_date((secs / 86400) as i64);
    let time_of_day = secs % 86400;
    let h = time_of_day / 3600;
    let min = (time_of_day % 3600) / 60;
    format!("{:04}-{:02}-{:02} {:02}:{:02}", y, m, day, h, min)
}

#[tauri::command]
async fn get_script_meta(
    state: tauri::State<'_, db::DbState>,
    path: String,
) -> Result<ScriptMeta, String> {
    let path_buf = std::path::PathBuf::from(&path);
    let hash = db::compute_file_hash(&path_buf).unwrap_or_default();
    let meta = fs::metadata(&path_buf).map_err(|e| e.to_string())?;
    let created = meta.created().map(format_system_time).unwrap_or_default();
    let modified = meta.modified().map(format_system_time).unwrap_or_default();
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let last_run = db::get_last_run(&conn, &path.to_lowercase()).unwrap_or_default();
    Ok(ScriptMeta { hash, created, modified, last_run })
}

#[tauri::command]
async fn get_script_status(path: String) -> ScriptStatus {
    let sys = refreshed_processes();
    let path_lower = path.to_lowercase().replace('/', "\\");
    for (_pid, process) in sys.processes() {
        let name = process.name().to_string_lossy().to_lowercase();
        if name.contains("autohotkey") {
            for arg in process.cmd() {
                let s = arg.to_string_lossy()
                    .trim_matches('"')
                    .replace('/', "\\")
                    .to_lowercase();
                if s == path_lower {
                    let has_ui = fs::read_to_string(&path)
                        .map(|c| { let t = c.to_lowercase(); t.contains("0x0401") || t.contains("0x401") })
                        .unwrap_or(false);
                    return ScriptStatus { is_running: true, has_ui };
                }
            }
        }
    }
    ScriptStatus { is_running: false, has_ui: false }
}

#[tauri::command]
async fn get_scan_paths(state: tauri::State<'_, db::DbState>) -> Result<Vec<String>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    Ok(db::get_scan_paths(&conn))
}

#[tauri::command]
async fn set_scan_paths(
    state: tauri::State<'_, db::DbState>,
    paths: Vec<String>,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::set_scan_paths(&conn, &paths).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn get_scan_blacklist(state: tauri::State<'_, db::DbState>) -> Result<Vec<String>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    Ok(db::get_scan_blacklist(&conn))
}

#[tauri::command]
async fn set_scan_blacklist(
    state: tauri::State<'_, db::DbState>,
    paths: Vec<String>,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::set_scan_blacklist(&conn, &paths).map_err(|e| e.to_string())?;
    Ok(())
}

fn load_tray_settings(conn: &rusqlite::Connection) -> TraySettings {
    let close_to_tray = db::get_setting(conn, "close_to_tray")
        .map(|v| v != "false" && v != "0")
        .unwrap_or(true);
    TraySettings { close_to_tray }
}

fn save_tray_settings(conn: &rusqlite::Connection, settings: &TraySettings) -> Result<(), String> {
    db::set_setting(conn, "close_to_tray", if settings.close_to_tray { "true" } else { "false" })
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_tray_settings(state: tauri::State<'_, TraySettingsState>) -> Result<TraySettings, String> {
    let settings = state.0.lock().map_err(|e| e.to_string())?;
    Ok(settings.clone())
}

#[tauri::command]
async fn set_tray_settings(
    db_state: tauri::State<'_, db::DbState>,
    state: tauri::State<'_, TraySettingsState>,
    settings: TraySettings,
) -> Result<(), String> {
    let mut current = state.0.lock().map_err(|e| e.to_string())?;
    *current = settings.clone();
    drop(current);
    let conn = db_state.0.lock().map_err(|e| e.to_string())?;
    save_tray_settings(&conn, &settings)
}

#[tauri::command]
async fn show_main_window_cmd(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
    if let Some(popup) = app.get_webview_window("tray-popup") {
        let _ = popup.hide();
    }
    Ok(())
}

#[tauri::command]
async fn quit_app_cmd(app: tauri::AppHandle) -> Result<(), String> {
    // Signal watcher thread to stop
    if let Some(shutdown) = app.try_state::<WatcherShutdown>() {
        shutdown.0.store(true, std::sync::atomic::Ordering::Relaxed);
    }
    app.exit(0);
    Ok(())
}

#[derive(Serialize)]
struct OrphanedScript {
    id: String,
    old_path: String,
    filename: String,
}

#[tauri::command]
async fn get_orphaned_scripts_cmd(state: tauri::State<'_, db::DbState>) -> Result<Vec<OrphanedScript>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let orphans = db::get_orphaned_scripts(&conn);
    Ok(orphans.into_iter().map(|(id, path, filename)| OrphanedScript { id, old_path: path, filename }).collect())
}

#[tauri::command]
async fn resolve_orphan(
    app: tauri::AppHandle,
    state: tauri::State<'_, db::DbState>,
    orphan_id: String,
    action: String,
    new_path: Option<String>,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    match action.as_str() {
        "link" => {
            if let Some(path) = new_path {
                let path_lower = db::normalize_path(&path);
                let path_buf = std::path::PathBuf::from(&path);
                let filename = path_buf.file_name()
                    .map(|f| f.to_string_lossy().to_string())
                    .unwrap_or_default();
                let hash = db::compute_file_hash(&path_buf).unwrap_or_default();
                let now = db::now_iso();

                // Delete the duplicate entry created during scan for this path
                // (it has a new UUID with no tags — the orphan's UUID is the real one)
                let _ = conn.execute(
                    "DELETE FROM script_tags WHERE script_id IN (SELECT id FROM scripts WHERE LOWER(path) = ?1 AND id != ?2)",
                    rusqlite::params![path_lower, orphan_id],
                );
                let _ = conn.execute(
                    "DELETE FROM scripts WHERE LOWER(path) = ?1 AND id != ?2",
                    rusqlite::params![path_lower, orphan_id],
                );

                db::reconcile_orphan(&conn, &orphan_id, &path_lower, &filename, &hash, &now)
                    .map_err(|e| e.to_string())?;

                // Emit with BOTH id and path so frontend can match by either
                let tags = db::get_tags_for_script(&conn, &orphan_id);
                let _ = app.emit("script-tags-changed", serde_json::json!({
                    "id": orphan_id,
                    "path": path_lower,
                    "tags": tags
                }));
            }
        }
        "discard" => {
            conn.execute("DELETE FROM scripts WHERE id = ?1", rusqlite::params![orphan_id])
                .map_err(|e| e.to_string())?;
        }
        _ => {}
    }
    Ok(())
}

#[tauri::command]
async fn cleanup_orphans_cmd(state: tauri::State<'_, db::DbState>) -> Result<usize, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::cleanup_orphans(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
async fn reset_database_cmd(state: tauri::State<'_, db::DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::reset_database(&conn).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Open SQLite database and run migration if needed
    let conn = db::open_db().expect("Failed to open database");
    let initial_tray = load_tray_settings(&conn);

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(db::DbState(Mutex::new(conn), std::sync::atomic::AtomicUsize::new(0)))
        .manage(TraySettingsState(Mutex::new(initial_tray)))
        .setup(|app| {
            let handle = app.handle().clone();

            // Create native Win32 popup
            #[cfg(target_os = "windows")]
            {
                native_popup::create_popup();
                let app_handle = handle.clone();
                native_popup::set_action_callback(move |action: &str| {
                    if action == "show_window" {
                        if let Some(w) = app_handle.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    } else if action == "quit" {
                        app_handle.exit(0);
                    } else if let Some(path) = action.strip_prefix("stop|").or_else(|| action.strip_prefix("restart|")) {
                        let is_restart = action.starts_with("restart|");
                        let path_owned = path.to_string();
                        let path_lower = path.to_lowercase().replace('/', "\\");
                        // Spawn to avoid holding popup mutex during blocking operations
                        let handle = app_handle.clone();
                        std::thread::spawn(move || {
                            let sys = refreshed_processes();
                            for (pid, process) in sys.processes() {
                                let name = process.name().to_string_lossy().to_lowercase();
                                if name.contains("autohotkey") {
                                    let matched = process.cmd().iter().any(|arg| {
                                        arg.to_string_lossy().trim_matches('"').replace('/', "\\").to_lowercase() == path_lower
                                    });
                                    if matched {
                                        let _ = cmd("taskkill")
                                            .args(["/F", "/T", "/PID", &pid.as_u32().to_string()])
                                            .output();
                                    }
                                }
                            }
                            if is_restart {
                                std::thread::sleep(std::time::Duration::from_millis(150));
                                let _ = cmd("explorer").arg(&path_owned).spawn();
                                if let Ok(conn) = handle.state::<db::DbState>().0.lock() {
                                    let _ = db::set_last_run(&conn, &path_lower, &db::now_iso());
                                }
                            }
                        });
                    } else if let Some(path) = action.strip_prefix("show_ui|") {
                        // Spawn to avoid holding popup mutex during blocking PowerShell call
                        let path_lower = path.to_lowercase().replace('/', "\\");
                        std::thread::spawn(move || {
                            let sys = refreshed_processes();
                            for (pid, process) in sys.processes() {
                                let name = process.name().to_string_lossy().to_lowercase();
                                if name.contains("autohotkey") {
                                    let cmd_str = process.cmd().iter().map(|s| s.to_string_lossy().into_owned()).collect::<Vec<_>>().join(" ").to_lowercase().replace('/', "\\");
                                    if cmd_str.contains(&path_lower) {
                                        let pid_val = pid.as_u32();
                                        let ps = format!(
                                            "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class W32 {{ [DllImport(\"user32.dll\")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l); [DllImport(\"user32.dll\")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p); public delegate bool EP(IntPtr h, IntPtr l); [DllImport(\"user32.dll\")] public static extern bool EnumWindows(EP e, IntPtr l); static uint T; static int C; public static int Go(uint pid) {{ T=pid;C=0; EnumWindows((h,l)=>{{ uint p; GetWindowThreadProcessId(h,out p); if(p==T){{ PostMessage(h,0x0401,IntPtr.Zero,IntPtr.Zero); C++; }} return true; }}, IntPtr.Zero); return C; }} }}'; [W32]::Go({})",
                                            pid_val
                                        );
                                        let _ = cmd("powershell").arg("-NoProfile").arg("-Command").arg(ps).output();
                                        break;
                                    }
                                }
                            }
                        });
                    }
                });
            }

            // Build right-click menu
            let empty_running = HashSet::new();
            let menu = build_tray_menu(&handle, &empty_running)?;

            TrayIconBuilder::with_id("main_tray")
                .icon(app.default_window_icon().cloned().expect("no default icon"))
                .menu(&menu)
                .show_menu_on_left_click(false)
                .tooltip("AHK Manager")
                .on_tray_icon_event(|_tray: &TrayIcon<Wry>, event: TrayIconEvent| {
                    match event {
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            position,
                            ..
                        } => {
                            #[cfg(target_os = "windows")]
                            {
                                if native_popup::is_visible() {
                                    native_popup::hide();
                                } else {
                                    // Collect running scripts
                                    let sys = refreshed_processes();
                                    let paths = get_running_ahk_paths(&sys);
                                    let running = collect_running_scripts(&paths);
                                    native_popup::update_scripts(running);
                                    native_popup::show_at(position.x as i32, position.y as i32);
                                }
                            }
                        }
                        _ => {}
                    }
                })
                .on_menu_event(|app: &tauri::AppHandle<Wry>, event: tauri::menu::MenuEvent| {
                    match event.id().as_ref() {
                        "show_window" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                        "quit" => app.exit(0),
                        _ => {}
                    }
                })
                .build(app)?;

            let watcher_shutdown = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
            app.manage(WatcherShutdown(watcher_shutdown.clone()));
            start_process_watcher(handle, watcher_shutdown);

            Ok(())
        })
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    if window.label() == "main" {
                        let close_to_tray = window
                            .app_handle()
                            .state::<TraySettingsState>()
                            .0
                            .lock()
                            .map(|s| s.close_to_tray)
                            .unwrap_or(true);
                        if close_to_tray {
                            api.prevent_close();
                            let _ = window.hide();
                        }
                    }
                }
                // No blur handler for popup — toggle via tray click only
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_scripts,
            run_script,
            kill_script,
            save_script_tags,
            add_script_tag,
            remove_script_tag,
            set_script_hub,
            rename_tag,
            save_tag_order,
            get_tag_order,
            get_tag_icons,
            save_tag_icon,
            load_icon_cache,
            save_icon_to_cache,
            search_icons,
            fetch_icon_paths,
            open_in_explorer,
            edit_script,
            delete_tag,
            toggle_hide_folder,
            get_hidden_folders,
            count_ahk_files,
            show_script_ui,
            restart_script,
            open_with,
            open_url,
            get_scan_paths,
            set_scan_paths,
            get_scan_blacklist,
            set_scan_blacklist,
            everything::check_everything_status,
            everything::launch_everything,
            everything::install_everything,
            read_script_content,
            get_script_status,
            get_tray_settings,
            set_tray_settings,
            show_main_window_cmd,
            quit_app_cmd,
            get_orphaned_scripts_cmd,
            resolve_orphan,
            get_script_meta,
            cleanup_orphans_cmd,
            reset_database_cmd
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
