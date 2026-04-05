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

// ── Managed state: single source of truth for tags, prevents race conditions ──
pub struct TagsState(pub Mutex<HashMap<String, Vec<String>>>);
struct TraySettingsState(Mutex<TraySettings>);

#[derive(Serialize, Deserialize, Clone)]
struct TraySettings {
    close_to_tray: bool,
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
    path: String,
    filename: String,
    parent: String,
    tags: Vec<String>,
    is_hidden: bool,
    is_running: bool,
    has_ui: bool,
    size: u64,
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

fn find_everything_exe() -> Option<String> {
    use std::process::Command;

    // 1. Check if Everything.exe is in PATH
    if let Ok(output) = Command::new("where.exe").arg("Everything.exe").output() {
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
    if let Ok(output) = Command::new("reg.exe")
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
    if let Ok(output) = Command::new("where.exe").arg("es.exe").output() {
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
    std::process::Command::new("es.exe")
        .arg("-get-everything-version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn is_everything_running() -> bool {
    // Check if Everything IPC is actually available (not just the process)
    if let Ok(output) = std::process::Command::new("es.exe")
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
        std::process::Command::new(&exe_path)
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
        let _ = std::process::Command::new(&exe_path)
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

    let status = std::process::Command::new(&installer_path)
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
    let output = std::process::Command::new("winget")
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
        let output = Command::new("es.exe")
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
async fn get_scripts(app_handle: tauri::AppHandle, force_scan: bool) -> Vec<Script> {
    use tauri::Emitter;
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
        let scan_start = std::time::Instant::now();
        let mut scan_dirs = Vec::new();

        for p in &metadata.scan_paths {
            let pb = std::path::PathBuf::from(p);
            if pb.exists() && pb.is_dir() {
                scan_dirs.push(pb);
            }
        }

        // Try Everything first, fallback to WalkDir
        let everything_result = scan_with_everything(&scan_dirs);
        if let Some(paths) = everything_result {
            script_paths = paths;
            let scan_elapsed = scan_start.elapsed();
            println!("[Rust] Everything scan completed: {} scripts found in {:.1?}", script_paths.len(), scan_elapsed);
        } else {
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
            let scan_elapsed = scan_start.elapsed();
            println!("[Rust] WalkDir scan completed: {} scripts found in {:.1?}", script_paths.len(), scan_elapsed);
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

        let size = fs::metadata(&path_buf).map(|m| m.len()).unwrap_or(0);

        scripts.push(Script {
            path: path_str,
            filename,
            parent,
            tags,
            is_hidden,
            is_running,
            has_ui,
            size,
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
                    .args(["/F", "/T", "/PID", &pid.as_u32().to_string()])
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
                    .args(["/F", "/T", "/PID", &pid.as_u32().to_string()])
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
async fn open_url(url: String) -> Result<(), String> {
    Command::new("cmd")
        .args(&["/c", "start", "", &url])
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn open_with(path: String) -> Result<(), String> {
    // Convert to short (8.3) path to avoid rundll32 issues with spaces
    let short_path = get_short_path(&path).unwrap_or_else(|| path.clone());

    Command::new("rundll32.exe")
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
    let mut in_tag_icons = false;
    let old_lower = old_tag.to_lowercase();

    for line in lines.iter_mut() {
        let trimmed = line.trim();
        let trimmed_lower = trimmed.to_lowercase();

        if trimmed_lower == "[scripts]" {
            in_scripts = true;
            in_tag_icons = false;
            continue;
        }
        if trimmed_lower == "[tagicons]" {
            in_tag_icons = true;
            in_scripts = false;
            continue;
        }
        if trimmed.starts_with('[') {
            in_scripts = false;
            in_tag_icons = false;
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
        } else if in_tag_icons {
            if let Some(pos) = trimmed.find('=') {
                if trimmed[..pos].trim().to_lowercase() == old_lower {
                    let icon_val = &line[line.find('=').unwrap()+1..];
                    *line = format!("{}={}", new_tag, icon_val.trim());
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
async fn get_tag_icons() -> std::collections::HashMap<String, String> {
    let ini_path = get_ini_path();
    let content = fs::read_to_string(&ini_path).unwrap_or_default();
    let mut result = std::collections::HashMap::new();
    let mut in_section = false;
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.to_lowercase() == "[tagicons]" {
            in_section = true;
            continue;
        }
        if trimmed.starts_with('[') {
            in_section = false;
            continue;
        }
        if in_section {
            if let Some(pos) = line.find('=') {
                let tag = line[..pos].trim().to_string();
                let icon = line[pos+1..].trim().to_string();
                if !tag.is_empty() && !icon.is_empty() {
                    result.insert(tag, icon);
                }
            }
        }
    }
    result
}

#[tauri::command]
async fn save_tag_icon(tag: String, icon: String) -> Result<(), String> {
    let ini_path = get_ini_path();
    let bytes = fs::read(&ini_path).unwrap_or_default();
    let content = String::from_utf8_lossy(&bytes).to_string();
    let mut lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();

    let section_header = "[TagIcons]";
    let key_lower = tag.to_lowercase();
    let mut section_start: Option<usize> = None;
    let mut key_line: Option<usize> = None;
    let mut section_end: Option<usize> = None;

    for i in 0..lines.len() {
        let trimmed = lines[i].trim();
        if trimmed.to_lowercase() == section_header.to_lowercase() {
            section_start = Some(i);
            continue;
        }
        if section_start.is_some() && section_end.is_none() {
            if trimmed.starts_with('[') {
                section_end = Some(i);
                break;
            }
            if let Some(pos) = trimmed.find('=') {
                if trimmed[..pos].trim().to_lowercase() == key_lower {
                    key_line = Some(i);
                }
            }
        }
    }

    if icon.is_empty() {
        // Remove the entry
        if let Some(idx) = key_line {
            lines.remove(idx);
        }
    } else {
        let entry = format!("{}={}", tag, icon);
        if let Some(idx) = key_line {
            lines[idx] = entry;
        } else if let Some(_start) = section_start {
            let insert_at = section_end.unwrap_or(lines.len());
            lines.insert(insert_at, entry);
        } else {
            lines.push(section_header.to_string());
            lines.push(entry);
        }
    }

    fs::write(&ini_path, lines.join("\r\n")).map_err(|e| e.to_string())?;
    Ok(())
}

fn get_icon_cache_path() -> std::path::PathBuf {
    get_ini_path().with_file_name("icon_cache.json")
}

#[tauri::command]
async fn load_icon_cache() -> HashMap<String, (String, String)> {
    let path = get_icon_cache_path();
    if !path.exists() {
        return HashMap::new();
    }
    let content = fs::read_to_string(&path).unwrap_or_default();
    let parsed: HashMap<String, Vec<String>> = serde_json::from_str(&content).unwrap_or_default();
    parsed.into_iter()
        .filter_map(|(k, v)| {
            if v.len() >= 2 { Some((k, (v[0].clone(), v[1].clone()))) } else { None }
        })
        .collect()
}

#[tauri::command]
async fn save_icon_to_cache(name: String, bold: String, fill: String) -> Result<(), String> {
    let path = get_icon_cache_path();
    let mut cache: serde_json::Map<String, serde_json::Value> = if path.exists() {
        let content = fs::read_to_string(&path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        serde_json::Map::new()
    };
    cache.insert(name, serde_json::json!([bold, fill]));
    let json = serde_json::to_string_pretty(&cache).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
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
async fn fetch_icon_paths(names: Vec<String>, prefix: String) -> Result<HashMap<String, (String, String)>, String> {
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

    // Auto-save to cache
    let cache_path = get_icon_cache_path();
    let mut cache: serde_json::Map<String, serde_json::Value> = if cache_path.exists() {
        let content = fs::read_to_string(&cache_path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        serde_json::Map::new()
    };
    for (name, (bold, fill)) in &result {
        cache.insert(name.clone(), serde_json::json!([bold, fill]));
    }
    if let Ok(json) = serde_json::to_string_pretty(&cache) {
        let _ = fs::write(&cache_path, json);
    }

    Ok(result)
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
    let mut in_tag_icons = false;
    let target_lower = tag.to_lowercase();
    let mut lines_to_remove: Vec<usize> = Vec::new();

    for i in 0..lines.len() {
        let trimmed = lines[i].trim();
        let trimmed_lower = trimmed.to_lowercase();

        if trimmed_lower == "[scripts]" {
            in_scripts = true;
            in_general = false;
            in_tag_icons = false;
            continue;
        }
        if trimmed_lower == "[general]" {
            in_general = true;
            in_scripts = false;
            in_tag_icons = false;
            continue;
        }
        if trimmed_lower == "[tagicons]" {
            in_tag_icons = true;
            in_scripts = false;
            in_general = false;
            continue;
        }
        if trimmed.starts_with('[') {
            in_scripts = false;
            in_general = false;
            in_tag_icons = false;
            continue;
        }

        if in_scripts {
             if let Some(pos) = lines[i].find('=') {
                let key = lines[i][..pos].to_string();
                let val = &lines[i][pos+1..];
                let tags: Vec<String> = val.split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty() && s.to_lowercase() != target_lower)
                    .collect();
                lines[i] = format!("{}={}", key, tags.join(","));
             }
        } else if in_general && trimmed_lower.starts_with("tag_order=") {
            if let Some(pos) = lines[i].find('=') {
                let prefix = lines[i][..pos+1].to_string();
                let val = &lines[i][pos+1..];
                let tags: Vec<String> = val.split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty() && s.to_lowercase() != target_lower)
                    .collect();
                lines[i] = format!("{}{}", prefix, tags.join(","));
            }
        } else if in_tag_icons {
            if let Some(pos) = trimmed.find('=') {
                if trimmed[..pos].trim().to_lowercase() == target_lower {
                    lines_to_remove.push(i);
                }
            }
        }
    }

    // Remove tag icon lines in reverse order
    for i in lines_to_remove.into_iter().rev() {
        lines.remove(i);
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
async fn read_script_content(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {}", path, e))
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
                    _ => {}
                }
            }
        }
    }
    TraySettings { close_to_tray }
}

fn save_tray_settings(settings: &TraySettings) -> Result<(), String> {
    let ini_path = get_ini_path();
    let content = fs::read_to_string(&ini_path).unwrap_or_default();
    let mut lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();

    let entries = vec![
        ("close_to_tray", settings.close_to_tray),
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
                                        .args(["/F", "/T", "/PID", &pid.as_u32().to_string()])
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
            quit_app_cmd
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
