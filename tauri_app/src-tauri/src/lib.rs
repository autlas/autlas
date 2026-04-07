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
fn cmd<S: AsRef<std::ffi::OsStr>>(program: S) -> Command {
    let mut c = Command::new(program);
    #[cfg(windows)]
    c.creation_flags(CREATE_NO_WINDOW);
    c
}
use sysinfo::System;
use tauri::tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState, TrayIcon};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::{Emitter, Manager, Wry};
use walkdir::WalkDir;

mod db;
mod migrate;
mod reconcile;

#[cfg(target_os = "windows")]
mod native_popup {
    use windows_sys::Win32::Foundation::*;
    use windows_sys::Win32::Graphics::Gdi::*;
    // Don't use GdiPlus::* — it exports `Ok` which shadows Result::Ok
    use windows_sys::Win32::Graphics::GdiPlus::{
        GdiplusStartup, GdiplusStartupInput, GdipCreateFromHDC, GdipDeleteGraphics,
        GdipSetSmoothingMode, GdipSetTextRenderingHint,
        GdipCreateSolidFill, GdipDeleteBrush, GdipFillRectangle, GdipFillEllipse,
        GdipCreatePath, GdipAddPathArc, GdipClosePathFigure, GdipFillPath, GdipDeletePath,
        GdipCreateFontFamilyFromName, GdipCreateFont, GdipDeleteFont, GdipDeleteFontFamily,
        GdipCreateStringFormat, GdipSetStringFormatAlign, GdipSetStringFormatLineAlign, GdipSetStringFormatFlags, GdipDeleteStringFormat,
        GdipDrawString, GdipMeasureString,
        GpGraphics, GpSolidFill, GpPath, GpFontFamily, GpFont, GpStringFormat,
        RectF,
    };
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::UI::WindowsAndMessaging::*;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::*;
    use std::sync::atomic::{AtomicPtr, AtomicUsize, Ordering};
    use std::sync::Mutex;
    use std::ffi::c_void;

    static POPUP_HWND: AtomicPtr<c_void> = AtomicPtr::new(std::ptr::null_mut());
    static GDI_TOKEN: AtomicUsize = AtomicUsize::new(0);
    static ACTION_CB: Mutex<Option<Box<dyn Fn(&str) + Send>>> = Mutex::new(None);

    struct PopupState {
        scripts: Vec<RunningScript>,
        hover_index: i32,
        hover_btn: i32,
    }
    pub struct RunningScript {
        pub path: String,
        pub filename: String,
        pub has_ui: bool,
    }
    static STATE: Mutex<Option<PopupState>> = Mutex::new(None);

    const ITEM_H: i32 = 36;
    const HEADER_H: i32 = 36;
    const FOOTER_H: i32 = 70;
    const WIDTH: i32 = 290;
    const BTN_SIZE: i32 = 23;
    const BTN_GAP: i32 = 2;
    const BTN_RIGHT: i32 = 14;
    // GDI+ ARGB format: 0xAARRGGBB
    const BG: u32       = 0xFF1A1A1E;
    const HOVER_BG: u32 = 0xFF303036;
    const TEXT_CLR: u32 = 0xFFCCCCC8;
    const DIM_CLR: u32  = 0xFF707066;
    const GREEN: u32    = 0xFF22C55E;
    const INDIGO: u32   = 0xFF6366F1;
    const RED: u32      = 0xFFF05050;
    const ORANGE: u32   = 0xFFEE8800;
    const SEP_CLR: u32  = 0xFF383038;

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

    unsafe fn init_gdiplus() {
        let mut token: usize = 0;
        let input = GdiplusStartupInput {
            GdiplusVersion: 1,
            DebugEventCallback: 0,
            SuppressBackgroundThread: 0,
            SuppressExternalCodecs: 0,
        };
        if GdiplusStartup(&mut token, &input, std::ptr::null_mut()) == 0 {
            GDI_TOKEN.store(token, Ordering::SeqCst);
        }
    }

    unsafe fn gp_fill_rounded_rect(g: *mut GpGraphics, color: u32, x: f32, y: f32, w: f32, h: f32, r: f32) {
        let mut brush: *mut GpSolidFill = std::ptr::null_mut();
        GdipCreateSolidFill(color, &mut brush);
        let mut path: *mut GpPath = std::ptr::null_mut();
        GdipCreatePath(0, &mut path); // FillModeAlternate
        let d = r * 2.0;
        GdipAddPathArc(path, x, y, d, d, 180.0, 90.0);
        GdipAddPathArc(path, x + w - d, y, d, d, 270.0, 90.0);
        GdipAddPathArc(path, x + w - d, y + h - d, d, d, 0.0, 90.0);
        GdipAddPathArc(path, x, y + h - d, d, d, 90.0, 90.0);
        GdipClosePathFigure(path);
        GdipFillPath(g, brush as _, path);
        GdipDeletePath(path);
        GdipDeleteBrush(brush as _);
    }

    unsafe fn gp_fill_circle(g: *mut GpGraphics, color: u32, cx: f32, cy: f32, r: f32) {
        let mut brush: *mut GpSolidFill = std::ptr::null_mut();
        GdipCreateSolidFill(color, &mut brush);
        GdipFillEllipse(g, brush as _, cx - r, cy - r, r * 2.0, r * 2.0);
        GdipDeleteBrush(brush as _);
    }

    unsafe fn gp_draw_text(g: *mut GpGraphics, text: &str, family_name: &str, size: f32, style: i32, color: u32, rect: RectF, h_align: i32, v_align: i32) {
        let name_w = wide(family_name);
        let mut family: *mut GpFontFamily = std::ptr::null_mut();
        GdipCreateFontFamilyFromName(name_w.as_ptr(), std::ptr::null_mut(), &mut family);
        let mut font: *mut GpFont = std::ptr::null_mut();
        GdipCreateFont(family, size, style, 2 /* UnitPixel */, &mut font);
        let mut fmt: *mut GpStringFormat = std::ptr::null_mut();
        GdipCreateStringFormat(0, 0, &mut fmt);
        GdipSetStringFormatAlign(fmt, h_align);
        GdipSetStringFormatLineAlign(fmt, v_align);
        let mut brush: *mut GpSolidFill = std::ptr::null_mut();
        GdipCreateSolidFill(color, &mut brush);
        let text_w = wide(text);
        GdipDrawString(g, text_w.as_ptr(), -1, font as _, &rect, fmt as _, brush as _);
        GdipDeleteBrush(brush as _);
        GdipDeleteStringFormat(fmt);
        GdipDeleteFont(font);
        GdipDeleteFontFamily(family);
    }

    unsafe fn gp_draw_text_ellipsis(g: *mut GpGraphics, text: &str, family_name: &str, size: f32, style: i32, color: u32, rect: RectF, h_align: i32, v_align: i32) {
        // Manually truncate text and append "..." if it doesn't fit,
        // to avoid GDI+ StringTrimming which messes up letter spacing.
        let name_w = wide(family_name);
        let mut family: *mut GpFontFamily = std::ptr::null_mut();
        GdipCreateFontFamilyFromName(name_w.as_ptr(), std::ptr::null_mut(), &mut family);
        let mut font: *mut GpFont = std::ptr::null_mut();
        GdipCreateFont(family, size, style, 2 /* UnitPixel */, &mut font);
        let mut fmt: *mut GpStringFormat = std::ptr::null_mut();
        GdipCreateStringFormat(0, 0, &mut fmt);
        GdipSetStringFormatAlign(fmt, h_align);
        GdipSetStringFormatLineAlign(fmt, v_align);
        GdipSetStringFormatFlags(fmt, 0x00001000); // NoWrap

        // Measure full text
        let layout = RectF { X: 0.0, Y: 0.0, Width: 10000.0, Height: rect.Height };
        let mut bounds = RectF { X: 0.0, Y: 0.0, Width: 0.0, Height: 0.0 };
        let text_w = wide(text);
        GdipMeasureString(g, text_w.as_ptr(), -1, font as _, &layout, fmt as _, &mut bounds, std::ptr::null_mut(), std::ptr::null_mut());

        let display_text = if bounds.Width > rect.Width {
            // Binary search for max chars that fit with "..."
            let chars: Vec<char> = text.chars().collect();
            let ellipsis_w = {
                let ew = wide("...");
                let mut eb = RectF { X: 0.0, Y: 0.0, Width: 0.0, Height: 0.0 };
                GdipMeasureString(g, ew.as_ptr(), -1, font as _, &layout, fmt as _, &mut eb, std::ptr::null_mut(), std::ptr::null_mut());
                eb.Width
            };
            let max_w = rect.Width - ellipsis_w;
            let mut lo = 0usize;
            let mut hi = chars.len();
            while lo < hi {
                let mid = (lo + hi + 1) / 2;
                let sub: String = chars[..mid].iter().collect();
                let sw = wide(&sub);
                let mut sb = RectF { X: 0.0, Y: 0.0, Width: 0.0, Height: 0.0 };
                GdipMeasureString(g, sw.as_ptr(), -1, font as _, &layout, fmt as _, &mut sb, std::ptr::null_mut(), std::ptr::null_mut());
                if sb.Width <= max_w { lo = mid; } else { hi = mid - 1; }
            }
            let truncated: String = chars[..lo].iter().collect();
            format!("{}...", truncated.trim_end())
        } else {
            text.to_string()
        };

        let mut brush: *mut GpSolidFill = std::ptr::null_mut();
        GdipCreateSolidFill(color, &mut brush);
        let dw = wide(&display_text);
        GdipDrawString(g, dw.as_ptr(), -1, font as _, &rect, fmt as _, brush as _);
        GdipDeleteBrush(brush as _);
        GdipDeleteStringFormat(fmt);
        GdipDeleteFont(font);
        GdipDeleteFontFamily(family);
    }

    unsafe fn gp_fill_rect(g: *mut GpGraphics, color: u32, x: f32, y: f32, w: f32, h: f32) {
        let mut brush: *mut GpSolidFill = std::ptr::null_mut();
        GdipCreateSolidFill(color, &mut brush);
        GdipFillRectangle(g, brush as _, x, y, w, h);
        GdipDeleteBrush(brush as _);
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
                            if idx >= 0 && (idx as usize) < s.scripts.len() && btn >= 0 {
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
                    let should_hide = action == "show_window" || action == "quit";
                    if should_hide {
                        ShowWindow(hwnd, SW_HIDE);
                    }
                    if let Ok(cb) = ACTION_CB.lock() {
                        if let Some(f) = cb.as_ref() { f(&action); }
                    }
                }
                0
            }
            WM_PAINT => {
                let mut ps: PAINTSTRUCT = std::mem::zeroed();
                let hdc = BeginPaint(hwnd, &mut ps);

                // Double-buffer: draw to offscreen bitmap, then blit
                let mut client_rc: RECT = std::mem::zeroed();
                GetClientRect(hwnd, &mut client_rc);
                let cw = client_rc.right;
                let ch = client_rc.bottom;
                let mem_dc = CreateCompatibleDC(hdc);
                let mem_bmp = CreateCompatibleBitmap(hdc, cw, ch);
                let old_bmp = SelectObject(mem_dc, mem_bmp);

                // GDI+ from offscreen DC
                let mut g: *mut GpGraphics = std::ptr::null_mut();
                GdipCreateFromHDC(mem_dc, &mut g);
                GdipSetSmoothingMode(g, 4); // SmoothingModeAntiAlias
                GdipSetTextRenderingHint(g, 3); // TextRenderingHintAntiAliasGridFit

                let state = STATE.lock().ok();
                let state_ref = state.as_ref().and_then(|s| s.as_ref());
                let scripts = state_ref.map(|s| &s.scripts).cloned().unwrap_or_default();
                let hover = state_ref.map(|s| s.hover_index).unwrap_or(-1);
                let hover_btn = state_ref.map(|s| s.hover_btn).unwrap_or(-1);
                drop(state);

                let w = cw as f32;

                // Background
                gp_fill_rect(g, BG, 0.0, 0.0, w, ch as f32);

                // Header
                gp_draw_text(g, "AHK MANAGER", "Segoe UI", 11.0, 1, DIM_CLR,
                    RectF { X: 16.0, Y: 0.0, Width: w, Height: HEADER_H as f32 }, 0, 1);
                if !scripts.is_empty() {
                    let cnt = format!("{} running", scripts.len());
                    gp_draw_text(g, &cnt, "Segoe UI", 13.0, 1, GREEN,
                        RectF { X: 0.0, Y: 0.0, Width: w - 16.0, Height: HEADER_H as f32 }, 2, 1);
                }

                // Separator
                gp_fill_rect(g, SEP_CLR, 12.0, (HEADER_H - 1) as f32, w - 24.0, 1.0);

                // Scripts
                if scripts.is_empty() {
                    gp_draw_text(g, "No running scripts", "Segoe UI", 14.0, 0, 0xFF504450,
                        RectF { X: 0.0, Y: HEADER_H as f32, Width: w, Height: (ITEM_H * 2) as f32 }, 1, 1);
                } else {
                    for (i, script) in scripts.iter().enumerate() {
                        let y = (HEADER_H + (i as i32) * ITEM_H) as f32;
                        let is_hover = hover == i as i32;

                        // Row hover bg
                        if is_hover {
                            gp_fill_rounded_rect(g, HOVER_BG, 6.0, y + 2.0, w - 12.0, ITEM_H as f32 - 4.0, 6.0);
                        }

                        // Green dot (anti-aliased circle)
                        gp_fill_circle(g, GREEN, 18.0, y + ITEM_H as f32 / 2.0, 3.5);

                        // Filename
                        let text_clr = if is_hover { 0xFFFFFFFF } else { TEXT_CLR };
                        let btn_count = if script.has_ui { 3 } else { 2 };
                        let text_w = if is_hover { w - 30.0 - (btn_count as f32) * (BTN_SIZE as f32 + BTN_GAP as f32) - BTN_RIGHT as f32 } else { w - 46.0 };
                        let name = script.filename.replace(".ahk", "").replace(".AHK", "");
                        gp_draw_text_ellipsis(g, &name, "Segoe UI", 16.0, 1, text_clr,
                            RectF { X: 30.0, Y: y + 1.0, Width: text_w, Height: ITEM_H as f32 }, 0, 1);

                        // Action buttons on hover
                        if is_hover {
                            let btn_y = y + (ITEM_H as f32 - BTN_SIZE as f32) / 2.0;
                            let bs = BTN_SIZE as f32;

                            // Stop (X)
                            let stop_x = w - BTN_RIGHT as f32 - bs;
                            if hover_btn == 2 { gp_fill_rounded_rect(g, 0xFF402020, stop_x - 1.0, btn_y - 1.0, bs + 2.0, bs + 2.0, 5.0); }
                            // Icon rects offset -1px left, -1px up to visually center MDL2 glyphs
                            let ix = |x: f32| -> RectF { RectF { X: x + 1.0, Y: btn_y + 2.0, Width: bs, Height: bs } };

                            gp_draw_text(g, "\u{E711}", "Segoe MDL2 Assets", 14.0, 0,
                                if hover_btn == 2 { 0xFFFF6666 } else { RED },
                                ix(stop_x), 1, 1);

                            // Restart
                            let restart_x = stop_x - BTN_GAP as f32 - bs;
                            if hover_btn == 1 { gp_fill_rounded_rect(g, 0xFF302810, restart_x - 1.0, btn_y - 1.0, bs + 2.0, bs + 2.0, 5.0); }
                            gp_draw_text(g, "\u{E72C}", "Segoe MDL2 Assets", 14.0, 0,
                                if hover_btn == 1 { 0xFFFFAA30 } else { ORANGE },
                                ix(restart_x), 1, 1);

                            // UI
                            if script.has_ui {
                                let ui_x = restart_x - BTN_GAP as f32 - bs;
                                if hover_btn == 0 { gp_fill_rounded_rect(g, 0xFF201838, ui_x - 1.0, btn_y - 1.0, bs + 2.0, bs + 2.0, 5.0); }
                                gp_draw_text(g, "\u{E737}", "Segoe MDL2 Assets", 14.0, 0,
                                    if hover_btn == 0 { 0xFF8888FF } else { INDIGO },
                                    ix(ui_x), 1, 1);
                            }
                        }
                    }
                }

                // Footer
                let footer_y = (HEADER_H + items_height(scripts.len())) as f32;
                gp_fill_rect(g, SEP_CLR, 12.0, footer_y, w - 24.0, 1.0);

                let sw_y = footer_y + 1.0;
                if hover == 100 { gp_fill_rounded_rect(g, HOVER_BG, 6.0, sw_y + 2.0, w - 12.0, ITEM_H as f32 - 4.0, 6.0); }
                gp_draw_text(g, "SHOW WINDOW", "Segoe UI", 13.0, 1, INDIGO,
                    RectF { X: 0.0, Y: sw_y, Width: w, Height: ITEM_H as f32 }, 1, 1);

                let q_y = sw_y + ITEM_H as f32;
                if hover == 101 { gp_fill_rounded_rect(g, HOVER_BG, 6.0, q_y + 2.0, w - 12.0, ITEM_H as f32 - 4.0, 6.0); }
                gp_draw_text(g, "QUIT", "Segoe UI", 13.0, 1, DIM_CLR,
                    RectF { X: 0.0, Y: q_y, Width: w, Height: ITEM_H as f32 }, 1, 1);

                // Cleanup & blit
                GdipDeleteGraphics(g);
                BitBlt(hdc, 0, 0, cw, ch, mem_dc, 0, 0, SRCCOPY);
                SelectObject(mem_dc, old_bmp);
                DeleteObject(mem_bmp as _);
                DeleteDC(mem_dc);
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
            init_gdiplus();
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
        *STATE.lock().unwrap_or_else(|e| e.into_inner()) = Some(PopupState { scripts: vec![], hover_index: -1, hover_btn: -1 });
    }

    pub fn set_action_callback<F: Fn(&str) + Send + 'static>(f: F) {
        *ACTION_CB.lock().unwrap_or_else(|e| e.into_inner()) = Some(Box::new(f));
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
        let total_h = HEADER_H + items_height(script_count) + FOOTER_H + 2;

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

    /// Update scripts and repaint + resize if popup is visible
    pub fn refresh(scripts: Vec<RunningScript>) {
        if !is_visible() { return; }
        let hwnd = POPUP_HWND.load(Ordering::SeqCst);
        if hwnd.is_null() { return; }

        // Update data
        if let Ok(mut state) = STATE.lock() {
            if let Some(s) = state.as_mut() {
                s.scripts = scripts;
                // keep hover_index only if still valid
                let count = s.scripts.len() as i32;
                if s.hover_index >= count { s.hover_index = -1; s.hover_btn = -1; }
            }
        }

        // Resize window to match new script count
        let script_count = STATE.lock().ok()
            .and_then(|s| s.as_ref().map(|s| s.scripts.len()))
            .unwrap_or(0);
        let total_h = HEADER_H + items_height(script_count) + FOOTER_H + 2;
        unsafe {
            SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, WIDTH, total_h,
                SWP_NOMOVE | SWP_NOACTIVATE);
            InvalidateRect(hwnd, std::ptr::null(), 1);
        }
    }
}

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
        let mut sys = System::new_all();
        sys.refresh_all();
        let mut prev = get_running_ahk_paths(&sys);
        println!("[Watcher] Started. Initially running: {:?}", prev);

        while !shutdown.load(std::sync::atomic::Ordering::Relaxed) {
            std::thread::sleep(std::time::Duration::from_millis(1500));
            if shutdown.load(std::sync::atomic::Ordering::Relaxed) { break; }
            // Fresh System each cycle — refresh_processes can miss short-lived processes
            // and refresh_all doesn't remove dead ones. Fresh snapshot is reliable.
            sys = System::new_all();
            sys.refresh_all();
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

fn find_everything_exe() -> Option<String> {
    use std::process::Command;

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
async fn check_everything_status() -> String {
    if is_everything_running() {
        "running".to_string()
    } else if find_everything_exe().is_some() || es_exe_available() {
        "installed".to_string()
    } else {
        "not_installed".to_string()
    }
}

#[tauri::command]
async fn launch_everything() -> Result<(), String> {
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
async fn install_everything(window: tauri::Window) -> Result<(), String> {
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

fn scan_with_everything(scan_dirs: &[std::path::PathBuf]) -> Option<Vec<String>> {
    use std::process::Command;

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

#[tauri::command]
async fn get_scripts(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, db::DbState>,
    force_scan: bool,
) -> Result<Vec<Script>, String> {
    use tauri::Emitter;
    let start = std::time::Instant::now();

    // Collect running processes (always needed)
    let mut sys = System::new_all();
    sys.refresh_all();
    let mut running_cmds = Vec::new();
    for (_pid, process) in sys.processes() {
        let name = process.name().to_string_lossy().to_lowercase();
        if name.contains("autohotkey") {
            let proc_cmd: Vec<String> = process.cmd().iter().map(|s| s.to_string_lossy().into_owned()).collect();
            running_cmds.push(proc_cmd.join(" ").to_lowercase());
        }
    }

    // Read config from DB (short lock)
    let (scan_paths_list, hidden_folders) = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        (db::get_scan_paths(&conn), db::get_hidden_folders(&conn))
    };

    // Resolve script paths
    let mut script_paths: Vec<String>;
    let tags_map: HashMap<String, Vec<String>>;
    let id_map: HashMap<String, String>;

    if force_scan {
        // FULL SCAN: disk scan + reconciliation
        println!("[Rust] Manual refresh requested (force_scan=true). Starting full disk scan...");
        let scan_start = std::time::Instant::now();
        let mut scan_dirs = Vec::new();
        for p in &scan_paths_list {
            let pb = std::path::PathBuf::from(p);
            if pb.exists() && pb.is_dir() { scan_dirs.push(pb); }
        }

        let everything_result = scan_with_everything(&scan_dirs);
        if let Some(paths) = everything_result {
            script_paths = paths;
            println!("[Rust] Everything scan completed: {} scripts in {:.1?}", script_paths.len(), scan_start.elapsed());
        } else {
            script_paths = Vec::new();
            let mut last_emitted = 0usize;
            for dir in scan_dirs {
                for entry in WalkDir::new(&dir).into_iter().filter_map(|e| e.ok()) {
                    if entry.path().extension().map_or(false, |ext| ext == "ahk") {
                        script_paths.push(entry.path().to_string_lossy().to_string());
                        let count = script_paths.len();
                        if count >= last_emitted + 25 {
                            last_emitted = count;
                            let _ = app_handle.emit("scan-progress", count);
                        }
                    }
                }
            }
            println!("[Rust] WalkDir scan completed: {} scripts in {:.1?}", script_paths.len(), scan_start.elapsed());
        }
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

        let disk_paths: HashSet<String> = script_paths.iter()
            .map(|p| p.to_lowercase())
            .filter(|p| std::path::Path::new(p).exists())
            .collect();

        // Reconciliation + tag/ID loading in single lock (prevents watcher interleaving)
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        let pending = reconcile::reconcile(&conn, &disk_paths)?;
        if !pending.is_empty() {
            println!("[Rust] {} pending matches need user confirmation", pending.len());
            let _ = app_handle.emit("orphan-matches-found", &pending);
        }
        tags_map = db::get_all_tags_map(&conn);
        id_map = db::get_all_active_scripts(&conn)
            .into_iter().map(|(id, path)| (path, id)).collect();
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
        } else {
            println!("[Rust] No scripts in DB — returning empty (user should refresh or set up scan paths)");
            script_paths = Vec::new();
        }
        tags_map = db::get_all_tags_map(&conn);
        id_map = db::get_all_active_scripts(&conn)
            .into_iter().map(|(id, path)| (path, id)).collect();
        drop(conn);
    }

    let tagged_count = tags_map.len();
    let total_tags: usize = tags_map.values().map(|v| v.len()).sum();

    // Enrich scripts (file I/O for running scripts only)
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
                let _ = cmd("taskkill")
                    .args(["/F", "/T", "/PID", &pid.as_u32().to_string()])
                    .output();
            }
        }
    }
    Ok(())
}

#[tauri::command]
async fn restart_script(
    state: tauri::State<'_, db::DbState>,
    path: String,
) -> Result<(), String> {
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
                let _ = cmd("taskkill")
                    .args(["/F", "/T", "/PID", &pid.as_u32().to_string()])
                    .output();
            }
        }
    }

    // 2. Wait a bit for the process to fully close
    std::thread::sleep(std::time::Duration::from_millis(150));
    
    // 3. Run it again
    cmd("explorer").arg(&path).spawn().map_err(|e| e.to_string())?;
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let _ = db::set_last_run(&conn, &path.to_lowercase(), &db::now_iso());
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

#[tauri::command]
async fn edit_script(path: String) -> Result<(), String> {
    // Open in default editor using the 'Edit' verb
    cmd("powershell")
        .arg("-NoProfile")
        .arg("-Command")
        .arg(format!("Start-Process -FilePath '{}' -Verb Edit", path))
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn open_url(url: String) -> Result<(), String> {
    cmd("cmd")
        .args(&["/c", "start", "", &url])
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
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
                        result.insert(base_name.clone(), (bold_body, fill_body));
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
    migrate::migrate_if_needed(&conn);
    let initial_tray = load_tray_settings(&conn);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .manage(db::DbState(Mutex::new(conn)))
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
                            let mut sys = System::new_all();
                            sys.refresh_all();
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
                            let mut sys = System::new_all();
                            sys.refresh_all();
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
                                    let mut sys = System::new_all();
                                    sys.refresh_all();
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
            show_script_ui,
            restart_script,
            open_with,
            open_url,
            get_scan_paths,
            set_scan_paths,
            check_everything_status,
            launch_everything,
            install_everything,
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
