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
export const scanPaths: string[] = ["D:/ahk"];
export const scanBlacklist: string[] = [];
export const iconCache: Record<string, [string, string]> = {};
export const traySettings = { close_to_tray: true };

export function findScriptByPath(path: string): Script | undefined {
  return scripts.find((x) => x.path === path);
}

export function findScriptById(id: string): Script | undefined {
  return scripts.find((x) => x.id === id);
}
