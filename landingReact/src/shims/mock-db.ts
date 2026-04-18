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

function s(partial: Partial<Script> & Pick<Script, "filename" | "parent" | "tags">): Script {
  const base = `D:/ahk/${partial.parent}`;
  return {
    id: crypto.randomUUID(),
    path: `${base}/${partial.filename}.ahk`,
    is_hidden: false,
    is_running: false,
    has_ui: false,
    size: 1024 + Math.floor(Math.random() * 20000),
    created_at: "2025-01-15T12:00:00Z",
    modified_at: "2026-03-20T18:30:00Z",
    last_run: "",
    is_hub: false,
    ...partial,
  };
}

export const scripts: Script[] = [
  s({ filename: "ClipboardHistory", parent: "productivity", tags: ["productivity", "clip", "history"], is_running: true, has_ui: true, is_hub: true, last_run: now() }),
  s({ filename: "WindowSnap",       parent: "window",       tags: ["window-mgmt", "tiling"],               is_hub: true }),
  s({ filename: "AltDragWin",       parent: "window",       tags: ["window-mgmt", "mouse"],                is_running: true, is_hub: true, last_run: now() }),
  s({ filename: "CapsToEsc",        parent: "vim",          tags: ["vim", "keyboard"],                     is_running: true, is_hub: true, last_run: now() }),
  s({ filename: "CSGO-Crosshair",   parent: "gaming",       tags: ["gaming", "csgo", "crosshair", "fps"],  has_ui: true, is_hub: true }),
  s({ filename: "QuickLauncher",    parent: "productivity", tags: ["productivity", "launcher"],            has_ui: true, is_hub: true }),
  s({ filename: "BattleNetLogin",   parent: "gaming",       tags: ["gaming", "battlenet", "login"] }),
  s({ filename: "DiscordPTT",       parent: "gaming",       tags: ["gaming", "discord", "voice"],          is_running: true, is_hub: true, last_run: now() }),
  s({ filename: "SteamLibrary",     parent: "gaming",       tags: ["gaming", "steam"] }),
  s({ filename: "AutoClicker",      parent: "macros",       tags: ["macros", "click"],                     has_ui: true }),
  s({ filename: "MouseJiggler",     parent: "macros",       tags: ["macros", "mouse"] }),
  s({ filename: "VimKeys",          parent: "vim",          tags: ["vim", "keyboard", "modal"],            is_running: true, is_hub: true, last_run: now() }),
  s({ filename: "ChordKeys",        parent: "vim",          tags: ["vim", "chord"] }),
  s({ filename: "HotCorners",       parent: "window",       tags: ["window-mgmt"],                         is_running: true, last_run: now() }),
  s({ filename: "ScrollZoom",       parent: "macros",       tags: ["macros", "scroll"] }),
  s({ filename: "BuildHotkey",      parent: "dev",          tags: ["dev", "build"],                        is_running: true, last_run: now() }),
  s({ filename: "GitStatus",        parent: "dev",          tags: ["dev", "git"],                          has_ui: true }),
  s({ filename: "LogViewer",        parent: "dev",          tags: ["dev", "logs"],                         has_ui: true }),
  s({ filename: "OBS-SceneSwitch",  parent: "gaming",       tags: ["gaming", "obs", "streaming"] }),
  s({ filename: "ProjectSwitcher",  parent: "productivity", tags: ["productivity", "workspace"],           is_running: true, last_run: now() }),
  s({ filename: "NumpadMacros",     parent: "macros",       tags: ["macros", "numpad"] }),
  s({ filename: "ReloadConfig",     parent: "dev",          tags: ["dev", "config"] }),
];

export const tagOrder: string[] = [
  "productivity", "window-mgmt", "vim", "gaming", "macros", "dev",
];

export const tagIcons: Record<string, string> = {
  "productivity": "Lightning",
  "window-mgmt":  "SquaresFour",
  "vim":          "Terminal",
  "gaming":       "GameController",
  "macros":       "Keyboard",
  "dev":          "Code",
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
