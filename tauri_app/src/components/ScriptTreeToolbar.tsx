import React, { useMemo, useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import ToggleGroup from "./ui/ToggleGroup";
import { SearchIcon, CloseIcon, ChevronDownIcon } from "./ui/Icons";
import { SquaresFour, EyeSlash, Eye } from "@phosphor-icons/react";
import SectionLabel from "./ui/SectionLabel";
import Tooltip from "./ui/Tooltip";

interface ScriptTreeToolbarProps {
    viewMode: "tree" | "tiles" | "list";
    onViewModeChange: (mode: "tree" | "tiles" | "list") => void;
    isDragging: boolean;
    draggedScriptPath: string | null;
    sortBy: "name" | "size";
    setSortBy: (s: "name" | "size") => void;
    isAllExpanded: boolean;
    toggleAll: () => void;
    isAllHubExpanded?: boolean;
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
    isAllHubExpanded, toggleAllHub,
    searchQuery, setSearchQuery, showHidden, setShowHidden,
    filterTag, searchInputRef, onSearchFocus, onSearchBlur,
}: ScriptTreeToolbarProps) {
    const { t } = useTranslation();

    const viewOptions = useMemo(() => [
        {
            id: "tree" as const,
            icon: (isActive: boolean) => (
                <svg width="20" height="20" viewBox="0 0 256 256" className={`transition-opacity duration-200 ${isActive ? 'opacity-100' : 'opacity-25'}`}>
                    {isActive ? (
                        <path fill="currentColor" d="M160 136v-8H88v64a8 8 0 0 0 8 8h64v-8a16 16 0 0 1 16-16h32a16 16 0 0 1 16 16v32a16 16 0 0 1-16 16h-32a16 16 0 0 1-16-16v-8H96a24 24 0 0 1-24-24V80h-8a16 16 0 0 1-16-16V32a16 16 0 0 1 16-16h32a16 16 0 0 1 16 16v32a16 16 0 0 1-16 16h-8v32h72v-8a16 16 0 0 1 16-16h32a16 16 0 0 1 16 16v32a16 16 0 0 1-16 16h-32a16 16 0 0 1-16-16" />
                    ) : (
                        <path fill="currentColor" d="M176 156h32a20 20 0 0 0 20-20v-32a20 20 0 0 0-20-20h-32a20 20 0 0 0-20 20v4H92V84h4a20 20 0 0 0 20-20V32a20 20 0 0 0-20-20H64a20 20 0 0 0-20 20v32a20 20 0 0 0 20 20h4v108a28 28 0 0 0 28 28h60v4a20 20 0 0 0 20 20h32a20 20 0 0 0 20-20v-32a20 20 0 0 0-20-20h-32a20 20 0 0 0-20 20v4H96a4 4 0 0 1-4-4v-60h64v4a20 20 0 0 0 20 20M68 36h24v24H68Zm112 160h24v24h-24Zm0-88h24v24h-24Z" />
                    )}
                </svg>
            ),
            title: t("search.mode_tree"),
        },
        {
            id: "tiles" as const,
            icon: (isActive: boolean) => (
                <SquaresFour size={20} weight={isActive ? "fill" : "bold"} className={`transition-opacity duration-200 ${isActive ? 'opacity-100' : 'opacity-25'}`} />
            ),
            title: t("search.mode_tiles"),
        },
        {
            id: "list" as const,
            icon: (isActive: boolean) => (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-opacity duration-200 ${isActive ? 'opacity-100' : 'opacity-25'}`}>
                    <path d="M3 6h7M3 12h7M3 18h7M14 6h7M14 12h7M14 18h7" />
                </svg>
            ),
            title: t("search.mode_list"),
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
                    <div className="relative">
                    <SectionLabel className="ml-3 mb-0.5 absolute bottom-full left-0 whitespace-nowrap">{t("toolbar.sort")}</SectionLabel>
                    <div ref={sortRef} className="relative">
                        <button
                            onClick={() => !isDragging && setSortOpen(!sortOpen)}
                            className={`h-[42px] min-w-[110px] px-4 flex items-center justify-between gap-2 rounded-xl bg-white/[0.03] border border-white/5 transition-all cursor-pointer
                                ${!isDragging ? 'hover:bg-white/[0.06] hover:border-white/10' : 'opacity-20 pointer-events-none'}
                                ${sortOpen ? 'border-indigo-500/50 bg-white/[0.05]' : ''}`}
                        >
                            <span className="text-sm text-secondary font-medium">{currentSortLabel}</span>
                            <ChevronDownIcon size={12} className="text-tertiary" />
                        </button>
                        {sortOpen && (
                            <div className="absolute top-full left-0 mt-1 py-1 min-w-[120px] rounded-xl bg-[var(--bg-primary)] border border-white/10 shadow-xl shadow-black/50 z-50">
                                {sortOptions.map(opt => (
                                    <button
                                        key={opt.id}
                                        onClick={() => { setSortBy(opt.id); setSortOpen(false); }}
                                        className={`w-full flex items-center justify-between px-4 py-2 text-sm transition-colors cursor-pointer
                                            ${sortBy === opt.id ? 'text-indigo-400 bg-indigo-500/10' : 'text-secondary hover:bg-white/5'}`}
                                    >
                                        {opt.label}
                                        {sortBy === opt.id && <span className="text-indigo-400 ml-4">✓</span>}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    </div>
                </div>

                {(() => {
                    const isHub = filterTag === "hub" && viewMode !== "tree";
                    const showButton = viewMode === "tree" || isHub;
                    const expanded = isHub ? isAllHubExpanded : isAllExpanded;
                    const onToggle = isHub ? toggleAllHub : toggleAll;
                    return (
                        <div className={`flex items-end overflow-hidden transition-all duration-[150ms] ease-in-out ${searchActive ? 'w-0 opacity-0 pointer-events-none ml-0' : showButton ? 'w-[42px] opacity-100 ml-2' : 'w-0 opacity-0 pointer-events-none ml-0'}`}>
                            <Tooltip text={t(expanded ? "context.collapse_all" : "context.expand_all")}>
                            <button
                                onClick={onToggle}
                                className={`h-[42px] w-[42px] flex flex-shrink-0 flex-col items-center justify-center rounded-xl bg-white/[0.03] border border-white/5 transition-all cursor-pointer focus:outline-none
                                    ${!isDragging ? 'hover:bg-white/[0.06] hover:border-white/10 group/collapse' : 'opacity-20 pointer-events-none'}`}
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-25 transition-opacity duration-200 group-hover/collapse:opacity-50">
                                    <path style={{ d: `path("M 6 ${expanded ? 3 : 8} L 12 ${expanded ? 9 : 2} L 18 ${expanded ? 3 : 8}")`, transition: 'd 350ms cubic-bezier(0.4, 0, 0.2, 1)' } as React.CSSProperties} />
                                    <path style={{ d: `path("M 6 ${expanded ? 21 : 16} L 12 ${expanded ? 15 : 22} L 18 ${expanded ? 21 : 16}")`, transition: 'd 350ms cubic-bezier(0.4, 0, 0.2, 1)' } as React.CSSProperties} />
                                </svg>
                            </button>
                            </Tooltip>
                        </div>
                    );
                })()}

                {/* Search */}
                <div ref={searchSizerRef} className="flex-1 min-w-0 ml-2">
                    {searchCollapsed && !searchActive ? (
                        <Tooltip text={t("search.placeholder")}>
                            <button
                                onClick={() => {
                                    setSearchFocused(true);
                                    setTimeout(() => searchInputRef.current?.focus(), 50);
                                }}
                                className="h-[42px] w-[42px] flex items-center justify-center rounded-xl bg-white/[0.03] border border-white/5 text-tertiary hover:text-secondary hover:bg-white/[0.06] transition-all cursor-pointer"
                            >
                                <SearchIcon />
                            </button>
                        </Tooltip>
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
                    <Tooltip text={showHidden === 'none' ? t("context.show_hidden") : showHidden === 'all' ? t("context.show_only_hidden") : t("context.hide_hidden")}>
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
                    >
                        {showHidden === 'none' ? (
                            <EyeSlash size={16} weight="bold" />
                        ) : showHidden === 'all' ? (
                            <Eye size={16} weight="bold" />
                        ) : (
                            <Eye size={16} weight="fill" />
                        )}
                    </button>
                    </Tooltip>
                </div>
            )}
        </div>
    );
}
