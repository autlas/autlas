import { invoke } from "@tauri-apps/api/core";

// ─── Types ──────────────────────────────────────────────────────

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

export interface ScriptMeta {
    hash: string;
    created: string;
    modified: string;
    last_run: string;
}

export interface ScriptStatus {
    is_running: boolean;
    has_ui: boolean;
}

export interface TraySettings {
    close_to_tray: boolean;
}

export interface PendingMatch {
    orphan_id: string;
    old_path: string;
    new_path: string;
    match_type: string;
    tags: string[];
}

// ─── Scripts ────────────────────────────────────────────────────

export async function getScripts(forceScan: boolean = false): Promise<Script[]> {
    return await invoke("get_scripts", { forceScan });
}

export async function runScript(path: string): Promise<void> {
    return await invoke("run_script", { path });
}

export async function killScript(path: string): Promise<void> {
    return await invoke("kill_script", { path });
}

export async function restartScript(path: string): Promise<void> {
    return await invoke("restart_script", { path });
}

export async function getScriptStatus(path: string): Promise<ScriptStatus> {
    return await invoke("get_script_status", { path });
}

export async function getScriptMeta(path: string): Promise<ScriptMeta> {
    return await invoke("get_script_meta", { path });
}

export async function readScriptContent(path: string): Promise<string> {
    return await invoke("read_script_content", { path });
}

export async function showScriptUI(path: string): Promise<void> {
    return await invoke("show_script_ui", { path });
}

// ─── Tags ───────────────────────────────────────────────────────

export async function saveScriptTags(id: string, tags: string[]): Promise<void> {
    return await invoke("save_script_tags", { id, tags });
}

export async function addScriptTag(id: string, tag: string): Promise<void> {
    return await invoke("add_script_tag", { id, tag });
}

export async function removeScriptTag(id: string, tag: string): Promise<void> {
    return await invoke("remove_script_tag", { id, tag });
}

export async function setScriptHub(id: string, hub: boolean): Promise<void> {
    return await invoke("set_script_hub", { id, hub });
}

export async function renameTag(oldTag: string, newTag: string): Promise<void> {
    return await invoke("rename_tag", { oldTag, newTag });
}

export async function deleteTag(tag: string): Promise<void> {
    return await invoke("delete_tag", { tag });
}

export async function getTagOrder(): Promise<string[]> {
    return await invoke("get_tag_order");
}

export async function saveTagOrder(order: string[]): Promise<void> {
    return await invoke("save_tag_order", { order });
}

export async function getTagIcons(): Promise<Record<string, string>> {
    return await invoke("get_tag_icons");
}

export async function saveTagIcon(tag: string, icon: string): Promise<void> {
    return await invoke("save_tag_icon", { tag, icon });
}

// ─── Icons ──────────────────────────────────────────────────────

export async function loadIconCache(): Promise<Record<string, [string, string]>> {
    return await invoke("load_icon_cache");
}

export async function saveIconToCache(name: string, bold: string, fill: string): Promise<void> {
    return await invoke("save_icon_to_cache", { name, bold, fill });
}

// ─── Folders & Paths ────────────────────────────────────────────

export async function toggleHideFolder(path: string): Promise<void> {
    return await invoke("toggle_hide_folder", { path });
}

export async function getHiddenFolders(): Promise<string[]> {
    return await invoke("get_hidden_folders");
}

export async function openInExplorer(path: string): Promise<void> {
    return await invoke("open_in_explorer", { path });
}

export async function editScript(path: string): Promise<void> {
    return await invoke("edit_script", { path });
}

export async function openWith(path: string): Promise<void> {
    return await invoke("open_with", { path });
}

export async function openUrl(url: string): Promise<void> {
    return await invoke("open_url", { url });
}

// ─── Scan Configuration ─────────────────────────────────────────

export async function getScanPaths(): Promise<string[]> {
    return await invoke("get_scan_paths");
}

export async function setScanPaths(paths: string[]): Promise<void> {
    return await invoke("set_scan_paths", { paths });
}

export async function getScanBlacklist(): Promise<string[]> {
    return await invoke("get_scan_blacklist");
}

export async function setScanBlacklist(paths: string[]): Promise<void> {
    return await invoke("set_scan_blacklist", { paths });
}

// ─── Everything ─────────────────────────────────────────────────

export async function checkEverythingStatus(): Promise<"running" | "installed" | "not_installed"> {
    return await invoke("check_everything_status");
}

export async function launchEverything(): Promise<void> {
    return await invoke("launch_everything");
}

export async function installEverything(): Promise<void> {
    return await invoke("install_everything");
}

// ─── Orphans ────────────────────────────────────────────────────

export async function resolveOrphan(orphanId: string, action: string, newPath?: string): Promise<void> {
    return await invoke("resolve_orphan", { orphanId, action, newPath });
}

export async function cleanupOrphans(): Promise<number> {
    return await invoke("cleanup_orphans_cmd");
}

// ─── Settings & System ──────────────────────────────────────────

export async function getTraySettings(): Promise<TraySettings> {
    return await invoke("get_tray_settings");
}

export async function setTraySettings(settings: TraySettings): Promise<void> {
    return await invoke("set_tray_settings", { settings });
}

export async function resetDatabase(): Promise<void> {
    return await invoke("reset_database_cmd");
}

export async function countAhkFiles(paths: string[]): Promise<number[]> {
    return await invoke("count_ahk_files", { paths });
}

// ─── Icon Search ────────────────────────────────────────────────

export async function searchIcons(query: string, prefix: string): Promise<string[]> {
    return await invoke("search_icons", { query, prefix });
}

export async function fetchIconPaths(names: string[], prefix: string): Promise<Record<string, [string, string]>> {
    return await invoke("fetch_icon_paths", { names, prefix });
}
