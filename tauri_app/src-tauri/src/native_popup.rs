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

/// Check GDI+ status and that the output pointer is non-null; early-return on failure.
macro_rules! gp_ok_ptr {
    ($call:expr, $ptr:expr) => {
        if $call != 0 || $ptr.is_null() { return; }
    };
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
    gp_ok_ptr!(GdipCreateSolidFill(color, &mut brush), brush);
    let mut path: *mut GpPath = std::ptr::null_mut();
    let path_status = GdipCreatePath(0, &mut path); // FillModeAlternate
    if path_status != 0 || path.is_null() { GdipDeleteBrush(brush as _); return; }
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
    gp_ok_ptr!(GdipCreateSolidFill(color, &mut brush), brush);
    GdipFillEllipse(g, brush as _, cx - r, cy - r, r * 2.0, r * 2.0);
    GdipDeleteBrush(brush as _);
}

unsafe fn gp_draw_text(g: *mut GpGraphics, text: &str, family_name: &str, size: f32, style: i32, color: u32, rect: RectF, h_align: i32, v_align: i32) {
    let name_w = wide(family_name);
    let mut family: *mut GpFontFamily = std::ptr::null_mut();
    gp_ok_ptr!(GdipCreateFontFamilyFromName(name_w.as_ptr(), std::ptr::null_mut(), &mut family), family);
    let mut font: *mut GpFont = std::ptr::null_mut();
    if GdipCreateFont(family, size, style, 2, &mut font) != 0 || font.is_null() {
        GdipDeleteFontFamily(family); return;
    }
    let mut fmt: *mut GpStringFormat = std::ptr::null_mut();
    if GdipCreateStringFormat(0, 0, &mut fmt) != 0 || fmt.is_null() {
        GdipDeleteFont(font); GdipDeleteFontFamily(family); return;
    }
    GdipSetStringFormatAlign(fmt, h_align);
    GdipSetStringFormatLineAlign(fmt, v_align);
    let mut brush: *mut GpSolidFill = std::ptr::null_mut();
    if GdipCreateSolidFill(color, &mut brush) != 0 || brush.is_null() {
        GdipDeleteStringFormat(fmt); GdipDeleteFont(font); GdipDeleteFontFamily(family); return;
    }
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
    gp_ok_ptr!(GdipCreateFontFamilyFromName(name_w.as_ptr(), std::ptr::null_mut(), &mut family), family);
    let mut font: *mut GpFont = std::ptr::null_mut();
    if GdipCreateFont(family, size, style, 2, &mut font) != 0 || font.is_null() {
        GdipDeleteFontFamily(family); return;
    }
    let mut fmt: *mut GpStringFormat = std::ptr::null_mut();
    if GdipCreateStringFormat(0, 0, &mut fmt) != 0 || fmt.is_null() {
        GdipDeleteFont(font); GdipDeleteFontFamily(family); return;
    }
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
    if GdipCreateSolidFill(color, &mut brush) != 0 || brush.is_null() {
        GdipDeleteStringFormat(fmt); GdipDeleteFont(font); GdipDeleteFontFamily(family); return;
    }
    let dw = wide(&display_text);
    GdipDrawString(g, dw.as_ptr(), -1, font as _, &rect, fmt as _, brush as _);
    GdipDeleteBrush(brush as _);
    GdipDeleteStringFormat(fmt);
    GdipDeleteFont(font);
    GdipDeleteFontFamily(family);
}

unsafe fn gp_fill_rect(g: *mut GpGraphics, color: u32, x: f32, y: f32, w: f32, h: f32) {
    let mut brush: *mut GpSolidFill = std::ptr::null_mut();
    gp_ok_ptr!(GdipCreateSolidFill(color, &mut brush), brush);
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
        let class_name = wide("autlasPopup");

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
