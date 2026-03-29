import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { CloseIcon, RestartIcon, InterfaceIcon } from "./ui/Icons";
import type { Script } from "../api";

export default function TrayPopup() {
    const [scripts, setScripts] = useState<Script[]>([]);

    const loadRunning = async () => {
        const all = await invoke<Script[]>("get_scripts", { forceScan: false });
        setScripts(all.filter((s) => s.is_running));
    };

    useEffect(() => {
        loadRunning();

        const unlistenStatus = listen("script-status-changed", () => loadRunning());

        return () => {
            unlistenStatus.then((f) => f());
        };
    }, []);

    const stop = (path: string) => invoke("kill_script", { path });
    const restart = (path: string) => invoke("restart_script", { path });
    const showUI = (s: Script) => invoke("show_script_ui", { path: s.path });

    const showMain = () => invoke("show_main_window_cmd");
    const quit = () => invoke("quit_app_cmd");

    return (
        <div className="w-full h-full flex flex-col bg-[#0c0c0f] text-white select-none overflow-hidden"
             data-tauri-drag-region>
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
                <span className="text-[10px] font-black tracking-[0.25em] uppercase text-tertiary">
                    AHK Manager
                </span>
                {scripts.length > 0 && (
                    <span className="text-[10px] font-bold text-green-500/70 tracking-wider">
                        {scripts.length} running
                    </span>
                )}
            </div>

            {/* Script list */}
            <div className="flex-1 overflow-y-auto px-2 space-y-0.5 scrollbar-thin">
                {scripts.length === 0 ? (
                    <div className="flex items-center justify-center py-8 text-tertiary/40 text-xs font-bold tracking-widest uppercase">
                        No running scripts
                    </div>
                ) : (
                    scripts.map((s) => (
                        <div
                            key={s.path}
                            className="flex items-center h-[38px] px-2.5 rounded-lg hover:bg-white/[0.04] group transition-colors"
                        >
                            <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] flex-shrink-0 animate-status-glow" />
                            <span className="ml-3 text-[13px] font-medium text-secondary/90 truncate flex-1">
                                {s.filename.replace(/\.ahk$/i, "")}
                            </span>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                {s.has_ui && (
                                    <button
                                        onClick={() => showUI(s)}
                                        className="w-6 h-6 flex items-center justify-center rounded-md bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 border-none cursor-pointer transition-colors"
                                    >
                                        <InterfaceIcon />
                                    </button>
                                )}
                                <button
                                    onClick={() => restart(s.path)}
                                    className="w-6 h-6 flex items-center justify-center rounded-md bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20 border-none cursor-pointer transition-colors"
                                >
                                    <RestartIcon size={12} />
                                </button>
                                <button
                                    onClick={() => stop(s.path)}
                                    className="w-6 h-6 flex items-center justify-center rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 border-none cursor-pointer transition-colors"
                                >
                                    <CloseIcon size={12} />
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Footer */}
            <div className="px-2 pb-2 pt-1 space-y-1 border-t border-white/5 mt-1">
                <button
                    onClick={showMain}
                    className="w-full h-9 rounded-lg bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 text-[11px] font-bold tracking-widest uppercase border border-indigo-500/20 cursor-pointer transition-colors"
                >
                    Show Window
                </button>
                <button
                    onClick={quit}
                    className="w-full h-8 rounded-lg bg-transparent text-tertiary/50 hover:text-red-400 hover:bg-red-500/10 text-[10px] font-bold tracking-widest uppercase border-none cursor-pointer transition-colors"
                >
                    Quit
                </button>
            </div>
        </div>
    );
}
