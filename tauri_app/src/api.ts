import { invoke } from "@tauri-apps/api/core";

export interface Script {
    path: string;
    filename: string;
    parent: string;
    tags: string[];
    is_hidden: boolean;
    is_running: boolean;
}

export async function getScripts(): Promise<Script[]> {
    return await invoke("get_scripts");
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
