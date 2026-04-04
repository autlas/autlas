import React, { useMemo, useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import ToggleGroup from "./ui/ToggleGroup";
import { SearchIcon, CloseIcon } from "./ui/Icons";
import SectionLabel from "./ui/SectionLabel";

interface ScriptTreeToolbarProps {
    viewMode: "tree" | "tiles" | "list";
    onViewModeChange: (mode: "tree" | "tiles" | "list") => void;
    isDragging: boolean;
    draggedScriptPath: string | null;
    sortBy: "name" | "size";
    setSortBy: (s: "name" | "size") => void;
    isAllExpanded: boolean;
    toggleAll: () => void;
    isAllHubCollapsed?: boolean;
    toggleAllHub?: () => void;
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
    isAllHubCollapsed, toggleAllHub,
    searchQuery, setSearchQuery, showHidden, setShowHidden,
    filterTag, searchInputRef, onSearchFocus, onSearchBlur,
}: ScriptTreeToolbarProps) {
    const { t } = useTranslation();

    const viewOptions = useMemo(() => [
        {
            id: "tree" as const,
            icon: (isActive: boolean) => (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-opacity duration-200 ${isActive ? 'opacity-100' : 'opacity-25'}`}>
                    <circle cx="6" cy="6" r="2" />
                    <path d="M6 8v12h8M6 13h8" />
                    <circle cx="16" cy="13" r="2" />
                    <circle cx="16" cy="20" r="2" />
                </svg>
            ),
            title: t("search.mode", { mode: "tree" }),
        },
        {
            id: "tiles" as const,
            icon: (isActive: boolean) => (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-opacity duration-200 ${isActive ? 'opacity-100' : 'opacity-25'}`}>
                    <rect x="3" y="3" width="7" height="7" rx="1" ry="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" ry="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" ry="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" ry="1" />
                </svg>
            ),
            title: t("search.mode", { mode: "tiles" }),
        },
        {
            id: "list" as const,
            icon: (isActive: boolean) => (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-opacity duration-200 ${isActive ? 'opacity-100' : 'opacity-25'}`}>
                    <line x1="3" y1="6" x2="10" y2="6" /><line x1="3" y1="12" x2="10" y2="12" /><line x1="3" y1="18" x2="10" y2="18" />
                    <line x1="14" y1="6" x2="21" y2="6" /><line x1="14" y1="12" x2="21" y2="12" /><line x1="14" y1="18" x2="21" y2="18" />
                </svg>
            ),
            title: t("search.mode", { mode: "list" }),
        },
    ], [t]);

    const [sortOpen, setSortOpen] = useState(false);
    const sortRef = useRef<HTMLDivElement>(null);
    const sortOptions: { id: "name" | "size"; label: string }[] = [
        { id: "name", label: t("toolbar.name") },
        { id: "size", label: t("toolbar.size") },
    ];
    const currentSortLabel = sortOptions.find(o => o.id === sortBy)?.label ?? sortBy;

    useEffect(() => {
        if (!sortOpen) return;
        const handleClick = (e: MouseEvent) => {
            if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false);
        };
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [sortOpen]);

    const lowerSearch = searchQuery.toLowerCase();
    const prefixMatch = lowerSearch.startsWith("path:") ? "path:" :
        lowerSearch.startsWith("file:") ? "file:" : null;
    const displayValue = prefixMatch ? searchQuery.substring(prefixMatch.length) : searchQuery;

    const [searchFocused, setSearchFocused] = useState(false);
    const [searchCollapsed, setSearchCollapsed] = useState(false);
    const searchSizerRef = useRef<HTMLDivElement>(null);

    // Watch own width — collapse into button when too narrow
    useEffect(() => {
        if (!searchSizerRef.current) return;
        const observer = new ResizeObserver((entries) => {
            const width = entries[0]?.contentRect.width ?? 999;
            if (!searchFocused) setSearchCollapsed(width < 180);
        });
        observer.observe(searchSizerRef.current);
        return () => observer.disconnect();
    }, [searchFocused]);

    const searchActive = (searchCollapsed && searchFocused) || (searchCollapsed && !!searchQuery);

    return (
        <div className={`flex items-end justify-between pt-3 pb-2 border-b transition-all duration-300 ${draggedScriptPath ? 'opacity-20 blur-[1px] pointer-events-none' : ''}`} style={{ borderColor: 'var(--border-color)' }}>
            <div className="flex-1 min-w-0 flex items-end relative">
                <div className={`flex flex-col flex-shrink-0 overflow-hidden transition-all duration-300 ease-in-out ${searchActive ? 'w-0 opacity-0 pointer-events-none' : 'opacity-100'}`}>
                    <SectionLabel className="ml-3 mb-0.5">{t("toolbar.view")}</SectionLabel>
                    <ToggleGroup
                        options={viewOptions}
                        value={viewMode}
                        onChange={onViewModeChange}
                        disabled={isDragging}
                    />
                </div>

                {/* SORTING CONTROLS */}
                <div className={`flex flex-col overflow-visible transition-all duration-300 ease-in-out ${searchActive ? 'w-0 opacity-0 pointer-events-none ml-0' : 'opacity-100 ml-2'}`}>
                    <SectionLabel className="ml-3 mb-0.5">{t("toolbar.sort")}</SectionLabel>
                    <div ref={sortRef} className="relative">
                        <button
                            onClick={() => !isDragging && setSortOpen(!sortOpen)}
                            className={`h-[42px] px-4 flex items-center gap-2 rounded-xl bg-white/[0.03] border border-white/5 transition-all cursor-pointer
                                ${!isDragging ? 'hover:bg-white/[0.06] hover:border-white/10' : 'opacity-20 pointer-events-none'}
                                ${sortOpen ? 'border-indigo-500/50 bg-white/[0.05]' : ''}`}
                        >
                            <span className="text-sm text-secondary font-medium">{currentSortLabel}</span>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-tertiary">
                                <polyline points="6 9 12 15 18 9" />
                            </svg>
                        </button>
                        {sortOpen && (
                            <div className="absolute top-full left-0 mt-1 py-1 min-w-[120px] rounded-xl bg-[var(--bg-primary)] border border-white/10 shadow-xl shadow-black/50 z-50">
                                {sortOptions.map(opt => (
                                    <button
                                        key={opt.id}
                                        onClick={() => { setSortBy(opt.id); setSortOpen(false); }}
                                        className={`w-full text-left px-4 py-2 text-sm transition-colors cursor-pointer
                                            ${sortBy === opt.id ? 'text-indigo-400 bg-indigo-500/10' : 'text-secondary hover:bg-white/5'}`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {(() => {
                    const isHub = filterTag === "hub" && viewMode !== "tree";
                    const showButton = viewMode === "tree" || isHub;
                    const expanded = isHub ? !isAllHubCollapsed : isAllExpanded;
                    const onToggle = isHub ? toggleAllHub : toggleAll;
                    return (
                        <div className={`flex items-end overflow-hidden transition-all duration-[150ms] ease-in-out ${searchActive ? 'w-0 opacity-0 pointer-events-none ml-0' : showButton ? 'w-[42px] opacity-100 ml-2' : 'w-0 opacity-0 pointer-events-none ml-0'}`}>
                            <button
                                onClick={onToggle}
                                className={`h-[42px] w-[42px] flex flex-shrink-0 flex-col items-center justify-center rounded-xl bg-white/[0.03] border border-white/5 transition-all cursor-pointer focus:outline-none
                                    ${!isDragging ? 'hover:bg-white/[0.06] hover:border-white/10 group/collapse' : 'opacity-20 pointer-events-none'}`}
                                title={t(expanded ? "context.collapse_all" : "context.expand_all")}
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-25 transition-opacity duration-200 group-hover/collapse:opacity-50">
                                    <path style={{ d: `path("M 6 ${expanded ? 3 : 8} L 12 ${expanded ? 9 : 2} L 18 ${expanded ? 3 : 8}")`, transition: 'd 350ms cubic-bezier(0.4, 0, 0.2, 1)' } as React.CSSProperties} />
                                    <path style={{ d: `path("M 6 ${expanded ? 21 : 16} L 12 ${expanded ? 15 : 22} L 18 ${expanded ? 21 : 16}")`, transition: 'd 350ms cubic-bezier(0.4, 0, 0.2, 1)' } as React.CSSProperties} />
                                </svg>
                            </button>
                        </div>
                    );
                })()}

                {/* Search */}
                <div ref={searchSizerRef} className="flex-1 min-w-0 ml-2">
                    {searchCollapsed && !searchActive ? (
                        <button
                            onClick={() => {
                                setSearchFocused(true);
                                setTimeout(() => searchInputRef.current?.focus(), 50);
                            }}
                            className="h-[42px] w-[42px] flex items-center justify-center rounded-xl bg-white/[0.03] border border-white/5 text-tertiary hover:text-secondary hover:bg-white/[0.06] transition-all cursor-pointer"
                            title={t("search.placeholder")}
                        >
                            <SearchIcon />
                        </button>
                    ) : (
                        <div className="relative group flex items-center bg-white/[0.03] border border-white/5 rounded-xl h-[42px] transition-all focus-within:border-indigo-500/50 focus-within:bg-white/[0.05]">
                            <div className="pl-3 text-tertiary group-focus-within:text-indigo-400 transition-colors pointer-events-none">
                                <SearchIcon />
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
                                onFocus={() => { onSearchFocus(); setSearchFocused(true); }}
                                onBlur={() => { onSearchBlur(); setSearchFocused(false); }}
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
                                    <CloseIcon />
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {filterTag !== "hub" && (
                <div className="flex items-center space-x-3 ml-2">
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
                        title={showHidden === 'none' ? t("context.show_hidden") : showHidden === 'all' ? t("context.hide_hidden") : t("context.show_only_hidden")}
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
