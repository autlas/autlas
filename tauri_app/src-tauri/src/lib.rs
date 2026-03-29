use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::process::Command;
use std::sync::Mutex;
use sysinfo::System;
use tauri::tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState, TrayIcon};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::{Emitter, Manager, Wry};
use walkdir::WalkDir;

#[cfg(target_os = "windows")]
mod native_popup {
    use windows_sys::Win32::Foundation::*;
    use windows_sys::Win32::Graphics::Gdi::*;
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::UI::WindowsAndMessaging::*;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::*;
    use std::sync::atomic::{AtomicPtr, Ordering};
    use std::sync::Mutex;
    use std::ffi::c_void;

    static POPUP_HWND: AtomicPtr<c_void> = AtomicPtr::new(std::ptr::null_mut());
    // Callback to execute actions (stop script, show window, quit)
    static ACTION_CB: Mutex<Option<Box<dyn Fn(&str) + Send>>> = Mutex::new(None);

    // Running scripts + hover state
    struct PopupState {
        scripts: Vec<RunningScript>,
        hover_index: i32, // -1 = none, 0..n = script row, 100 = show window, 101 = quit
        hover_btn: i32,   // -1 = none, 0 = UI, 1 = restart, 2 = stop (within hovered script row)
    }
    pub struct RunningScript {
        pub path: String,
        pub filename: String,
        pub has_ui: bool,
    }
    static STATE: Mutex<Option<PopupState>> = Mutex::new(None);

    const POPUP_VERSION: &str = "v12";
    const DEBUG_PALETTE: bool = false;
    const ITEM_H: i32 = 36;
    const HEADER_H: i32 = 36;
    const FOOTER_H: i32 = 70;
    const WIDTH: i32 = 290;
    const BTN_SIZE: i32 = 23;
    const BTN_GAP: i32 = 2;
    const BTN_RIGHT: i32 = 14;
    // Format: 0x00BBGGRR (confirmed by v7 test)
    const BG_COLOR: u32 = 0x001E1A1A;
    const HOVER_COLOR: u32 = 0x00363030;
    const TEXT_COLOR: u32 = 0x00C8CCCC;
    const DIM_COLOR: u32 = 0x00667070;
    const GREEN_COLOR: u32 = 0x005EC522;     // #22C55E
    const INDIGO_COLOR: u32 = 0x00F16663;    // #6366F1
    const RED_COLOR: u32 = 0x005050F0;       // #F05050
    const YELLOW_COLOR: u32 = 0x000088EE;    // #EE8800 orange
    const RED_HOVER: u32 = 0x006666FF;       // brighter red
    const YELLOW_HOVER: u32 = 0x0020AAFF;    // brighter orange
    const INDIGO_HOVER: u32 = 0x00FF8888;    // brighter indigo

    fn get_y(lparam: LPARAM) -> i32 {
        ((lparam as u32 >> 16) & 0xFFFF) as i16 as i32
    }

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    fn items_height(script_count: usize) -> i32 {
        if script_count == 0 { ITEM_H * 2 } else { script_count as i32 * ITEM_H }
    }

    // Returns (row_index, btn_index): row -1=none, 0..n=script, 100=show, 101=quit; btn -1=row, 0=ui, 1=restart, 2=stop
    fn hit_test(x: i32, y: i32, scripts: &[RunningScript]) -> (i32, i32) {
        if y < HEADER_H { return (-1, -1); }
        let scripts_area = y - HEADER_H;
        let script_idx = scripts_area / ITEM_H;
        if scripts.len() > 0 && (script_idx as usize) < scripts.len() {
            // Check which button is hit (right side)
            let btn_x_start = WIDTH - BTN_RIGHT - BTN_SIZE; // stop btn
            if x >= btn_x_start { return (script_idx, 2); } // stop
            let btn_x_restart = btn_x_start - BTN_GAP - BTN_SIZE;
            if x >= btn_x_restart { return (script_idx, 1); } // restart
            if scripts[script_idx as usize].has_ui {
                let btn_x_ui = btn_x_restart - BTN_GAP - BTN_SIZE;
                if x >= btn_x_ui { return (script_idx, 0); } // UI
            }
            return (script_idx, -1); // row but no button
        }
        let footer_start = HEADER_H + items_height(scripts.len());
        if y >= footer_start && y < footer_start + ITEM_H { return (100, -1); }
        if y >= footer_start + ITEM_H { return (101, -1); }
        (-1, -1)
    }

    fn get_x(lparam: LPARAM) -> i32 {
        (lparam as u32 & 0xFFFF) as i16 as i32
    }

    static FONT: AtomicPtr<c_void> = AtomicPtr::new(std::ptr::null_mut());
    static FONT_SMALL: AtomicPtr<c_void> = AtomicPtr::new(std::ptr::null_mut());
    static FONT_ICON: AtomicPtr<c_void> = AtomicPtr::new(std::ptr::null_mut());

    unsafe fn create_fonts() {
        let name = wide("Segoe UI");
        let f = CreateFontW(-16, 0, 0, 0, 600, 0, 0, 0, 1, 0, 0, 5 /* CLEARTYPE_QUALITY */, 0, name.as_ptr());
        FONT.store(f as _, Ordering::SeqCst);
        let fs = CreateFontW(-13, 0, 0, 0, 700, 0, 0, 0, 1, 0, 0, 5, 0, name.as_ptr());
        FONT_SMALL.store(fs as _, Ordering::SeqCst);
        // Segoe MDL2 Assets for icons (Windows 10+ built-in icon font)
        let icon_name = wide("Segoe MDL2 Assets");
        let fi = CreateFontW(-14, 0, 0, 0, 400, 0, 0, 0, 1, 0, 0, 5, 0, icon_name.as_ptr());
        FONT_ICON.store(fi as _, Ordering::SeqCst);
    }

    unsafe fn draw_icon(hdc: HDC, rc: &RECT, codepoint: u16, color: u32) {
        let old = SelectObject(hdc, FONT_ICON.load(Ordering::SeqCst));
        SetTextColor(hdc, color);
        let ch = [codepoint, 0u16];
        let mut r = *rc;
        DrawTextW(hdc, ch.as_ptr(), 1, &mut r, DT_CENTER | DT_VCENTER | DT_SINGLELINE);
        SelectObject(hdc, old);
    }

    unsafe extern "system" fn wndproc(
        hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM,
    ) -> LRESULT {
        match msg {
            WM_ACTIVATE => {
                if (wparam & 0xFFFF) as u32 == 0 {
                    ShowWindow(hwnd, SW_HIDE);
                }
                0
            }
            WM_MOUSEMOVE => {
                let x = get_x(lparam);
                let y = get_y(lparam);
                let mut repaint = false;
                if let Ok(mut state) = STATE.lock() {
                    if let Some(s) = state.as_mut() {
                        let (idx, btn) = hit_test(x, y, &s.scripts);
                        if idx != s.hover_index || btn != s.hover_btn {
                            s.hover_index = idx;
                            s.hover_btn = btn;
                            repaint = true;
                        }
                    }
                }
                if repaint {
                    InvalidateRect(hwnd, std::ptr::null(), 1);
                }
                let mut tme: TRACKMOUSEEVENT = std::mem::zeroed();
                tme.cbSize = std::mem::size_of::<TRACKMOUSEEVENT>() as u32;
                tme.dwFlags = TME_LEAVE;
                tme.hwndTrack = hwnd;
                TrackMouseEvent(&mut tme);
                0
            }
            0x02A3 /* WM_MOUSELEAVE */ => {
                if let Ok(mut state) = STATE.lock() {
                    if let Some(s) = state.as_mut() {
                        s.hover_index = -1;
                        s.hover_btn = -1;
                    }
                }
                InvalidateRect(hwnd, std::ptr::null(), 1);
                0
            }
            WM_LBUTTONUP => {
                let x = get_x(lparam);
                let y = get_y(lparam);
                let action = {
                    if let Ok(state) = STATE.lock() {
                        if let Some(s) = state.as_ref() {
                            let (idx, btn) = hit_test(x, y, &s.scripts);
                            if idx >= 0 && (idx as usize) < s.scripts.len() {
                                let path = &s.scripts[idx as usize].path;
                                match btn {
                                    0 => Some(format!("show_ui|{}", path)),
                                    1 => Some(format!("restart|{}", path)),
                                    _ => Some(format!("stop|{}", path)),
                                }
                            } else if idx == 100 {
                                Some("show_window".to_string())
                            } else if idx == 101 {
                                Some("quit".to_string())
                            } else { None }
                        } else { None }
                    } else { None }
                };
                if let Some(action) = action {
                    ShowWindow(hwnd, SW_HIDE);
                    if let Ok(cb) = ACTION_CB.lock() {
                        if let Some(f) = cb.as_ref() { f(&action); }
                    }
                }
                0
            }
            WM_PAINT => {
                let mut ps: PAINTSTRUCT = std::mem::zeroed();
                let hdc = BeginPaint(hwnd, &mut ps);
                let bg = CreateSolidBrush(BG_COLOR);
                FillRect(hdc, &ps.rcPaint, bg);
                DeleteObject(bg as _);
                SetBkMode(hdc, 1);

                if DEBUG_PALETTE {
                    let font = FONT.load(Ordering::SeqCst);
                    let font_small = FONT_SMALL.load(Ordering::SeqCst);
                    SelectObject(hdc, font_small);

                    // DEFINITIVE test: 3 big squares + text icon test
                    // Square 1: 0x000000FF - if RED = correct, if BLUE = format is BBGGRR
                    // Square 2: 0x0000FF00 - should be GREEN either way
                    // Square 3: 0x00FF0000 - if BLUE = correct, if RED = format is RRGGBB
                    let test_colors: [(u32, &str); 6] = [
                        (0x000000FF, "0x0000FF"),
                        (0x0000FF00, "0x00FF00"),
                        (0x00FF0000, "0xFF0000"),
                        (0x0000AAEE, "yellow?"),  // test yellow
                        (0x00EEAA00, "yellow2?"), // test yellow other way
                        (0x006366F1, "indigo?"),  // test indigo
                    ];
                    let labels = ["not used"];
                    let icon_colors: [u32; 1] = [0];
                    let icon_codes: [u16; 1] = [0];
                    let palettes: [[u32; 10]; 1] = [[0; 10]]; // unused

                    SelectObject(hdc, font);
                    let sq_size = 60;
                    for (i, (color, label)) in test_colors.iter().enumerate() {
                        let col = (i % 3) as i32;
                        let row = (i / 3) as i32;
                        let x = 10 + col * (sq_size + 10);
                        let y = 30 + row * (sq_size + 30);

                        // Draw square
                        let brush = CreateSolidBrush(*color);
                        let rc = RECT { left: x, top: y, right: x + sq_size, bottom: y + sq_size };
                        FillRect(hdc, &rc, brush);
                        DeleteObject(brush as _);

                        // Also draw icon with same color as text
                        SetTextColor(hdc, *color);
                        let icon = [0xE711u16, 0]; // X icon
                        let mut irc = RECT { left: x, top: y, right: x + sq_size, bottom: y + sq_size };
                        SelectObject(hdc, FONT_ICON.load(Ordering::SeqCst));
                        DrawTextW(hdc, icon.as_ptr(), 1, &mut irc, DT_CENTER | DT_VCENTER | DT_SINGLELINE);

                        // Label below
                        SelectObject(hdc, font_small);
                        SetTextColor(hdc, TEXT_COLOR);
                        let lbl = wide(label);
                        let mut lrc = RECT { left: x, top: y + sq_size, right: x + sq_size + 20, bottom: y + sq_size + 18 };
                        DrawTextW(hdc, lbl.as_ptr(), lbl.len() as i32 - 1, &mut lrc, DT_LEFT | DT_SINGLELINE);
                    }

                    let cell_w = 24;
                    let cell_h = 24;
                    let pad_left = 10;
                    let row_h = 50;
                    let label_h = 16;

                    // Title
                    SetTextColor(hdc, TEXT_COLOR);
                    SelectObject(hdc, font);
                    let title = wide(&format!("COLOR PICKER {}", POPUP_VERSION));
                    let mut trc = RECT { left: 10, top: 4, right: WIDTH, bottom: 24 };
                    DrawTextW(hdc, title.as_ptr(), title.len() as i32 - 1, &mut trc, DT_LEFT | DT_SINGLELINE);

                    // Column numbers
                    SelectObject(hdc, font_small);
                    SetTextColor(hdc, DIM_COLOR);
                    for col in 0..10 {
                        let x = pad_left + col * (cell_w + 2);
                        let num = wide(&format!("{}", col + 1));
                        let mut nrc = RECT { left: x, top: 26, right: x + cell_w, bottom: 40 };
                        DrawTextW(hdc, num.as_ptr(), num.len() as i32 - 1, &mut nrc, DT_CENTER | DT_SINGLELINE);
                    }

                    for (row, (label, bg_colors)) in labels.iter().zip(palettes.iter()).enumerate() {
                        let base_y = 42 + row as i32 * row_h;

                        // Row label
                        SetTextColor(hdc, DIM_COLOR);
                        let lbl = wide(label);
                        let mut lrc = RECT { left: pad_left, top: base_y, right: WIDTH, bottom: base_y + label_h };
                        DrawTextW(hdc, lbl.as_ptr(), lbl.len() as i32 - 1, &mut lrc, DT_LEFT | DT_SINGLELINE);

                        for col in 0..10 {
                            let x = pad_left + col * (cell_w + 2);
                            let y = base_y + label_h + 2;

                            // Draw bg color
                            let cell_bg = CreateSolidBrush(bg_colors[col as usize]);
                            let cell_rc = RECT { left: x, top: y, right: x + cell_w, bottom: y + cell_h };
                            FillRect(hdc, &cell_rc, cell_bg);
                            DeleteObject(cell_bg as _);

                            // Draw icon on top with fixed color
                            draw_icon(hdc, &cell_rc, icon_codes[row], icon_colors[row]);
                        }
                    }

                    EndPaint(hwnd, &ps);
                    return 0;
                }

                let font = FONT.load(Ordering::SeqCst);
                let font_small = FONT_SMALL.load(Ordering::SeqCst);
                let old_font = SelectObject(hdc, font_small);

                let state = STATE.lock().ok();
                let state_ref = state.as_ref().and_then(|s| s.as_ref());
                let scripts = state_ref.map(|s| &s.scripts).cloned().unwrap_or_default();
                let hover = state_ref.map(|s| s.hover_index).unwrap_or(-1);
                let hover_btn = state_ref.map(|s| s.hover_btn).unwrap_or(-1);
                drop(state);

                // Header
                SetTextColor(hdc, DIM_COLOR);
                let header = wide(&format!("AHK MANAGER {}", POPUP_VERSION));
                let mut rc = RECT { left: 16, top: 0, right: WIDTH, bottom: HEADER_H };
                DrawTextW(hdc, header.as_ptr(), header.len() as i32 - 1, &mut rc, DT_LEFT | DT_VCENTER | DT_SINGLELINE);
                if !scripts.is_empty() {
                    SetTextColor(hdc, GREEN_COLOR);
                    let cnt = wide(&format!("{} running", scripts.len()));
                    let mut rc2 = RECT { left: 0, top: 0, right: WIDTH - 16, bottom: HEADER_H };
                    DrawTextW(hdc, cnt.as_ptr(), cnt.len() as i32 - 1, &mut rc2, DT_RIGHT | DT_VCENTER | DT_SINGLELINE);
                }

                // Separator
                let sep = CreateSolidBrush(0x00303038);
                let sep_rc = RECT { left: 12, top: HEADER_H - 1, right: WIDTH - 12, bottom: HEADER_H };
                FillRect(hdc, &sep_rc, sep);
                DeleteObject(sep as _);

                // Switch to main font
                SelectObject(hdc, font);

                // Scripts
                if scripts.is_empty() {
                    SetTextColor(hdc, 0x00444450);
                    let empty = wide("No running scripts");
                    let mut rc = RECT { left: 0, top: HEADER_H, right: WIDTH, bottom: HEADER_H + ITEM_H * 2 };
                    DrawTextW(hdc, empty.as_ptr(), empty.len() as i32 - 1, &mut rc, DT_CENTER | DT_VCENTER | DT_SINGLELINE);
                } else {
                    for (i, script) in scripts.iter().enumerate() {
                        let y = HEADER_H + (i as i32) * ITEM_H;
                        let is_hover = hover == i as i32;

                        // Row hover bg (rounded)
                        if is_hover {
                            let hv = CreateSolidBrush(HOVER_COLOR);
                            let old_brush = SelectObject(hdc, hv as _);
                            let null_pen = CreatePen(5 /* PS_NULL */, 0, 0);
                            let old_pen = SelectObject(hdc, null_pen as _);
                            RoundRect(hdc, 6, y + 2, WIDTH - 6, y + ITEM_H - 2, 8, 8);
                            SelectObject(hdc, old_brush);
                            SelectObject(hdc, old_pen);
                            DeleteObject(hv as _);
                            DeleteObject(null_pen as _);
                        }

                        // Green dot (font-rendered for anti-aliasing)
                        {
                            let dot_font = CreateFontW(-8, 0, 0, 0, 400, 0, 0, 0, 1, 0, 0, 5, 0, wide("Segoe UI").as_ptr());
                            let old_f = SelectObject(hdc, dot_font as _);
                            SetTextColor(hdc, GREEN_COLOR);
                            let dot_ch = [0x25CF_u16, 0]; // ● solid circle
                            let mut dot_rc = RECT { left: 12, top: y + 1, right: 24, bottom: y + ITEM_H + 1 };
                            DrawTextW(hdc, dot_ch.as_ptr(), 1, &mut dot_rc, DT_CENTER | DT_VCENTER | DT_SINGLELINE);
                            SelectObject(hdc, old_f);
                            DeleteObject(dot_font as _);
                        }

                        // Filename (shifted 2px up)
                        SetTextColor(hdc, if is_hover { 0x00FFFFFF } else { TEXT_COLOR });
                        let btn_area = if script.has_ui { 3 } else { 2 };
                        let text_right = if is_hover { WIDTH - 16 - btn_area * (BTN_SIZE + BTN_GAP) } else { WIDTH - 16 };
                        let name = wide(&script.filename.replace(".ahk", "").replace(".AHK", ""));
                        let mut rc = RECT { left: 30, top: y - 2, right: text_right, bottom: y + ITEM_H - 2 };
                        DrawTextW(hdc, name.as_ptr(), name.len() as i32 - 1, &mut rc, DT_LEFT | DT_VCENTER | DT_SINGLELINE | DT_END_ELLIPSIS);

                        // Action buttons (only on hover) — using Segoe MDL2 Assets icons
                        if is_hover {
                            let btn_y = y + (ITEM_H - BTN_SIZE) / 2;
                            // Stop (X) — E711 = Cancel icon
                            let stop_x = WIDTH - BTN_RIGHT - BTN_SIZE;
                            let stop_rc = RECT { left: stop_x, top: btn_y, right: stop_x + BTN_SIZE, bottom: btn_y + BTN_SIZE };
                            if hover_btn == 2 {
                                let hv = CreateSolidBrush(0x00202040);
                                let ob = SelectObject(hdc, hv as _);
                                let np = CreatePen(5, 0, 0);
                                let op = SelectObject(hdc, np as _);
                                RoundRect(hdc, stop_rc.left - 1, stop_rc.top - 1, stop_rc.right + 1, stop_rc.bottom + 1, 6, 6);
                                SelectObject(hdc, ob); SelectObject(hdc, op);
                                DeleteObject(hv as _); DeleteObject(np as _);
                            }
                            draw_icon(hdc, &stop_rc, 0xE711, if hover_btn == 2 { RED_HOVER } else { RED_COLOR });

                            // Restart — E72C = Refresh icon
                            let restart_x = stop_x - BTN_GAP - BTN_SIZE;
                            let restart_rc = RECT { left: restart_x, top: btn_y, right: restart_x + BTN_SIZE, bottom: btn_y + BTN_SIZE };
                            if hover_btn == 1 {
                                let hv = CreateSolidBrush(0x00102030);
                                let ob = SelectObject(hdc, hv as _);
                                let np = CreatePen(5, 0, 0);
                                let op = SelectObject(hdc, np as _);
                                RoundRect(hdc, restart_rc.left - 1, restart_rc.top - 1, restart_rc.right + 1, restart_rc.bottom + 1, 6, 6);
                                SelectObject(hdc, ob); SelectObject(hdc, op);
                                DeleteObject(hv as _); DeleteObject(np as _);
                            }
                            draw_icon(hdc, &restart_rc, 0xE72C, if hover_btn == 1 { YELLOW_HOVER } else { YELLOW_COLOR });

                            // UI — E737 = Page icon
                            if script.has_ui {
                                let ui_x = restart_x - BTN_GAP - BTN_SIZE;
                                let ui_rc = RECT { left: ui_x, top: btn_y, right: ui_x + BTN_SIZE, bottom: btn_y + BTN_SIZE };
                                if hover_btn == 0 {
                                    let hv = CreateSolidBrush(0x00381820);
                                    let ob = SelectObject(hdc, hv as _);
                                    let np = CreatePen(5, 0, 0);
                                    let op = SelectObject(hdc, np as _);
                                    RoundRect(hdc, ui_rc.left - 1, ui_rc.top - 1, ui_rc.right + 1, ui_rc.bottom + 1, 6, 6);
                                    SelectObject(hdc, ob); SelectObject(hdc, op);
                                    DeleteObject(hv as _); DeleteObject(np as _);
                                }
                                draw_icon(hdc, &ui_rc, 0xE737, if hover_btn == 0 { INDIGO_HOVER } else { INDIGO_COLOR });
                            }
                        }
                    }
                }

                // Footer separator
                let footer_y = HEADER_H + items_height(scripts.len());
                let sep2 = CreateSolidBrush(0x00303038);
                let sep2_rc = RECT { left: 12, top: footer_y, right: WIDTH - 12, bottom: footer_y + 1 };
                FillRect(hdc, &sep2_rc, sep2);
                DeleteObject(sep2 as _);

                // Show Window
                SelectObject(hdc, font_small);
                let sw_y = footer_y + 1;
                if hover == 100 {
                    let hv = CreateSolidBrush(HOVER_COLOR);
                    let ob = SelectObject(hdc, hv as _);
                    let np = CreatePen(5, 0, 0);
                    let op = SelectObject(hdc, np as _);
                    RoundRect(hdc, 6, sw_y + 2, WIDTH - 6, sw_y + ITEM_H - 2, 8, 8);
                    SelectObject(hdc, ob); SelectObject(hdc, op);
                    DeleteObject(hv as _); DeleteObject(np as _);
                }
                SetTextColor(hdc, INDIGO_COLOR);
                let sw = wide("SHOW WINDOW");
                let mut sw_rc = RECT { left: 0, top: sw_y, right: WIDTH, bottom: sw_y + ITEM_H };
                DrawTextW(hdc, sw.as_ptr(), sw.len() as i32 - 1, &mut sw_rc, DT_CENTER | DT_VCENTER | DT_SINGLELINE);

                // Quit
                let q_y = sw_y + ITEM_H;
                if hover == 101 {
                    let hv = CreateSolidBrush(HOVER_COLOR);
                    let ob = SelectObject(hdc, hv as _);
                    let np = CreatePen(5, 0, 0);
                    let op = SelectObject(hdc, np as _);
                    RoundRect(hdc, 6, q_y + 2, WIDTH - 6, q_y + ITEM_H - 2, 8, 8);
                    SelectObject(hdc, ob); SelectObject(hdc, op);
                    DeleteObject(hv as _); DeleteObject(np as _);
                }
                SetTextColor(hdc, DIM_COLOR);
                let q = wide("QUIT");
                let mut q_rc = RECT { left: 0, top: q_y, right: WIDTH, bottom: q_y + ITEM_H };
                DrawTextW(hdc, q.as_ptr(), q.len() as i32 - 1, &mut q_rc, DT_CENTER | DT_VCENTER | DT_SINGLELINE);

                SelectObject(hdc, old_font);
                EndPaint(hwnd, &ps);
                0
            }
            WM_DESTROY => 0,
            _ => DefWindowProcW(hwnd, msg, wparam, lparam),
        }
    }

    impl Clone for RunningScript {
        fn clone(&self) -> Self {
            RunningScript { path: self.path.clone(), filename: self.filename.clone(), has_ui: self.has_ui }
        }
    }

    pub fn create_popup() {
        unsafe {
            create_fonts();
            let hinstance = GetModuleHandleW(std::ptr::null());
            let class_name = wide("AHKManagerPopup");

            let wc = WNDCLASSW {
                style: CS_DROPSHADOW,
                lpfnWndProc: Some(wndproc),
                cbClsExtra: 0,
                cbWndExtra: 0,
                hInstance: hinstance,
                hIcon: std::ptr::null_mut(),
                hCursor: LoadCursorW(std::ptr::null_mut(), IDC_ARROW),
                hbrBackground: std::ptr::null_mut(),
                lpszMenuName: std::ptr::null(),
                lpszClassName: class_name.as_ptr(),
            };
            RegisterClassW(&wc);

            let hwnd = CreateWindowExW(
                WS_EX_TOOLWINDOW | WS_EX_TOPMOST,
                class_name.as_ptr(),
                wide("").as_ptr(),
                WS_POPUP,
                0, 0, WIDTH, 200, // height will be adjusted on show
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                hinstance,
                std::ptr::null(),
            );
            POPUP_HWND.store(hwnd, Ordering::SeqCst);
        }
        *STATE.lock().unwrap() = Some(PopupState { scripts: vec![], hover_index: -1, hover_btn: -1 });
    }

    pub fn set_action_callback<F: Fn(&str) + Send + 'static>(f: F) {
        *ACTION_CB.lock().unwrap() = Some(Box::new(f));
    }

    pub fn update_scripts(scripts: Vec<RunningScript>) {
        if let Ok(mut state) = STATE.lock() {
            if let Some(s) = state.as_mut() {
                s.scripts = scripts;
                s.hover_index = -1;
                s.hover_btn = -1;
            }
        }
    }

    pub fn show_at(x: i32, y: i32) {
        let hwnd = POPUP_HWND.load(Ordering::SeqCst);
        if hwnd.is_null() { return; }

        // Calculate height based on scripts count
        let script_count = STATE.lock().ok()
            .and_then(|s| s.as_ref().map(|s| s.scripts.len()))
            .unwrap_or(0);
        let total_h = if DEBUG_PALETTE { 280 } else { HEADER_H + items_height(script_count) + FOOTER_H + 2 };

        unsafe {
            // Resize and position
            SetWindowPos(hwnd, HWND_TOPMOST, x, y - total_h, WIDTH, total_h,
                SWP_NOACTIVATE);
            ShowWindow(hwnd, SW_SHOWNOACTIVATE);
            SetForegroundWindow(hwnd);
        }
    }

    pub fn hide() {
        let hwnd = POPUP_HWND.load(Ordering::SeqCst);
        if hwnd.is_null() { return; }
        unsafe { ShowWindow(hwnd, SW_HIDE); }
    }

    pub fn is_visible() -> bool {
        let hwnd = POPUP_HWND.load(Ordering::SeqCst);
        if hwnd.is_null() { return false; }
        unsafe { IsWindowVisible(hwnd) != 0 }
    }
}

// ── Managed state: single source of truth for tags, prevents race conditions ──
pub struct TagsState(pub Mutex<HashMap<String, Vec<String>>>);
struct TraySettingsState(Mutex<TraySettings>);

#[derive(Serialize, Deserialize, Clone)]
struct TraySettings {
    close_to_tray: bool,
    click_to_toggle: bool,
}

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

fn start_process_watcher(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        // Fresh System each tick to avoid stale process data
        let mut prev = {
            let mut sys = System::new_all();
            sys.refresh_all();
            get_running_ahk_paths(&sys)
        };
        println!("[Watcher] Started. Initially running: {:?}", prev);

        loop {
            std::thread::sleep(std::time::Duration::from_millis(1500));
            let mut sys = System::new_all();
            sys.refresh_all();
            let current = get_running_ahk_paths(&sys);

            for path in current.difference(&prev) {
                println!("[Watcher] Script started: {}", path);
                let has_ui = fs::read_to_string(path)
                    .map(|c| { let t = c.to_lowercase(); t.contains("0x0401") || t.contains("0x401") })
                    .unwrap_or(false);
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

            // Update tray menu when running scripts change
            if current != prev {
                if let Some(tray) = app.tray_by_id("main_tray") {
                    if let Ok(menu) = build_tray_menu(&app, &current) {
                        let _ = tray.set_menu(Some(menu));
                    }
                }
            }

            prev = current;
        }
    });
}

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

struct ManagerMetadata {
    tags: HashMap<String, Vec<String>>, // Path -> Tags
    hidden_folders: Vec<String>,
    scan_paths: Vec<String>,
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
        scan_paths: Vec::new(),
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
            } else if current_section == "scanpaths" {
                if !key.is_empty() {
                    metadata.scan_paths.push(key.to_string());
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

fn get_cache_path() -> std::path::PathBuf {
    get_ini_path().with_file_name("scripts_cache.txt")
}

fn load_cache() -> Option<Vec<String>> {
    let cache_path = get_cache_path();
    if cache_path.exists() {
        if let Ok(content) = fs::read_to_string(cache_path) {
            let paths: Vec<String> = content.lines()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();
            return Some(paths); // empty vec = no scripts, but cache is valid
        }
    }
    None
}

fn save_cache(paths: &[String]) {
    let cache_path = get_cache_path();
    let content = paths.join("\n");
    let _ = fs::write(cache_path, content);
}

#[tauri::command]
async fn get_scripts(force_scan: bool) -> Vec<Script> {
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
    let mut script_paths = Vec::new();

    // Strategy: If not forcing scan, try to use the cache
    let cache_hit = if !force_scan {
        if let Some(cached) = load_cache() {
            println!("[Rust] Loading scripts from cache ({} paths found)", cached.len());
            script_paths = cached;
            true
        } else {
            println!("[Rust] Cache file missing. Proceeding to scan.");
            false
        }
    } else {
        println!("[Rust] Manual refresh requested (force_scan=true). Starting full disk scan...");
        false
    };

    // Only scan disk if we have no cache at all (not just empty cache)
    if !cache_hit {
        if !force_scan {
            println!("[Rust] No cached data available. Starting initial disk scan...");
        }
        let mut scan_dirs = Vec::new();
        
        for p in &metadata.scan_paths {
            let pb = std::path::PathBuf::from(p);
            if pb.exists() && pb.is_dir() {
                scan_dirs.push(pb);
            }
        }

        for dir in scan_dirs {
            for entry in WalkDir::new(&dir).into_iter().filter_map(|e| e.ok()) {
                if entry.path().extension().map_or(false, |ext| ext == "ahk") {
                    script_paths.push(entry.path().to_string_lossy().to_string());
                }
            }
        }
        // Save the result to cache for next time
        save_cache(&script_paths);
    }

    // Now enrich paths with metadata (this part is ALWAYS fresh)
    for path_str in script_paths {
        let path_buf = std::path::PathBuf::from(&path_str);
        if !path_buf.exists() { continue; }

        let path_lower = path_str.to_lowercase();
        let filename = path_buf.file_name().map_or("".to_string(), |f| f.to_string_lossy().to_string());
        let parent = path_buf.parent().map_or("".to_string(), |p| p.file_name().map_or("".to_string(), |f| f.to_string_lossy().to_string()));
        
        let tags = metadata.tags.get(&path_lower).cloned().unwrap_or_default();
        let is_hidden = metadata.hidden_folders.iter().any(|h| path_lower.contains(&h.to_lowercase()));
        let is_running = running_cmds.iter().any(|cmd| cmd.contains(&path_lower));

        let has_ui = if is_running {
            if let Ok(content) = fs::read_to_string(&path_buf) {
                let text = content.to_lowercase();
                text.contains("0x0401") || text.contains("0x401")
            } else { false }
        } else { false };

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
                let _ = Command::new("taskkill")
                    .args(["/F", "/PID", &pid.as_u32().to_string()])
                    .output();
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
                let _ = Command::new("taskkill")
                    .args(["/F", "/PID", &pid.as_u32().to_string()])
                    .output();
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
async fn open_with(path: String) -> Result<(), String> {
    Command::new("rundll32.exe")
        .arg("shell32.dll,OpenAs_RunDLL")
        .arg(&path)
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

#[derive(Serialize)]
struct ScriptStatus {
    is_running: bool,
    has_ui: bool,
}

#[tauri::command]
async fn get_script_status(path: String) -> ScriptStatus {
    let mut sys = System::new_all();
    sys.refresh_all();
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
async fn get_scan_paths() -> Vec<String> {
    load_metadata().scan_paths
}

#[tauri::command]
async fn set_scan_paths(paths: Vec<String>) -> Result<(), String> {
    let ini_path = get_ini_path();
    let bytes = fs::read(&ini_path).unwrap_or_default();
    let content = String::from_utf8_lossy(&bytes).to_string();
    let mut lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();
    
    // Remove existing [ScanPaths] section
    let mut in_scan_paths = false;
    lines.retain(|line| {
        let trimmed = line.trim().to_lowercase();
        if trimmed == "[scanpaths]" {
            in_scan_paths = true;
            false
        } else if trimmed.starts_with('[') {
            in_scan_paths = false;
            true
        } else {
            !in_scan_paths
        }
    });
    
    // Add new section
    lines.push("[ScanPaths]".to_string());
    for path in paths {
        lines.push(format!("{}=1", path));
    }
    
    fs::write(&ini_path, lines.join("\r\n")).map_err(|e| e.to_string())?;
    
    // Clear cache to force rescan with new paths
    let _ = fs::remove_file(get_cache_path());
    
    Ok(())
}

fn load_tray_settings() -> TraySettings {
    let ini_path = get_ini_path();
    let content = fs::read_to_string(&ini_path).unwrap_or_default();
    let mut close_to_tray = true;
    let mut click_to_toggle = true;
    let mut in_settings = false;
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.to_lowercase() == "[settings]" {
            in_settings = true;
            continue;
        }
        if trimmed.starts_with('[') {
            in_settings = false;
            continue;
        }
        if in_settings {
            if let Some(pos) = trimmed.find('=') {
                let key = trimmed[..pos].trim().to_lowercase();
                let val = trimmed[pos + 1..].trim();
                let bool_val = val != "0" && val.to_lowercase() != "false";
                match key.as_str() {
                    "close_to_tray" => close_to_tray = bool_val,
                    "click_to_toggle" => click_to_toggle = bool_val,
                    _ => {}
                }
            }
        }
    }
    TraySettings { close_to_tray, click_to_toggle }
}

fn save_tray_settings(settings: &TraySettings) -> Result<(), String> {
    let ini_path = get_ini_path();
    let content = fs::read_to_string(&ini_path).unwrap_or_default();
    let mut lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();

    let entries = vec![
        ("close_to_tray", settings.close_to_tray),
        ("click_to_toggle", settings.click_to_toggle),
    ];

    // Ensure [Settings] section exists
    let section_exists = lines.iter().any(|l| l.trim().to_lowercase() == "[settings]");
    if !section_exists {
        lines.push("[Settings]".to_string());
    }

    for (key, val) in &entries {
        let new_entry = format!("{}={}", key, val);
        let mut in_settings = false;
        let mut found = false;
        for line in lines.iter_mut() {
            let trimmed = line.trim();
            if trimmed.to_lowercase() == "[settings]" {
                in_settings = true;
                continue;
            }
            if trimmed.starts_with('[') {
                in_settings = false;
                continue;
            }
            if in_settings {
                if let Some(pos) = trimmed.find('=') {
                    if trimmed[..pos].trim().to_lowercase() == *key {
                        *line = new_entry.clone();
                        found = true;
                        break;
                    }
                }
            }
        }
        if !found {
            if let Some(idx) = lines.iter().position(|l| l.trim().to_lowercase() == "[settings]") {
                lines.insert(idx + 1, new_entry);
            }
        }
    }

    fs::write(&ini_path, lines.join("\r\n")).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_tray_settings(state: tauri::State<'_, TraySettingsState>) -> Result<TraySettings, String> {
    let settings = state.0.lock().map_err(|e| e.to_string())?;
    Ok(settings.clone())
}

#[tauri::command]
async fn set_tray_settings(
    state: tauri::State<'_, TraySettingsState>,
    settings: TraySettings,
) -> Result<(), String> {
    let mut current = state.0.lock().map_err(|e| e.to_string())?;
    *current = settings.clone();
    drop(current);
    save_tray_settings(&settings)
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
    app.exit(0);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Seed state from disk on startup
    let initial_tags = load_metadata().tags;
    let initial_tray = load_tray_settings();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .manage(TagsState(Mutex::new(initial_tags)))
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
                        let mut sys = System::new_all();
                        sys.refresh_all();
                        let path_lower = path.to_lowercase().replace('/', "\\");
                        for (pid, process) in sys.processes() {
                            let name = process.name().to_string_lossy().to_lowercase();
                            if name.contains("autohotkey") {
                                let matched = process.cmd().iter().any(|arg| {
                                    arg.to_string_lossy().trim_matches('"').replace('/', "\\").to_lowercase() == path_lower
                                });
                                if matched {
                                    let _ = Command::new("taskkill")
                                        .args(["/F", "/PID", &pid.as_u32().to_string()])
                                        .output();
                                }
                            }
                        }
                        if is_restart {
                            std::thread::sleep(std::time::Duration::from_millis(150));
                            let _ = Command::new("explorer").arg(path).spawn();
                        }
                    } else if let Some(path) = action.strip_prefix("show_ui|") {
                        // Reuse show_script_ui logic via PowerShell PostMessage
                        let mut sys = System::new_all();
                        sys.refresh_all();
                        let path_lower = path.to_lowercase().replace('/', "\\");
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
                                    let _ = Command::new("powershell").arg("-NoProfile").arg("-Command").arg(ps).output();
                                    break;
                                }
                            }
                        }
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
                                    let mut sys = System::new_all();
                                    sys.refresh_all();
                                    let running: Vec<native_popup::RunningScript> = get_running_ahk_paths(&sys)
                                        .into_iter()
                                        .map(|path| {
                                            // path is lowercased; get real filename from filesystem
                                            let pb = std::path::PathBuf::from(&path);
                                            let filename = pb.file_name()
                                                .and_then(|f| {
                                                    // Try to get original casing via canonicalize
                                                    pb.canonicalize().ok()
                                                        .and_then(|c| c.file_name().map(|n| n.to_string_lossy().to_string()))
                                                })
                                                .unwrap_or_else(|| pb.file_name().map(|f| f.to_string_lossy().to_string()).unwrap_or(path.clone()));
                                            let has_ui = fs::read_to_string(&path)
                                                .map(|c| { let t = c.to_lowercase(); t.contains("0x0401") || t.contains("0x401") })
                                                .unwrap_or(false);
                                            native_popup::RunningScript { path, filename, has_ui }
                                        })
                                        .collect();
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

            start_process_watcher(handle);
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
            rename_tag,
            save_tag_order,
            get_tag_order,
            open_in_explorer,
            edit_script,
            delete_tag,
            toggle_hide_folder,
            show_script_ui,
            restart_script,
            open_with,
            get_scan_paths,
            set_scan_paths,
            get_script_status,
            get_tray_settings,
            set_tray_settings,
            show_main_window_cmd,
            quit_app_cmd
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
