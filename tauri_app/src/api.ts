import { invoke } from "@tauri-apps/api/core";

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

export async function getScripts(forceScan: boolean = false): Promise<Script[]> {
    return await invoke("get_scripts", { forceScan });
}

export async function runScript(path: string): Promise<void> {
    return await invoke("run_script", { path });
}

export async function killScript(path: string): Promise<void> {
    return await invoke("kill_script", { path });
}

export async function toggleHideFolder(path: string): Promise<void> {
    return await invoke("toggle_hide_folder", { path });
}

export async function readScriptContent(path: string): Promise<string> {
    return await invoke("read_script_content", { path });
}

export async function checkEverythingStatus(): Promise<"running" | "installed" | "not_installed"> {
    return await invoke("check_everything_status");
}

export async function launchEverything(): Promise<void> {
    return await invoke("launch_everything");
}

export async function installEverything(): Promise<void> {
    return await invoke("install_everything");
}

export async function cleanupOrphans(): Promise<number> {
    return await invoke("cleanup_orphans_cmd");
}

export async function resetDatabase(): Promise<void> {
    return await invoke("reset_database_cmd");
}
