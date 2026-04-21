// Mock in-memory DB — backs the tauri invoke shim.
// All state lives in this module, shared across the session.

export interface Script {
  id: string;
  path: string;
  filename: string;
  parent: string;
  tags: string[];
  is_hidden: boolean;
  is_running: boolean;
  has_ui?: boolean;
  size: number;
  created_at: string;
  modified_at: string;
  last_run: string;
  is_hub: boolean;
}

const now = () => new Date().toISOString();

function s(partial: { filename: string; folder: string; tags: string[] } & Partial<Script>): Script {
  const { folder, ...rest } = partial;
  const parent = folder.split(/[\\/]/).pop() ?? folder;
  return {
    id: crypto.randomUUID(),
    is_hidden: false,
    is_running: false,
    has_ui: false,
    size: 1024 + Math.floor(Math.random() * 20000),
    created_at: "2025-01-15T12:00:00Z",
    modified_at: "2026-03-20T18:30:00Z",
    last_run: "",
    is_hub: false,
    ...rest,
    path: `${folder}/${partial.filename}.ahk`,
    parent,
  };
}

// Real-world folder mess — people don't curate their AHK scripts by topic,
// they just leave them wherever they landed. autlas is the thing that
// actually imposes order via tags.
const DL   = "C:/Users/max/Downloads";
const DESK = "C:/Users/max/Desktop";
const DOCS = "C:/Users/max/Documents";
const OD   = "C:/Users/max/OneDrive/AHK";
const GAMES_CS2 = "D:/Games/CS2";
const BACKUP = "D:/_backup/ahk_2023";
const ARCH = "D:/old_stuff/archive/2022";
const DEV  = "D:/dev/tools";
const PROJ = "D:/projects/scratch";
const AHK  = "D:/AHK";

export const scripts: Script[] = [
  // ── games ────────────────────────────────────────────────────
  s({ filename: "CSGO-Crosshair",    folder: DL,             tags: ["games"],              is_hub: true, has_ui: true }),
  s({ filename: "battlenet_login",   folder: `${DESK}/stuff`, tags: ["games"] }),
  s({ filename: "DiscordPTT",        folder: DESK,           tags: ["games"],              is_running: true, is_hub: true, last_run: now() }),
  s({ filename: "steam-bigpic",      folder: `${OD}/games`,  tags: ["games"] }),
  s({ filename: "obs_scene_switch",  folder: DESK,           tags: ["games"] }),
  s({ filename: "twitch_chat_flip",  folder: DL,             tags: ["games"] }),
  s({ filename: "bhop_fix",          folder: `${GAMES_CS2}/tools`, tags: ["games"] }),
  s({ filename: "aim_trainer_timer", folder: `${GAMES_CS2}/tools`, tags: ["games"] }),
  s({ filename: "fps_overlay",       folder: BACKUP,         tags: ["games"],              is_running: true, last_run: now() }),
  s({ filename: "GameModeToggle",    folder: `${DOCS}/AutoHotkey`, tags: ["games", "keys"] }),
  s({ filename: "controller_remap",  folder: ARCH,           tags: ["games", "keys"] }),

  // ── work ─────────────────────────────────────────────────────
  s({ filename: "ClipboardHistory",  folder: AHK,            tags: ["work"], is_running: true, has_ui: true, is_hub: true, last_run: now() }),
  s({ filename: "QuickLauncher",     folder: `${DOCS}/AutoHotkey`, tags: ["work"], has_ui: true, is_hub: true }),
  s({ filename: "pomodoro",          folder: DESK,           tags: ["work"], has_ui: true }),
  s({ filename: "emailpaste",        folder: DL,             tags: ["work"] }),
  s({ filename: "datestamp",         folder: `${OD}/snippets`, tags: ["work"] }),
  s({ filename: "TitleCase",         folder: `${OD}/snippets`, tags: ["work"] }),
  s({ filename: "wordcount_v2",      folder: `${DEV}/misc`,  tags: ["work"] }),
  s({ filename: "text-expander",     folder: `${DOCS}/AutoHotkey`, tags: ["work"], is_running: true, last_run: now() }),
  s({ filename: "ProjectSwitcher",   folder: `${DEV}/macros`, tags: ["work", "keys"], is_running: true, last_run: now() }),

  // ── win / keys ──────────────────────────────────────────────
  s({ filename: "WindowSnap",        folder: AHK,            tags: ["win"], is_hub: true }),
  s({ filename: "altdragwin",        folder: DL,             tags: ["win"], is_running: true, last_run: now() }),
  s({ filename: "hotcorners",        folder: `${PROJ}/wm`,   tags: ["win"], is_running: true, last_run: now() }),
  s({ filename: "AlwaysOnTop",       folder: `${DOCS}/AutoHotkey`, tags: ["win", "keys"] }),
  s({ filename: "CapsToEsc",         folder: AHK,            tags: ["keys"], is_running: true, is_hub: true, last_run: now() }),

  // ── untagged (25), sprayed across the same mix of folders ────
  s({ filename: "MouseJiggler",      folder: DL,             tags: [] }),
  s({ filename: "scrollzoom",        folder: DL,             tags: [] }),
  s({ filename: "volume_wheel",      folder: DESK,           tags: [] }),
  s({ filename: "numpad_macros_old", folder: ARCH,           tags: [] }),
  s({ filename: "chord-keys",        folder: `${PROJ}/wm`,   tags: [] }),
  s({ filename: "MediaKeys",         folder: `${DOCS}/AutoHotkey`, tags: [] }),
  s({ filename: "reload_config",     folder: `${DEV}/macros`, tags: [] }),
  s({ filename: "automute",          folder: DESK,           tags: [] }),
  s({ filename: "screenlock",        folder: `${DESK}/stuff`, tags: [] }),
  s({ filename: "nightshift",        folder: BACKUP,         tags: [] }),
  s({ filename: "coffeebreak",       folder: `${DESK}/stuff`, tags: [] }),
  s({ filename: "kb_layout_fix",     folder: DL,             tags: [] }),
  s({ filename: "focus_follows_mouse", folder: PROJ,         tags: [] }),
  s({ filename: "virtual_desktops",  folder: BACKUP,         tags: [] }),
  s({ filename: "TrayCompact",       folder: `${DEV}/misc`,  tags: [] }),
  s({ filename: "battery_alert",     folder: ARCH,           tags: [] }),
  s({ filename: "notesnip_v3",       folder: `${OD}/snippets`, tags: [] }),
  s({ filename: "EscapeNormalizer",  folder: AHK,            tags: [] }),
  s({ filename: "monitor_swap",      folder: DESK,           tags: [] }),
  s({ filename: "loudbell",          folder: DL,             tags: [] }),
  s({ filename: "clean_taskbar",     folder: `${PROJ}/wm`,   tags: [] }),
  s({ filename: "spotify_pause",     folder: DESK,           tags: [] }),
  s({ filename: "brightness_bump",   folder: BACKUP,         tags: [] }),
  s({ filename: "ReadAloud",         folder: `${DOCS}/AutoHotkey`, tags: [] }),
  s({ filename: "NotificationMute",  folder: `${DEV}/misc`,  tags: [] }),
];

// ── Real-ish AHK v2 source for hub scripts, so the detail panel
//    has something meaningful to syntax-highlight via shiki.
export const scriptSources: Record<string, string> = {
  "CSGO-Crosshair": `#Requires AutoHotkey v2.0
#SingleInstance Force

; ─── Minimalist static crosshair overlay for CS2 ────────────────
; Hotkeys:  F8  toggle     F9  cycle color
CROSSHAIR := {
    size:    12,
    gap:     4,
    thick:   2,
    color:   "00FF66",
    colors:  ["00FF66", "FF3366", "FFCC00", "FFFFFF"],
    idx:     1,
}

gui := Gui("+AlwaysOnTop -Caption +ToolWindow +E0x20")
gui.BackColor := "000000"
WinSetTransColor("000000", gui)

DrawCrosshair() {
    global gui, CROSSHAIR
    gui.Show("w" 64 " h" 64 " NA")
    ; draw four arms around the center gap
    arms := [[0,-1],[0,1],[-1,0],[1,0]]
    for off in arms {
        x := 32 + off[1] * CROSSHAIR.gap
        y := 32 + off[2] * CROSSHAIR.gap
        gui.Add("Progress", "x" x " y" y " w" CROSSHAIR.thick " h" CROSSHAIR.size
                           " Background" CROSSHAIR.color, 0)
    }
}

DrawCrosshair()
F8::gui.Visible ? gui.Hide() : DrawCrosshair()
F9::{
    CROSSHAIR.idx := Mod(CROSSHAIR.idx, CROSSHAIR.colors.Length) + 1
    CROSSHAIR.color := CROSSHAIR.colors[CROSSHAIR.idx]
    DrawCrosshair()
}
`,
  "DiscordPTT": `#Requires AutoHotkey v2.0
#SingleInstance Force

; ─── Push-to-talk override for Discord ──────────────────────────
; While the side mouse button is held, emulate Discord's PTT key
; regardless of which window is focused.
PTT_KEY := "F13"

*XButton2::{
    Send "{" PTT_KEY " down}"
    KeyWait "XButton2"
    Send "{" PTT_KEY " up}"
}

; Quick mute toggle
^+m::Send "^+m"
`,
  "ClipboardHistory": `#Requires AutoHotkey v2.0
#SingleInstance Force

; ─── Lightweight clipboard history (last N text entries) ────────
HISTORY := []
LIMIT   := 50

OnClipboardChange HandleClip

HandleClip(type) {
    if type != 1       ; 1 = text
        return
    text := A_Clipboard
    if text = ""
        return
    HISTORY.InsertAt(1, text)
    if HISTORY.Length > LIMIT
        HISTORY.Pop()
}

; Win+V opens a quick picker
#v::ShowPicker()

ShowPicker() {
    global HISTORY
    g := Gui("+AlwaysOnTop +ToolWindow", "Clipboard")
    lv := g.Add("ListView", "r15 w520", ["Entry"])
    for entry in HISTORY
        lv.Add(, StrReplace(SubStr(entry, 1, 120), "\`n", " ⏎ "))
    lv.OnEvent("DoubleClick", (*) => (A_Clipboard := HISTORY[lv.GetNext()], g.Destroy(), Send("^v")))
    g.Show()
}
`,
  "QuickLauncher": `#Requires AutoHotkey v2.0
#SingleInstance Force

; ─── Spotlight-style quick launcher (Ctrl+Space) ────────────────
APPS := Map(
    "chrome",    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "code",      "C:\\Users\\max\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe",
    "spotify",   "C:\\Users\\max\\AppData\\Roaming\\Spotify\\Spotify.exe",
    "terminal",  "wt.exe",
    "notion",    "C:\\Users\\max\\AppData\\Local\\Programs\\Notion\\Notion.exe",
)

^Space::{
    IB := InputBox("run…", "quick launcher", "w320 h90")
    if IB.Result = "Cancel"
        return
    key := Trim(IB.Value)
    if APPS.Has(key)
        Run APPS[key]
    else
        Run key           ; fallback: raw shell command
}
`,
  "WindowSnap": `#Requires AutoHotkey v2.0
#SingleInstance Force

; ─── Snap the active window to halves/quarters with Win+Arrow ───
SnapTo(rect) {
    hwnd := WinGetID("A")
    if !hwnd
        return
    MonitorGetWorkArea(MonitorGetPrimary(), &l, &t, &r, &b)
    w := r - l, h := b - t
    WinMove(l + rect[1] * w, t + rect[2] * h,
            rect[3] * w,     rect[4] * h, hwnd)
}

#Left::SnapTo([0,     0,     0.5, 1.0])
#Right::SnapTo([0.5,  0,     0.5, 1.0])
#Up::SnapTo([0,       0,     1.0, 0.5])
#Down::SnapTo([0,     0.5,   1.0, 0.5])
#NumpadEnd::SnapTo([0,    0.5, 0.5, 0.5])
#NumpadPgDn::SnapTo([0.5, 0.5, 0.5, 0.5])
#NumpadHome::SnapTo([0,   0,   0.5, 0.5])
#NumpadPgUp::SnapTo([0.5, 0,   0.5, 0.5])
`,
  "CapsToEsc": `#Requires AutoHotkey v2.0
#SingleInstance Force

; ─── CapsLock → Esc on tap, Ctrl on hold ────────────────────────
; Keeps the ergonomic mapping that vim users love without giving up
; CapsLock entirely (hold = Ctrl, tap = Esc).
CapsLock::{
    Send "{Blind}{Ctrl Down}"
    t := A_TickCount
    KeyWait "CapsLock"
    Send "{Blind}{Ctrl Up}"
    if (A_TickCount - t) < 180
        Send "{Esc}"
}

; Shift+CapsLock still toggles actual CapsLock
+CapsLock::SetCapsLockState !GetKeyState("CapsLock", "T")
`,

  "fps_overlay": `#Requires AutoHotkey v2.0
#SingleInstance Force

; ─── Tiny FPS counter in the top-right corner ───────────────────
; Polls the foreground window's frame timing approximation.
overlay := Gui("+AlwaysOnTop -Caption +ToolWindow +E0x20")
overlay.BackColor := "000000"
overlay.SetFont("s10 cLime bold", "JetBrains Mono")
lbl := overlay.Add("Text", "w90 h22", "-- fps")
WinSetTransColor("000000", overlay)
overlay.Show("x" (A_ScreenWidth - 110) " y8 NA")

last := A_TickCount, frames := 0
SetTimer Tick, 16
Tick() {
    global last, frames
    frames++
    now := A_TickCount
    if now - last >= 500 {
        fps := Round(frames * 1000 / (now - last))
        lbl.Value := fps " fps"
        frames := 0, last := now
    }
}

F10::overlay.Visible ? overlay.Hide() : overlay.Show("NA")
`,

  "altdragwin": `#Requires AutoHotkey v2.0
#SingleInstance Force

; ─── Alt+drag to move any window, Alt+right-drag to resize ──────
; Same behaviour most linux WMs have out of the box.

!LButton::DragWindow("move")
!RButton::DragWindow("resize")

DragWindow(mode) {
    MouseGetPos(&mx, &my, &hwnd)
    if !hwnd
        return
    WinGetPos(&wx, &wy, &ww, &wh, hwnd)
    WinActivate hwnd
    while GetKeyState(mode = "move" ? "LButton" : "RButton", "P") {
        MouseGetPos(&cx, &cy)
        if mode = "move"
            WinMove(wx + (cx - mx), wy + (cy - my), , , hwnd)
        else
            WinMove(wx, wy, Max(200, ww + (cx - mx)), Max(120, wh + (cy - my)), hwnd)
        Sleep 8
    }
}
`,

  "hotcorners": `#Requires AutoHotkey v2.0
#SingleInstance Force

; ─── Hot corners: trigger actions when the mouse hits a corner ──
; Top-left   → Show desktop
; Top-right  → Task view
; Bot-right  → Lock screen
EDGE := 2            ; how many pixels count as "in the corner"
COOLDOWN := 900
lastFire := 0

SetTimer Poll, 60
Poll() {
    global lastFire, COOLDOWN, EDGE
    if A_TickCount - lastFire < COOLDOWN
        return
    MouseGetPos &mx, &my
    sw := A_ScreenWidth, sh := A_ScreenHeight
    if mx <= EDGE && my <= EDGE
        Fire("#d")
    else if mx >= sw - EDGE && my <= EDGE
        Fire("#{Tab}")
    else if mx >= sw - EDGE && my >= sh - EDGE
        Fire("#l")
}

Fire(keys) {
    global lastFire
    lastFire := A_TickCount
    Send keys
}
`,

  "text-expander": `#Requires AutoHotkey v2.0
#SingleInstance Force

; ─── Text expansion snippets ────────────────────────────────────
; Type the trigger + space, and the abbreviation is replaced.
::eml::max@example.com
::addr::221B Baker Street, London
::sig::
(
--
Max Heavy
max@example.com
)

; Dynamic ones
::/date::{:}
    SendText FormatTime(, "yyyy-MM-dd")
    return
}
::/time::{:}
    SendText FormatTime(, "HH:mm")
    return
}
`,

  "ProjectSwitcher": `#Requires AutoHotkey v2.0
#SingleInstance Force

; ─── Switch between current work projects in one keystroke ──────
PROJECTS := [
    {name: "autlas",       path: "D:\\code\\autlas",       app: "code.exe"},
    {name: "landing",      path: "D:\\code\\autlas\\landingReact", app: "code.exe"},
    {name: "notes",        path: "D:\\Documents\\notes",   app: "obsidian.exe"},
    {name: "downloads",    path: "C:\\Users\\max\\Downloads", app: "explorer.exe"},
]

^!Space::OpenPicker()

OpenPicker() {
    global PROJECTS
    g := Gui("+AlwaysOnTop +ToolWindow", "projects")
    lv := g.Add("ListView", "r" PROJECTS.Length " w420 -Hdr", ["project"])
    for p in PROJECTS
        lv.Add(, p.name "  —  " p.path)
    lv.ModifyCol(1, 400)
    lv.OnEvent("DoubleClick", (*) => Open(lv.GetNext()))
    g.OnEvent("Escape", (*) => g.Destroy())
    g.Show()
    Open(i) {
        if !i
            return
        p := PROJECTS[i]
        Run p.app ' "' p.path '"'
        g.Destroy()
    }
}
`,
};

export const tagOrder: string[] = [
  "games", "work", "win", "keys",
];

export const tagIcons: Record<string, string> = {
  "games": "joystick",
  "work":  "lightning",
  "win":   "app-window",
  "keys":  "keyboard",
};

export const hiddenFolders: string[] = [];
export const scanPaths: string[] = ["C:/Users/max", "D:/"];
export const scanBlacklist: string[] = [];
export const iconCache: Record<string, [string, string]> = {};
export const traySettings = { close_to_tray: true };

export function findScriptByPath(path: string): Script | undefined {
  return scripts.find((x) => x.path === path);
}

export function findScriptById(id: string): Script | undefined {
  return scripts.find((x) => x.id === id);
}

// ── Dirty-state tracking + in-place reset ─────────────────────────
// Dirty flips to true the first time a mutation hits the mock-db
// (run/kill a script, add/remove a tag, flip is_hub, etc.). The landing
// badge subscribes and swaps into a "reset mock data" button.
//
// Reset is in-place (NOT a page reload): arrays are restored from a
// structuredClone snapshot taken at module init, then an
// `ahk-mock-reset` window event triggers a full re-fetch in the hooks.

const initial = {
  scripts: structuredClone(scripts),
  tagOrder: [...tagOrder],
  tagIcons: { ...tagIcons },
  hiddenFolders: [...hiddenFolders],
  scanPaths: [...scanPaths],
  scanBlacklist: [...scanBlacklist],
};

let dirty = false;
const listeners = new Set<() => void>();

export function isMockDirty(): boolean {
  return dirty;
}
export function subscribeMockDirty(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
export function markMockDirty(): void {
  if (dirty) return;
  dirty = true;
  listeners.forEach((fn) => fn());
}

export function resetMocks(): void {
  // Restore arrays in place so consumers holding references see the
  // new contents. Objects inside `scripts` are deep-cloned so callers
  // can't mutate the snapshot by editing a restored script.
  scripts.splice(0, scripts.length, ...structuredClone(initial.scripts));
  tagOrder.splice(0, tagOrder.length, ...initial.tagOrder);
  Object.keys(tagIcons).forEach((k) => { delete tagIcons[k]; });
  Object.assign(tagIcons, initial.tagIcons);
  hiddenFolders.splice(0, hiddenFolders.length, ...initial.hiddenFolders);
  scanPaths.splice(0, scanPaths.length, ...initial.scanPaths);
  scanBlacklist.splice(0, scanBlacklist.length, ...initial.scanBlacklist);

  dirty = false;
  listeners.forEach((fn) => fn());

  // Nudge the app to re-fetch scripts + tag icons from the (restored)
  // mock-db. useScriptData listens for this event.
  window.dispatchEvent(new CustomEvent("ahk-mock-reset"));
}
