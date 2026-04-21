// Shim for @tauri-apps/api/core — invoke() is routed to an in-memory mock.
// Mirrors the backend commands used by tauri_app/src/lib.rs, minus side effects.

import {
  findScriptById,
  findScriptByPath,
  hiddenFolders,
  iconCache,
  markMockDirty,
  scanBlacklist,
  scanPaths,
  scripts,
  scriptSources,
  tagIcons,
  tagOrder,
  traySettings,
  type Script,
} from "./mock-db";
import { __mockEmit } from "./tauri-event";

function cloneScripts(): Script[] {
  return scripts.map((s) => ({ ...s, tags: [...s.tags] }));
}

function emitStatus(s: Script) {
  __mockEmit("script-status-changed", {
    path: s.path,
    is_running: s.is_running,
    has_ui: !!s.has_ui,
  });
}

// Simulated async toggle: pending → applied after `delay` ms.
function simulate(path: string, mut: (s: Script) => void, delay = 700) {
  const s = findScriptByPath(path);
  if (!s) return;
  window.setTimeout(() => {
    mut(s);
    emitStatus(s);
  }, delay);
}

// ── Command dispatcher ─────────────────────────────────────────────
const commands: Record<string, (args: any) => unknown | Promise<unknown>> = {
  // Scripts -------------------------------------------------------
  async get_scripts({ forceScan }: { forceScan?: boolean }) {
    // Fake a scan delay on forced refresh so the sidebar spinner has a
    // real state transition to observe (otherwise isFetching flips
    // true→false in the same render tick and the useEffect misses the
    // change, leaving the icon spinning).
    if (forceScan) {
      await new Promise((r) => window.setTimeout(r, 650));
    }
    return cloneScripts();
  },
  async run_script({ path }: { path: string }) {
    markMockDirty();
    simulate(path, (s) => {
      s.is_running = true;
      s.last_run = new Date().toISOString();
    }, 800);
  },
  async kill_script({ path }: { path: string }) {
    markMockDirty();
    simulate(path, (s) => {
      s.is_running = false;
    }, 500);
  },
  async restart_script({ path }: { path: string }) {
    markMockDirty();
    simulate(path, (s) => {
      s.is_running = true;
      s.last_run = new Date().toISOString();
    }, 900);
  },
  async get_script_status({ path }: { path: string }) {
    const s = findScriptByPath(path);
    return { is_running: s?.is_running ?? false, has_ui: !!s?.has_ui };
  },
  async get_script_meta({ path }: { path: string }) {
    const s = findScriptByPath(path);
    return {
      hash: Math.random().toString(36).slice(2, 10),
      created: s?.created_at ?? "",
      modified: s?.modified_at ?? "",
      last_run: s?.last_run ?? "",
    };
  },
  async read_script_content({ path }: { path: string }) {
    const s = findScriptByPath(path);
    if (!s) return "; script not found\n";
    if (scriptSources[s.filename]) return scriptSources[s.filename];
    return `; ${s.filename}.ahk — demo stub
; tags: ${s.tags.join(", ") || "(none)"}
#Requires AutoHotkey v2.0
#SingleInstance Force

; This script is a placeholder in the demo — the real one on disk
; would live here. Try the scripts pinned to the Hub for real code.
`;
  },
  async show_script_ui({ path }: { path: string }) {
    console.info("[mock] show_script_ui", path);
  },

  // Tags ---------------------------------------------------------
  async save_script_tags({ id, tags }: { id: string; tags: string[] }) {
    markMockDirty();
    const s = findScriptById(id);
    if (s) s.tags = [...tags];
    // Register any brand-new tag in tagOrder so it becomes visible in the
    // sidebar / hub groupings. Real backend does this via the tags table.
    for (const t of tags) {
      if (!tagOrder.includes(t)) tagOrder.push(t);
    }
  },
  async add_script_tag({ id, tag }: { id: string; tag: string }) {
    markMockDirty();
    const s = findScriptById(id);
    if (s && !s.tags.includes(tag)) s.tags.push(tag);
    if (!tagOrder.includes(tag)) tagOrder.push(tag);
  },
  async remove_script_tag({ id, tag }: { id: string; tag: string }) {
    markMockDirty();
    const s = findScriptById(id);
    if (s) s.tags = s.tags.filter((t) => t !== tag);
  },
  async set_script_hub({ id, hub }: { id: string; hub: boolean }) {
    markMockDirty();
    const s = findScriptById(id);
    if (s) s.is_hub = hub;
  },
  async rename_tag({ oldTag, newTag }: { oldTag: string; newTag: string }) {
    markMockDirty();
    scripts.forEach((s) => {
      s.tags = s.tags.map((t) => (t === oldTag ? newTag : t));
    });
    const i = tagOrder.indexOf(oldTag);
    if (i >= 0) tagOrder[i] = newTag;
    if (tagIcons[oldTag]) {
      tagIcons[newTag] = tagIcons[oldTag];
      delete tagIcons[oldTag];
    }
  },
  async delete_tag({ tag }: { tag: string }) {
    markMockDirty();
    scripts.forEach((s) => {
      s.tags = s.tags.filter((t) => t !== tag);
    });
    const i = tagOrder.indexOf(tag);
    if (i >= 0) tagOrder.splice(i, 1);
    delete tagIcons[tag];
  },
  async get_tag_order() {
    return [...tagOrder];
  },
  async save_tag_order({ order }: { order: string[] }) {
    tagOrder.splice(0, tagOrder.length, ...order);
  },
  async get_tag_icons() {
    return { ...tagIcons };
  },
  async save_tag_icon({ tag, icon }: { tag: string; icon: string }) {
    tagIcons[tag] = icon;
  },

  // Icons --------------------------------------------------------
  async load_icon_cache() {
    return { ...iconCache };
  },
  async save_icon_to_cache({ name, bold, fill }: { name: string; bold: string; fill: string }) {
    iconCache[name] = [bold, fill];
  },

  // Folders & paths ---------------------------------------------
  async toggle_hide_folder({ path }: { path: string }) {
    const i = hiddenFolders.indexOf(path);
    if (i >= 0) hiddenFolders.splice(i, 1);
    else hiddenFolders.push(path);
  },
  async get_hidden_folders() {
    return [...hiddenFolders];
  },
  async open_in_explorer({ path }: { path: string }) {
    console.info("[mock] open_in_explorer", path);
  },
  async edit_script({ path }: { path: string }) {
    console.info("[mock] edit_script", path);
  },
  async open_with({ path }: { path: string }) {
    console.info("[mock] open_with", path);
  },
  async open_url({ url }: { url: string }) {
    window.open(url, "_blank", "noopener,noreferrer");
  },

  // Scan config -------------------------------------------------
  async get_scan_paths() {
    return [...scanPaths];
  },
  async set_scan_paths({ paths }: { paths: string[] }) {
    scanPaths.splice(0, scanPaths.length, ...paths);
  },
  async get_scan_blacklist() {
    return [...scanBlacklist];
  },
  async set_scan_blacklist({ paths }: { paths: string[] }) {
    scanBlacklist.splice(0, scanBlacklist.length, ...paths);
  },

  // Everything --------------------------------------------------
  async check_everything_status() {
    return "running" as const;
  },
  async launch_everything() {
    console.info("[mock] launch_everything");
  },
  async install_everything() {
    console.info("[mock] install_everything");
  },

  // Orphans -----------------------------------------------------
  async resolve_orphan() { /* no-op */ },
  async cleanup_orphans_cmd() { return 0; },

  // Tray / settings --------------------------------------------
  async get_tray_settings() {
    return { ...traySettings };
  },
  async set_tray_settings({ settings }: { settings: typeof traySettings }) {
    Object.assign(traySettings, settings);
  },
  async reset_database_cmd() { /* no-op in demo */ },
  async count_ahk_files({ paths }: { paths: string[] }) {
    return paths.map((p) => scripts.filter((s) => s.path.startsWith(p)).length);
  },

  // Icon search (phosphor) -------------------------------------
  async search_icons({ query }: { query: string; prefix: string }) {
    const all = ["Lightning", "Rocket", "Star", "Heart", "GameController", "Keyboard", "Terminal", "Code", "Wrench", "Bug", "SquaresFour", "ListBullets", "Folder", "File", "Gear", "MagnifyingGlass", "Play", "Pause", "Stop", "X", "Check"];
    const q = query.toLowerCase();
    return all.filter((n) => n.toLowerCase().includes(q));
  },
  async fetch_icon_paths({ names }: { names: string[]; prefix: string }) {
    const out: Record<string, [string, string]> = {};
    names.forEach((n) => { out[n] = iconCache[n] ?? ["", ""]; });
    return out;
  },
};

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const handler = commands[cmd];
  if (!handler) {
    console.warn(`[mock] unhandled invoke:`, cmd, args);
    return undefined as T;
  }
  const out = await handler(args ?? {});
  return out as T;
}
