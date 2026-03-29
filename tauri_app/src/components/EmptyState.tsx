import { useTranslation } from "react-i18next";
import { PlusIcon, GearIcon, RefreshIcon } from "./ui/Icons";

interface EmptyStateProps {
    isPathsEmpty: boolean;
    hasContent: boolean;
    searchQuery: string;
    filterTag: string;
    onAddPath?: () => void;
    onRefresh?: () => void;
    onOpenSettings?: () => void;
    onViewModeChange: (mode: any) => void;
    setSearchQuery: (q: string) => void;
}

export default function EmptyState({ isPathsEmpty, hasContent, searchQuery, filterTag, onAddPath, onRefresh, onOpenSettings, onViewModeChange, setSearchQuery }: EmptyStateProps) {
    const { t } = useTranslation();
    const isSearching = !!searchQuery.trim();

    return (
        <div className="flex-1 flex flex-col items-center justify-start pt-[22%] p-12 text-center min-h-[400px]">
            {isPathsEmpty ? (
                <div className="max-w-[400px] space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
                    <div className="w-24 h-24 rounded-[32px] bg-white/5 border border-white/10 flex items-center justify-center mx-auto shadow-2xl relative overflow-hidden group/folder">
                        <div className="absolute inset-0 bg-indigo-500/10 opacity-0 group-hover/folder:opacity-100 transition-opacity" />
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#555560" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="relative z-10">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                            <line x1="12" y1="11" x2="12" y2="17" />
                            <line x1="9" y1="14" x2="15" y2="14" />
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
                        <PlusIcon size={18} strokeWidth={3} />
                        {t("settings.add_path")}
                    </button>
                </div>
            ) : !hasContent ? (
                <div className="max-w-[400px] space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <div className="w-24 h-24 rounded-[32px] bg-white/5 border border-white/10 flex items-center justify-center mx-auto shadow-2xl relative overflow-hidden group/ghost">
                        <div className="absolute inset-0 bg-white/5 opacity-0 group-hover/ghost:opacity-100 transition-opacity" />
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#555560" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="relative z-10">
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                            <line x1="8" y1="8" x2="14" y2="14" />
                            <line x1="14" y1="8" x2="8" y2="14" />
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
                            <RefreshIcon />
                            {t("settings.manual_scan", "Refresh Scan")}
                        </button>
                        <button
                            onClick={onOpenSettings}
                            className="h-12 px-6 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded-xl text-[10px] font-black tracking-widest uppercase transition-all border border-white/5 active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                        >
                            <GearIcon size={14} strokeWidth={3} />
                            {t("sidebar.settings")}
                        </button>
                    </div>
                </div>
            ) : isSearching ? (
                <div className="max-w-[400px] space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <div className="w-24 h-24 rounded-[32px] bg-white/5 border border-white/10 flex items-center justify-center mx-auto shadow-2xl relative overflow-hidden group/search">
                        <div className="absolute inset-0 bg-white/5 opacity-0 group-hover/search:opacity-100 transition-opacity" />
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#555560" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="relative z-10">
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                    </div>
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
                            <RefreshIcon />
                            {t("settings.manual_scan", "Refresh Scan")}
                        </button>
                        <button
                            onClick={onOpenSettings}
                            className="h-12 px-6 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded-xl text-[10px] font-black tracking-widest uppercase transition-all border border-white/5 active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                        >
                            <GearIcon size={14} strokeWidth={3} />
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
