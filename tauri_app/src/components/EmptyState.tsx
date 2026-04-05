import { useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { PlusIcon, CloseIcon, FolderIcon, GearIcon, SyncIcon } from "./ui/Icons";
import EmptyStateIcon from "./ui/EmptyStateIcon";
import { invoke } from "@tauri-apps/api/core";
import Tooltip from "./ui/Tooltip";

interface EmptyStateProps {
    isPathsEmpty: boolean;
    hasContent: boolean;
    searchQuery: string;
    filterTag: string;
    scanPaths?: string[];
    isRefreshing?: boolean;
    onAddPath?: () => void;
    onRemovePath?: (path: string) => void;
    onRefresh?: () => void;
    onOpenSettings?: () => void;
}

function RefreshSyncIcon({ isRefreshing }: { isRefreshing?: boolean }) {
    const iconRef = useRef<HTMLDivElement>(null);
    const animRef = useRef<Animation | null>(null);

    useEffect(() => {
        const el = iconRef.current;
        if (!el) return;

        if (isRefreshing) {
            if (animRef.current) animRef.current.cancel();
            animRef.current = el.animate(
                [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }],
                { duration: 800, iterations: Infinity, easing: "linear" }
            );
        } else {
            if (animRef.current && animRef.current.playState !== "idle") {
                const style = window.getComputedStyle(el);
                const matrix = new DOMMatrix(style.transform);
                const currentAngle = Math.round(Math.atan2(matrix.b, matrix.a) * (180 / Math.PI));
                animRef.current.cancel();
                animRef.current = null;

                const startDeg = currentAngle < 0 ? currentAngle + 360 : currentAngle;
                let targetDeg = startDeg + 360;
                targetDeg = Math.ceil(targetDeg / 180) * 180;

                el.animate(
                    [{ transform: `rotate(${startDeg}deg)` }, { transform: `rotate(${targetDeg}deg)` }],
                    { duration: 800, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)", fill: "forwards" }
                ).onfinish = () => { el.style.transform = `rotate(${targetDeg % 360}deg)`; };
            }
        }
    }, [isRefreshing]);

    return (
        <div ref={iconRef} className="flex items-center justify-center will-change-transform">
            <SyncIcon size={16} />
        </div>
    );
}

export default function EmptyState({ isPathsEmpty, hasContent, searchQuery, filterTag, scanPaths = [], isRefreshing, onAddPath, onRemovePath, onRefresh, onOpenSettings }: EmptyStateProps) {
    const { t } = useTranslation();
    const isSearching = !!searchQuery.trim();

    return (
        <div className="flex flex-col items-center justify-center p-12 text-center h-[calc(100vh-200px)] min-h-[400px]" style={{ paddingBottom: '12vh' }}>
            {isPathsEmpty ? (
                <div className="max-w-[400px] space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
                    <EmptyStateIcon groupName="folder" hoverBg="bg-indigo-500/10">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#555560" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="relative z-10">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                            <line x1="12" y1="11" x2="12" y2="17" />
                            <line x1="9" y1="14" x2="15" y2="14" />
                        </svg>
                    </EmptyStateIcon>
                    <div className="space-y-3">
                        <h3 className="text-2xl font-black text-white tracking-tight leading-none">{t("hub.no_folders_title", "Library is Empty")}</h3>
                        <p className="text-[13px] text-tertiary/80 leading-relaxed font-medium px-4">
                            {t("hub.no_folders_desc", "Configure scan directories in settings to see your scripts here. You can add multiple folders to track all your AHK utilities.")}
                        </p>
                    </div>
                    <button
                        onClick={onAddPath}
                        className="h-14 px-8 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-[11px] font-black tracking-[0.2em] uppercase transition-all shadow-xl shadow-indigo-600/20 active:scale-95 border-none cursor-pointer flex items-center justify-center gap-3 mx-auto"
                    >
                        <PlusIcon size={18} />
                        {t("settings.add_path")}
                    </button>
                </div>
            ) : !hasContent ? (
                <div className="max-w-[1024px] space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <EmptyStateIcon groupName="ghost">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#555560" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="relative z-10">
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                            <line x1="8" y1="8" x2="14" y2="14" />
                            <line x1="14" y1="8" x2="8" y2="14" />
                        </svg>
                    </EmptyStateIcon>
                    <div className="space-y-3">
                        <h3 className="text-2xl font-black text-white tracking-tight leading-none">{t("hub.no_scripts_title", "No Scripts Detected")}</h3>
                        <p className="text-[13px] text-tertiary/80 leading-relaxed font-medium px-4">
                            {t("hub.no_scripts_desc", "The selected folders don't contain any .ahk files. Try adding scripts or checking your paths.")}
                        </p>
                    </div>

                    {scanPaths.length > 0 && (
                        <div className="space-y-2 text-left">
                            {scanPaths.map((path) => (
                                <div key={path} className="flex items-center space-x-3 p-2.5 px-4 bg-white/[0.03] border border-white/10 rounded-2xl hover:bg-white/[0.05] transition-all group">
                                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500/50 group-hover:bg-indigo-500 shadow-lg shadow-indigo-500/20 flex-shrink-0" />
                                    <span className="flex-1 text-[13px] font-bold text-secondary truncate font-mono tracking-tight">{path}</span>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                        <Tooltip text={t("context.show_in_folder")}>
                                            <button
                                                onClick={() => invoke("open_in_explorer", { path })}
                                                className="p-1.5 text-tertiary hover:text-white hover:bg-white/10 rounded-lg transition-all border-none bg-transparent cursor-pointer"
                                            >
                                                <FolderIcon />
                                            </button>
                                        </Tooltip>
                                        <Tooltip text={t("settings.remove_path")}>
                                            <button
                                                onClick={() => onRemovePath?.(path)}
                                                className="p-1.5 text-tertiary hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all border-none bg-transparent cursor-pointer"
                                            >
                                                <CloseIcon />
                                            </button>
                                        </Tooltip>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="flex flex-wrap gap-3 w-full">
                        <button
                            onClick={onAddPath}
                            style={{ flex: '1 1 auto', minWidth: 'fit-content' }}
                            className="h-11 px-[10px] bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white rounded-xl text-xs font-bold transition-all border border-indigo-500/20 hover:border-indigo-500 active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                        >
                            <PlusIcon />
                            {t("settings.add_path")}
                        </button>
                        <button
                            onClick={onRefresh}
                            style={{ flex: '1 1 auto', minWidth: 'fit-content' }}
                            className="h-11 px-[20px] bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded-xl text-xs font-bold transition-all border border-white/5 active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                        >
                            <RefreshSyncIcon isRefreshing={isRefreshing} />
                            {t("settings.manual_scan", "Refresh Scan")}
                        </button>
                    </div>
                </div>
            ) : isSearching ? (
                <div className="max-w-[400px] space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <EmptyStateIcon groupName="search">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#555560" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="relative z-10">
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                    </EmptyStateIcon>
                    <div className="space-y-3">
                        <h3 className="text-2xl font-black text-white tracking-tight leading-none">{t("hub.not_found_title", "Nothing Found")}</h3>
                        <p className="text-[13px] text-tertiary/80 leading-relaxed font-medium px-4">
                            {t("hub.not_found_desc", "No scripts match your search.")}
                        </p>
                    </div>
                    <div className="flex gap-4 justify-center">
                        <button
                            onClick={onRefresh}
                            className="h-12 px-6 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded-xl text-[10px] font-black tracking-widest uppercase transition-all border border-white/5 active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                        >
                            <RefreshSyncIcon isRefreshing={isRefreshing} />
                            {t("settings.manual_scan", "Refresh Scan")}
                        </button>
                        <button
                            onClick={onOpenSettings}
                            className="h-12 px-6 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded-xl text-[10px] font-black tracking-widest uppercase transition-all border border-white/5 active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                        >
                            <GearIcon size={14} />
                            {t("sidebar.settings")}
                        </button>
                    </div>
                </div>
            ) : (
                <span className="text-tertiary/20 font-black tracking-[0.2em] uppercase text-sm animate-pulse">
                    {t(filterTag === "all" ? "hub.empty_tree" : "hub.empty_channel")}
                </span>
            )}
        </div>
    );
}
