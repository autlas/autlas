import { invoke } from "@tauri-apps/api/core";

export async function scanScripts(directories: string[]): Promise<string[]> {
    return await invoke("scan_scripts", { directories });
}

export async function getRunningScripts(): Promise<string[]> {
    return await invoke("get_running_scripts");
}

export async function runScript(path: string): Promise<void> {
    return await invoke("run_script", { path });
}

export async function killScript(path: string): Promise<void> {
    return await invoke("kill_script", { path });
}
