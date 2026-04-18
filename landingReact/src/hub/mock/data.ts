export type ScriptStatus = "stopped" | "running" | "pending-run" | "pending-kill" | "pending-restart";

export interface MockScript {
  id: string;
  filename: string;
  path: string;
  parent: string;
  tags: string[];
  status: ScriptStatus;
  has_ui: boolean;
  size: number;
  created_at: string;
  modified_at: string;
  last_run: string | null;
  is_hub: boolean;
}

export interface TagMeta {
  name: string;
  color: string;
  icon?: string;
}

export const INITIAL_TAGS: TagMeta[] = [
  { name: "gaming", color: "#fbbf24" },
  { name: "productivity", color: "#86efac" },
  { name: "window-mgmt", color: "#93c5fd" },
  { name: "macros", color: "#f472b6" },
  { name: "dev", color: "#fb923c" },
  { name: "vim", color: "#818cf8" },
];

const base = "D:/ahk";

export const INITIAL_SCRIPTS: MockScript[] = [
  { id: "s1",  filename: "ClipboardHistory", path: `${base}/productivity/ClipboardHistory.ahk`, parent: "productivity", tags: ["productivity", "clip", "history"], status: "running", has_ui: true,  size: 8214,  created_at: "2025-11-02", modified_at: "2026-03-18", last_run: "2026-04-18 03:12", is_hub: true  },
  { id: "s2",  filename: "WindowSnap",       path: `${base}/window/WindowSnap.ahk`,             parent: "window",       tags: ["window-mgmt", "tiling"],               status: "stopped", has_ui: false, size: 3420,  created_at: "2025-09-14", modified_at: "2026-02-01", last_run: "2026-04-17 22:10", is_hub: true  },
  { id: "s3",  filename: "AltDragWin",       path: `${base}/window/AltDragWin.ahk`,             parent: "window",       tags: ["window-mgmt", "mouse"],                status: "running", has_ui: false, size: 1920,  created_at: "2025-08-01", modified_at: "2025-12-11", last_run: "2026-04-18 01:02", is_hub: true  },
  { id: "s4",  filename: "CapsToEsc",        path: `${base}/vim/CapsToEsc.ahk`,                 parent: "vim",          tags: ["vim", "keyboard"],                     status: "running", has_ui: false, size: 420,   created_at: "2024-06-22", modified_at: "2025-10-04", last_run: "2026-04-18 03:00", is_hub: true  },
  { id: "s5",  filename: "CSGO-Crosshair",   path: `${base}/gaming/CSGO-Crosshair.ahk`,         parent: "gaming",       tags: ["gaming", "csgo", "crosshair", "fps"],  status: "stopped", has_ui: true,  size: 12422, created_at: "2024-12-01", modified_at: "2026-01-18", last_run: "2026-04-14 20:45", is_hub: true  },
  { id: "s6",  filename: "QuickLauncher",    path: `${base}/productivity/QuickLauncher.ahk`,    parent: "productivity", tags: ["productivity", "launcher"],            status: "stopped", has_ui: true,  size: 18000, created_at: "2025-02-11", modified_at: "2026-03-01", last_run: "2026-04-16 09:30", is_hub: true  },
  { id: "s7",  filename: "BattleNetLogin",   path: `${base}/gaming/BattleNetLogin.ahk`,         parent: "gaming",       tags: ["gaming", "battlenet", "login"],        status: "stopped", has_ui: false, size: 720,   created_at: "2025-07-05", modified_at: "2025-11-19", last_run: null, is_hub: false },
  { id: "s8",  filename: "DiscordPTT",       path: `${base}/gaming/DiscordPTT.ahk`,             parent: "gaming",       tags: ["gaming", "discord", "voice"],          status: "running", has_ui: false, size: 940,   created_at: "2025-04-29", modified_at: "2026-02-22", last_run: "2026-04-18 03:10", is_hub: true  },
  { id: "s9",  filename: "SteamLibrary",     path: `${base}/gaming/SteamLibrary.ahk`,           parent: "gaming",       tags: ["gaming", "steam"],                     status: "stopped", has_ui: false, size: 2100,  created_at: "2025-03-01", modified_at: "2025-09-09", last_run: "2026-02-22 14:10", is_hub: false },
  { id: "s10", filename: "AutoClicker",      path: `${base}/macros/AutoClicker.ahk`,            parent: "macros",       tags: ["macros", "click"],                     status: "stopped", has_ui: true,  size: 3300,  created_at: "2024-11-11", modified_at: "2025-12-30", last_run: "2026-04-10 12:00", is_hub: false },
  { id: "s11", filename: "MouseJiggler",     path: `${base}/macros/MouseJiggler.ahk`,           parent: "macros",       tags: ["macros", "mouse"],                     status: "stopped", has_ui: false, size: 240,   created_at: "2024-10-01", modified_at: "2025-10-01", last_run: null, is_hub: false },
  { id: "s12", filename: "VimKeys",          path: `${base}/vim/VimKeys.ahk`,                   parent: "vim",          tags: ["vim", "keyboard", "modal"],            status: "running", has_ui: false, size: 5600,  created_at: "2024-09-12", modified_at: "2026-03-11", last_run: "2026-04-18 02:55", is_hub: true  },
  { id: "s13", filename: "ChordKeys",        path: `${base}/vim/ChordKeys.ahk`,                 parent: "vim",          tags: ["vim", "chord"],                        status: "stopped", has_ui: false, size: 1800,  created_at: "2025-05-18", modified_at: "2025-11-03", last_run: "2026-04-12 10:20", is_hub: false },
  { id: "s14", filename: "HotCorners",       path: `${base}/window/HotCorners.ahk`,             parent: "window",       tags: ["window-mgmt"],                         status: "running", has_ui: false, size: 1020,  created_at: "2025-08-22", modified_at: "2026-01-05", last_run: "2026-04-17 21:15", is_hub: false },
  { id: "s15", filename: "ScrollZoom",       path: `${base}/macros/ScrollZoom.ahk`,             parent: "macros",       tags: ["macros", "scroll"],                    status: "stopped", has_ui: false, size: 480,   created_at: "2025-01-09", modified_at: "2025-07-17", last_run: null, is_hub: false },
  { id: "s16", filename: "BuildHotkey",      path: `${base}/dev/BuildHotkey.ahk`,               parent: "dev",          tags: ["dev", "build"],                        status: "running", has_ui: false, size: 820,   created_at: "2025-11-30", modified_at: "2026-04-02", last_run: "2026-04-18 02:30", is_hub: false },
  { id: "s17", filename: "GitStatus",        path: `${base}/dev/GitStatus.ahk`,                 parent: "dev",          tags: ["dev", "git"],                          status: "stopped", has_ui: true,  size: 3200,  created_at: "2025-10-14", modified_at: "2026-03-28", last_run: "2026-04-17 17:40", is_hub: false },
  { id: "s18", filename: "LogViewer",        path: `${base}/dev/LogViewer.ahk`,                 parent: "dev",          tags: ["dev", "logs"],                         status: "stopped", has_ui: true,  size: 4800,  created_at: "2024-08-08", modified_at: "2025-09-14", last_run: "2026-04-09 08:12", is_hub: false },
];
