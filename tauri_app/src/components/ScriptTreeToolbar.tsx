import React from "react";
import { useTranslation } from "react-i18next";

interface ScriptTreeToolbarProps {
    viewMode: "tree" | "tiles" | "list";
    onViewModeChange: (mode: "tree" | "tiles" | "list") => void;
    isDragging: boolean;
    draggedScriptPath: string | null;
    sortBy: "name" | "path";
    setSortBy: (s: "name" | "path") => void;
    isAllExpanded: boolean;
    toggleAll: () => void;
    searchQuery: string;
    setSearchQuery: (q: string) => void;
    showHidden: 'none' | 'all' | 'only';
    setShowHidden: (v: 'none' | 'all' | 'only') => void;
    filterTag: string;
    searchInputRef: React.RefObject<HTMLInputElement | null>;
    onSearchFocus: () => void;
    onSearchBlur: () => void;
}

export default function ScriptTreeToolbar({
    viewMode, onViewModeChange, isDragging, draggedScriptPath,
    sortBy, setSortBy, isAllExpanded, toggleAll,
    searchQuery, setSearchQuery, showHidden, setShowHidden,
    filterTag, searchInputRef, onSearchFocus, onSearchBlur,
}: ScriptTreeToolbarProps) {
    const { t } = useTranslation();

    const lowerSearch = searchQuery.toLowerCase();
    const prefixMatch = lowerSearch.startsWith("path:") ? "path:" :
        lowerSearch.startsWith("file:") ? "file:" : null;
    const displayValue = prefixMatch ? searchQuery.substring(prefixMatch.length) : searchQuery;

    return (
        <div className={`flex items-center justify-between pt-6 pb-2 border-b transition-all duration-300 ${draggedScriptPath ? 'opacity-20 blur-[1px] pointer-events-none' : ''}`} style={{ borderColor: 'var(--border-color)' }}>
            <div className="flex-1 flex items-center space-x-1">
                <div className="flex bg-white/[0.03] p-1 rounded-xl border border-white/5 h-[42px] items-center">
                    {[
                        {
                            id: "tree",
                            icon: (isCurrent: boolean) => (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-opacity duration-200 ${isCurrent ? 'opacity-100' : 'opacity-25'}`}>
                                    <circle cx="6" cy="6" r="2" />
                                    <path d="M6 8v12h8M6 13h8" />
                                    <circle cx="16" cy="13" r="2" />
                                    <circle cx="16" cy="20" r="2" />
                                </svg>
                            )
                        },
                        {
                            id: "tiles",
                            icon: (isCurrent: boolean) => (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-opacity duration-200 ${isCurrent ? 'opacity-100' : 'opacity-25'}`}>
                                    <rect x="3" y="3" width="7" height="7" rx="1" ry="1" />
                                    <rect x="14" y="3" width="7" height="7" rx="1" ry="1" />
                                    <rect x="14" y="14" width="7" height="7" rx="1" ry="1" />
                                    <rect x="3" y="14" width="7" height="7" rx="1" ry="1" />
                                </svg>
                            )
                        },
                        {
                            id: "list",
                            icon: (isCurrent: boolean) => (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-opacity duration-200 ${isCurrent ? 'opacity-100' : 'opacity-25'}`}>
                                    <line x1="3" y1="6" x2="10" y2="6" /><line x1="3" y1="12" x2="10" y2="12" /><line x1="3" y1="18" x2="10" y2="18" />
                                    <line x1="14" y1="6" x2="21" y2="6" /><line x1="14" y1="12" x2="21" y2="12" /><line x1="14" y1="18" x2="21" y2="18" />
                                </svg>
                            )
                        }
                    ].map((m) => {
                        const isCurrent = viewMode === m.id;
                        return (
                            <button
                                key={m.id}
                                onClick={() => !isDragging && onViewModeChange(m.id as any)}
                                className={`px-4 h-full rounded-lg transition-all cursor-pointer flex items-center justify-center
                                    ${isCurrent ? "bg-white/10 shadow-lg shadow-white/5" : "hover:bg-white/5"}
                                    ${isDragging ? 'opacity-20 pointer-events-none' : ''}`}
                                title={t("search.mode", { mode: m.id })}
                            >
                                {m.icon(isCurrent)}
                            </button>
                        );
                    })}
                </div>

                {/* SORTING CONTROLS */}
                <div className={`flex items-center overflow-hidden transition-all duration-300 ease-in-out ${viewMode !== "tree" ? 'w-[145px] opacity-100 ml-4' : 'w-0 opacity-0 pointer-events-none'}`}>
                    <div className="flex bg-white/[0.03] border border-white/5 rounded-xl p-1 gap-1 h-[42px] flex-shrink-0 w-[145px]">
                        <button
                            onClick={() => !isDragging && setSortBy("name")}
                            className={`flex-1 h-full rounded-lg text-[10px] font-black tracking-widest uppercase transition-all flex items-center justify-center cursor-pointer
                                ${sortBy === "name"
                                    ? "bg-white/10 text-white shadow-lg shadow-white/5"
                                    : "text-tertiary hover:text-white hover:bg-white/5"}
                                ${isDragging ? 'opacity-20 pointer-events-none' : ''}`}
                        >
                            Name
                        </button>
                        <button
                            onClick={() => !isDragging && setSortBy("path")}
                            className={`flex-1 h-full rounded-lg text-[10px] font-black tracking-widest uppercase transition-all flex items-center justify-center cursor-pointer
                                ${sortBy === "path"
                                    ? "bg-white/10 text-white shadow-lg shadow-white/5"
                                    : "text-tertiary hover:text-white hover:bg-white/5"}
                                ${isDragging ? 'opacity-20 pointer-events-none' : ''}`}
                        >
                            Path
                        </button>
                    </div>
                </div>

                <div className={`flex items-center overflow-hidden transition-all duration-[150ms] ease-in-out ${viewMode === "tree" ? 'w-[52px] opacity-100' : 'w-0 opacity-0 pointer-events-none'}`}>
                    <div className="h-4 w-[1px] bg-white/5 mx-2 flex-shrink-0"></div>
                    <button
                        onClick={toggleAll}
                        className={`p-2 transition-all h-10 w-10 flex flex-shrink-0 flex-col items-center justify-center border-none shadow-none bg-transparent focus:outline-none relative cursor-pointer ${!isDragging ? 'group/toggle' : 'opacity-10 cursor-default'} text-white/20 hover:text-indigo-400`}
                        title={t(isAllExpanded ? "context.collapse_all" : "context.expand_all")}
                    >
                        <div className="flex flex-col items-center space-y-[3px]">
                            <svg width="14" height="6" viewBox="0 0 24 10" fill="none" className={`transition-all duration-300 ease-in-out stroke-current ${isAllExpanded ? 'rotate-180' : ''}`} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 8l7-7 7 7" /></svg>
                            <svg width="14" height="6" viewBox="0 0 24 10" fill="none" className={`transition-all duration-300 ease-in-out stroke-current ${isAllExpanded ? 'rotate-180' : ''}`} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 2l7 7 7-7" /></svg>
                        </div>
                    </button>
                </div>

                <div className={`flex-1 ml-4 mr-4 relative group flex items-center bg-white/[0.03] border border-white/5 rounded-xl h-[41px] mb-[1px] transition-all focus-within:border-indigo-500/50 focus-within:bg-white/[0.05]`}>
                    <div className="pl-3 text-tertiary group-focus-within:text-indigo-400 transition-colors pointer-events-none">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8"></circle>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                    </div>

                    {prefixMatch && (
                        <div className="ml-2 bg-white/10 text-white/50 px-2 py-0.5 rounded-lg text-[12px] font-bold uppercase tracking-widest border border-white/10 pointer-events-none flex-shrink-0">
                            {prefixMatch.replace(':', '')}
                        </div>
                    )}

                    <input
                        ref={searchInputRef}
                        type="text"
                        value={displayValue}
                        onFocus={onSearchFocus}
                        onBlur={onSearchBlur}
                        onChange={(e) => {
                            const val = e.target.value;
                            setSearchQuery(prefixMatch ? prefixMatch + val : val);
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Backspace' && prefixMatch && displayValue === "") {
                                setSearchQuery("");
                            } else if (e.key === 'Tab') {
                                const q = searchQuery.toLowerCase();
                                if (q === 'p') {
                                    e.preventDefault();
                                    setSearchQuery('path:');
                                } else if (q === 'f') {
                                    e.preventDefault();
                                    setSearchQuery('file:');
                                }
                            }
                        }}
                        placeholder={prefixMatch ? "" : t("search.placeholder")}
                        className={`flex-1 bg-transparent border-none outline-none h-full pr-10 text-[14px] font-normal text-white placeholder:text-tertiary/50 ${prefixMatch ? 'ml-[10px]' : 'ml-2'}`}
                    />

                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery("")}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 hover:bg-white/10 rounded-lg text-tertiary hover:text-white transition-all flex items-center justify-center cursor-pointer z-10"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    )}
                </div>
            </div>

            {filterTag !== "hub" && (
                <div className="flex items-center space-x-3">
                    <button
                        onClick={() => {
                            if (isDragging) return;
                            if (showHidden === 'none') setShowHidden('all');
                            else if (showHidden === 'all') setShowHidden('only');
                            else setShowHidden('none');
                        }}
                        className={`h-[42px] w-[42px] flex items-center justify-center rounded-xl transition-all cursor-pointer border
                            ${showHidden === 'none' ? "bg-white/[0.03] border-white/5 text-tertiary hover:text-secondary hover:bg-white/[0.05]" :
                                showHidden === 'all' ? "bg-white/10 border-white/20 text-white shadow-lg" :
                                    "bg-white/10 border-white/20 text-indigo-400 shadow-lg"}
                            ${isDragging ? 'opacity-20 pointer-events-none' : ''}`}
                        title={showHidden === 'none' ? t("context.show_hidden") : showHidden === 'all' ? t("context.hide_hidden") : t("context.show_only_hidden", "Show Only Hidden")}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            {showHidden === 'none' ? (
                                <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></>
                            ) : showHidden === 'all' ? (
                                <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>
                            ) : (
                                <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" fill="currentColor" /></>
                            )}
                        </svg>
                    </button>
                </div>
            )}
        </div>
    );
}
