import { useTranslation } from "react-i18next";

interface EmptyStateProps {
    isPathsEmpty: boolean;
    hasContent: boolean;
    searchQuery: string;
    filterTag: string;
    onAddPath?: () => void;
    onRefresh?: () => void;
    onViewModeChange: (mode: any) => void;
    setSearchQuery: (q: string) => void;
}

export default function EmptyState({ isPathsEmpty, hasContent, searchQuery, filterTag, onAddPath, onRefresh, onViewModeChange, setSearchQuery }: EmptyStateProps) {
    const { t } = useTranslation();
    const isSearching = !!searchQuery.trim();

    return (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center min-h-[400px]">
            {isPathsEmpty ? (
                <div className="max-w-[400px] space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
                    <div className="w-24 h-24 rounded-[32px] bg-white/5 border border-white/10 flex items-center justify-center mx-auto shadow-2xl relative overflow-hidden group/folder">
                        <div className="absolute inset-0 bg-indigo-500/10 opacity-0 group-hover/folder:opacity-100 transition-opacity" />
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-tertiary relative z-10">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                        </svg>
                    </div>
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
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        {t("settings.add_path")}
                    </button>
                </div>
            ) : !hasContent ? (
                <div className="max-w-[400px] space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <div className="w-24 h-24 rounded-[32px] bg-white/5 border border-white/10 flex items-center justify-center mx-auto shadow-2xl relative overflow-hidden group/ghost">
                        <div className="absolute inset-0 bg-white/5 opacity-0 group-hover/ghost:opacity-100 transition-opacity" />
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-tertiary relative z-10">
                            <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                            <circle cx="12" cy="12" r="3" />
                            <line x1="12" y1="18" x2="12" y2="18.01" />
                        </svg>
                    </div>
                    <div className="space-y-3">
                        <h3 className="text-2xl font-black text-white tracking-tight leading-none">{t("hub.no_scripts_title", "No Scripts Detected")}</h3>
                        <p className="text-[13px] text-tertiary/80 leading-relaxed font-medium px-4">
                            {t("hub.no_scripts_desc", "The selected folders don't contain any .ahk files. Try adding scripts or checking your paths.")}
                        </p>
                    </div>
                    <div className="flex gap-4 justify-center">
                        <button
                            onClick={onRefresh}
                            className="h-12 px-6 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded-xl text-[10px] font-black tracking-widest uppercase transition-all border border-white/5 active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M23 4v6h-6" />
                                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                            </svg>
                            {t("settings.manual_scan", "Refresh Scan")}
                        </button>
                        <button
                            onClick={() => onViewModeChange("settings" as any)}
                            className="h-12 px-6 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded-xl text-[10px] font-black tracking-widest uppercase transition-all border border-white/5 active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="3" />
                                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                            </svg>
                            {t("sidebar.settings")}
                        </button>
                    </div>
                </div>
            ) : isSearching ? (
                <div className="max-w-[400px] space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <div className="text-secondary/20">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                    </div>
                    <div className="space-y-2">
                        <h3 className="text-xl font-bold text-white tracking-tight">{t("hub.not_found_title", "Nothing Found")}</h3>
                        <p className="text-xs text-tertiary/60 leading-relaxed font-medium">
                            {t("hub.not_found_desc", "No scripts match your search.")}
                        </p>
                    </div>
                    <button
                        onClick={() => setSearchQuery("")}
                        className="bg-white/5 hover:bg-white/10 text-white/50 hover:text-white px-5 py-2 rounded-xl text-[10px] font-black tracking-widest uppercase transition-all border border-white/5 cursor-pointer"
                    >
                        {t("search.clear_all", "Reset Filters")}
                    </button>
                </div>
            ) : (
                <span className="text-tertiary/20 font-black tracking-[0.2em] uppercase text-sm animate-pulse">
                    {t(filterTag === "all" ? "hub.empty_tree" : "hub.empty_channel")}
                </span>
            )}
        </div>
    );
}
