import React, { useState, useEffect, useRef, useMemo, createContext, useContext, memo } from "react";
import { HighlightText } from "./HighlightText";
import { SearchContext } from "../context/SearchContext";
import { ScriptTreeProps, TreeNode } from "../types/script";
import { useScriptTree } from "../hooks/useScriptTree";
import ScriptRow from "./ScriptRow";
import HubScriptCard from "./HubScriptCard";
import { Script } from "../api";

// ─── PERF LOGGING ──────────────────────────────────────────────
const PERF = false; // set true to enable perf logs

// ───────────────────────────────────────────────────────────────

// ─── TREE CONTEXT (stable handlers — don't bust memo) ──────────
interface TreeContextValue {
    expandedFoldersRef: React.MutableRefObject<Record<string, boolean>>;
    toggleFolder: (path: string) => void;
    setFolderExpansionRecursive: (node: TreeNode, expanded: boolean) => void;
    folderRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
    isDragging: boolean;
    draggedScriptPath: string | null;
    animationsEnabled: boolean;
    onFolderContextMenu: (e: React.MouseEvent, data: any) => void;
    onScriptContextMenu: (e: React.MouseEvent, s: Script) => void;
    editingScript: string | null;
    pendingScripts: Set<string>;
    removingTags: Set<string>;
    allUniqueTags: string[];
    popoverRef: React.MutableRefObject<HTMLDivElement | null>;
    handleCustomMouseDown: (e: React.MouseEvent, script: Script) => void;
    handleToggle: (s: Script, forceStart?: boolean) => void;
    startEditing: (s: Script) => void;
    stopEditing: () => void;
    addTag: (script: Script, tag: string) => void;
    removeTag: (script: Script, tag: string) => void;
}
const TreeContext = createContext<TreeContextValue>(null as any);
// ───────────────────────────────────────────────────────────────

// ─── MEMOIZED TREE NODE ─────────────────────────────────────────
const TreeNodeRenderer = memo(function TreeNodeRenderer({
    node,
    depth,
    isExpanded,
}: {
    node: TreeNode;
    depth: number;
    isExpanded: boolean;
}) {
    const nodeRenderCountRef = useRef(0);
    const ctx = useContext(TreeContext);
    const { expandedFoldersRef, toggleFolder, setFolderExpansionRecursive,
        folderRefs, isDragging, draggedScriptPath,
        onFolderContextMenu, onScriptContextMenu,
        editingScript, pendingScripts, removingTags, allUniqueTags,
        popoverRef, handleCustomMouseDown, handleToggle,
        startEditing, stopEditing, addTag, removeTag } = ctx;

    if (PERF && depth < 3 && node.name !== 'Root') {
        nodeRenderCountRef.current += 1;
        console.log(`%c  [NODE] render "${node.name.split('|').pop()}" depth=${depth} isExpanded=${isExpanded} #${nodeRenderCountRef.current}`, 'color: #38bdf8');
    }

    // ── Height animation via CSS grid-rows trick ──────────────────────────
    // childVisible: keeps DOM alive during exit animation
    // gridExpanded: drives grid-template-rows 0fr ↔ 1fr for smooth height
    const [childVisible, setChildVisible] = useState(isExpanded);
    const [gridExpanded, setGridExpanded] = useState(isExpanded);
    const skipFirstEffect = useRef(true);

    useEffect(() => {
        if (skipFirstEffect.current) { skipFirstEffect.current = false; return; }
        const animated = ctx.animationsEnabled;
        if (isExpanded) {
            setChildVisible(true);
            if (animated) {
                setGridExpanded(false); // paint at 0fr first
                requestAnimationFrame(() => requestAnimationFrame(() => setGridExpanded(true)));
            } else {
                setGridExpanded(true);
            }
        } else {
            if (animated) {
                setGridExpanded(false); // collapse height
                const t = setTimeout(() => setChildVisible(false), 230);
                return () => clearTimeout(t);
            } else {
                setGridExpanded(false);
                setChildVisible(false);
            }
        }
    }, [isExpanded]); // eslint-disable-line react-hooks/exhaustive-deps
    // ────────────────────────────────────────────────────────────────────

    return (
        <div className="flex flex-col">
            {node.name !== "Root" && (
                <div
                    ref={el => { if (el) folderRefs.current!.set(node.fullName, el); }}
                    onClick={() => !isDragging && toggleFolder(node.fullName)}
                    onContextMenu={(e) => {
                        e.preventDefault();
                        onFolderContextMenu(e, {
                            ...node,
                            onExpandAll: () => setFolderExpansionRecursive(node, true),
                            onCollapseAll: () => setFolderExpansionRecursive(node, false),
                        } as any);
                    }}
                    className={`flex items-center space-x-2 h-[38px] pl-[4px] rounded-lg z-10 relative transition-all duration-300 mb-0.5 border border-transparent hover:z-[50]
                        ${!draggedScriptPath ? 'bg-transparent hover:bg-white/[0.05] cursor-pointer group' : 'bg-transparent text-tertiary cursor-default pointer-events-none'}
                    `}
                >
                    <div className={`w-4 h-4 flex items-center justify-center transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`}>
                        <svg
                            width="10" height="10" viewBox="0 0 24 24"
                            className={`transition-all ${!isDragging ? 'text-white opacity-20' : 'opacity-10'} ${!isDragging && 'group-hover:opacity-100'}`}
                            stroke="currentColor" fill="currentColor" strokeWidth="4" strokeLinejoin="round"
                        >
                            <path d="M5.5 3.5L5.5 20.5L20.2 12L5.5 3.5Z" />
                        </svg>
                    </div>
                    <div className="flex items-center overflow-hidden">
                        {node.name.split('|').map((part, i) => (
                            <React.Fragment key={part + i}>
                                {i > 0 && <div className="w-[5px] h-[5px] rounded-full bg-white/10 mx-3 flex-shrink-0" />}
                                <span className={`text-base font-medium tracking-tight transition-colors truncate stabilize-text ${!isDragging ? 'text-secondary group-hover:text-primary' : 'text-tertiary'} `}>
                                    <HighlightText text={part} variant="path" />
                                </span>
                            </React.Fragment>
                        ))}
                    </div>
                </div>
            )}

            {/* Grid-rows height animation — content below slides up/down */}
            {childVisible && (
                <div
                    style={{
                        display: 'grid',
                        gridTemplateRows: gridExpanded ? '1fr' : '0fr',
                        transition: ctx.animationsEnabled ? 'grid-template-rows 0.22s cubic-bezier(0.33, 1, 0.68, 1)' : 'none',
                    }}
                >
                    {/* overflow:hidden on inner div required for grid-rows trick */}
                    <div style={{ minHeight: 0, overflow: 'hidden' }}>
                        <div className="relative">
                            {node.name !== "Root" && (
                                <div
                                    onClick={() => !isDragging && toggleFolder(node.fullName)}
                                    className={`absolute left-[13px] top-0 bottom-4 w-5 -ml-2.5 z-20 transition-all duration-150 rounded-full ${!draggedScriptPath ? 'cursor-pointer group/line hover:bg-white/[0.05]' : ''}`}
                                >
                                    <div className={`absolute left-[9px] top-0 bottom-0 w-[1px] transition-colors shadow-2xl ${isDragging ? 'bg-white/5' : 'bg-white/10'}`}></div>
                                </div>
                            )}
                            <div className={`${node.name !== "Root" ? 'pl-5 ml-2.5 mb-0.5 mt-0.5' : ''} space-y-1.5 relative`}>
                                {Object.values(node.children).sort((a, b) => a.name.localeCompare(b.name)).map(child => (
                                    <TreeNodeRenderer
                                        key={child.fullName}
                                        node={child}
                                        depth={depth + 1}
                                        isExpanded={expandedFoldersRef.current![child.fullName] !== false}
                                    />
                                ))}
                                {node.scripts.sort((a, b) => a.filename.localeCompare(b.filename)).map(s => {
                                    const removingTagKeys = Array.from(removingTags as Set<string>).filter(k => k.startsWith(s.path + '-'));
                                    return (
                                        <ScriptRow
                                            key={s.path}
                                            s={s}
                                            isDragging={isDragging}
                                            draggedScriptPath={draggedScriptPath}
                                            isEditing={editingScript === s.path}
                                            isPending={pendingScripts.has(s.path)}
                                            removingTagKeys={removingTagKeys}
                                            allUniqueTags={allUniqueTags}
                                            popoverRef={popoverRef}
                                            onMouseDown={handleCustomMouseDown}
                                            onDoubleClick={(s) => handleToggle(s, true)}
                                            onToggle={handleToggle}
                                            onStartEditing={startEditing}
                                            onAddTag={addTag}
                                            onRemoveTag={removeTag}
                                            onCloseEditing={stopEditing}
                                            onScriptContextMenu={onScriptContextMenu}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}, (prev, next) => {
    // ROOT (depth=0): always re-render to propagate new isExpanded to children
    if (prev.depth === 0) return false;
    // NON-ROOT: compare by VALUE not reference — polling rebuilds tree with new refs
    // but the structure (fullName, script count, children) should be stable
    if (prev.isExpanded !== next.isExpanded) return false;
    if (prev.node.fullName !== next.node.fullName) return false;
    if (prev.node.scripts.length !== next.node.scripts.length) return false;
    const prevChildKeys = Object.keys(prev.node.children);
    const nextChildKeys = Object.keys(next.node.children);
    if (prevChildKeys.length !== nextChildKeys.length) return false;
    // Scripts changed (different run state, tags) → must re-render
    for (let i = 0; i < prev.node.scripts.length; i++) {
        const ps = prev.node.scripts[i];
        const ns = next.node.scripts[i];
        if (ps.path !== ns.path || ps.is_running !== ns.is_running || ps.tags.join(',') !== ns.tags.join(',')) return false;
    }
    return true;
});

// ───────────────────────────────────────────────────────────────

export default function ScriptTree({ filterTag, onTagsLoaded, onLoadingChange, viewMode, onViewModeChange, onCustomDragStart, isDragging, draggedScriptPath, animationsEnabled, onScriptContextMenu, onFolderContextMenu, searchQuery, setSearchQuery }: ScriptTreeProps) {
    const renderCountRef = useRef(0);
    const renderStartRef = useRef(0);
    if (PERF) {
        renderCountRef.current += 1;
        renderStartRef.current = performance.now();
        console.log(`%c[PERF] ScriptTree render #${renderCountRef.current} | filterTag: "${filterTag}"`, 'color: #f59e0b; font-weight: bold');
    }

    const {
        loading, filtered, tree,
        expandedFolders,
        editingScript, pendingScripts, removingTags,
        isAllExpanded, showHidden, allUniqueTags,
        popoverRef, folderRefs,
        setShowHidden,
        toggleFolder, toggleAll, setFolderExpansionRecursive,
        handleToggle, startEditing, stopEditing,
        addTag, removeTag, handleCustomMouseDown,
    } = useScriptTree({ filterTag, onTagsLoaded, onCustomDragStart, searchQuery, setSearchQuery });

    useEffect(() => {
        if (onLoadingChange) {
            onLoadingChange(loading);
        }
    }, [loading, onLoadingChange]);

    const [columnsCount, setColumnsCount] = useState(1);
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollPositions = useRef<Record<string, number>>({});
    const prevKeyRef = useRef<string>("");

    useEffect(() => {
        if (!containerRef.current) return;

        const GAP = 24; // gap-6

        const updateColumns = (width: number) => {
            const minWidth = viewMode === "tiles" ? 340 : 450;
            const count = Math.max(1, Math.floor((width + GAP) / (minWidth + GAP)));
            setColumnsCount(count);
        };

        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                if (entry.contentRect) {
                    updateColumns(entry.contentRect.width);
                }
            }
        });

        resizeObserver.observe(containerRef.current);

        // Initial call
        updateColumns(containerRef.current.offsetWidth);

        return () => {
            resizeObserver.disconnect();
        };
    }, [viewMode]);

    // Scroll Restoration Logic
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const currentKey = `${filterTag}-${viewMode}`;

        // 1. Save previous position before switching
        if (prevKeyRef.current && prevKeyRef.current !== currentKey) {
            // We don't save here because the state has already changed and content might have shrunk
            // Saving is better handled in a scroll listener or before the state change in App.tsx
            // However, we can use a "beforeunload" style logic here by capturing current before changing key
        }

        // 2. Restore position for the new key
        const savedPos = scrollPositions.current[currentKey] || 0;
        container.scrollTop = savedPos;

        prevKeyRef.current = currentKey;
    }, [filterTag, viewMode]);

    // Handle search scroll reset
    useEffect(() => {
        if (searchQuery && containerRef.current) {
            containerRef.current.scrollTop = 0;
        }
    }, [searchQuery]);

    // Save scroll position on every scroll to be precise
    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const container = e.currentTarget;
        const currentKey = `${filterTag}-${viewMode}`;
        scrollPositions.current[currentKey] = container.scrollTop;
    };

    // ─── expandedFoldersRef: stable reference for TreeNodeRenderer memo ───
    const expandedFoldersRef = useRef<Record<string, boolean>>(expandedFolders);
    expandedFoldersRef.current = expandedFolders;

    // ─── STABLE context ref (never changes reference → never busts TreeNodeRenderer memo) ───
    // We mutate the object IN PLACE so the Provider value is always the same object ref.
    const stableCtxRef = useRef<TreeContextValue>({} as TreeContextValue);
    Object.assign(stableCtxRef.current, {
        expandedFoldersRef,
        toggleFolder, setFolderExpansionRecursive, folderRefs,
        isDragging, draggedScriptPath, animationsEnabled,
        onFolderContextMenu, onScriptContextMenu,
        editingScript, pendingScripts, removingTags, allUniqueTags,
        popoverRef, handleCustomMouseDown, handleToggle,
        startEditing, stopEditing, addTag, removeTag,
    });

    // ─── Context stability detector ───────────────────────────────────────
    if (PERF) {
        const deps = {
            toggleFolder, setFolderExpansionRecursive,
            isDragging, draggedScriptPath, animationsEnabled,
            editingScript, pendingScripts, removingTags, allUniqueTags,
            handleCustomMouseDown, handleToggle, startEditing, stopEditing, addTag, removeTag,
            onFolderContextMenu, onScriptContextMenu,
        };
        // eslint-disable-next-line react-hooks/rules-of-hooks
        const prevDepsRef = useRef<typeof deps | null>(null);
        if (prevDepsRef.current) {
            const changed = (Object.keys(deps) as Array<keyof typeof deps>).filter(
                k => !Object.is(deps[k], prevDepsRef.current![k])
            );
            if (changed.length > 0) {
                console.warn(`%c[CTX] deps changed (context stable): ${changed.join(', ')}`, 'color: #f97316; font-weight: bold');
            }
        }
        prevDepsRef.current = deps;
    }

    // Log when render completes
    const renderCountAtEffectRef = useRef(0);
    useEffect(() => {
        if (!PERF) return;
        renderCountAtEffectRef.current += 1;
        const renderMs = (performance.now() - renderStartRef.current).toFixed(1);
        console.log(`%c[PERF] ScriptTree paint done #${renderCountAtEffectRef.current} | ${renderMs}ms | scripts: ${filtered.length} | folders: ${Object.keys(expandedFolders).length}`, 'color: #fb7185; font-weight: bold');
    });

    const masonryColumns = useMemo(() => {
        const cols: any[][] = Array.from({ length: columnsCount }, () => []);
        filtered.forEach((s, i) => {
            cols[i % columnsCount].push(s);
        });
        return cols;
    }, [filtered, columnsCount]);


    if (loading) return <div className="p-10 text-center text-tertiary font-bold text-xs tracking-[0.5em] animate-pulse uppercase">Syncing Uplink...</div>;

    const hasContent = Object.keys(tree.children).length > 0 || tree.scripts.length > 0;

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className={`flex items-center justify-between pt-6 pb-2 border-b transition-all duration-300 ${draggedScriptPath ? 'opacity-20 blur-[1px] pointer-events-none' : ''}`} style={{ borderColor: 'var(--border-color)' }}>
                <div className="flex-1 flex items-center space-x-1">
                    {/* VIEW MODE SWITCHER (First on the left) */}
                    <div className="flex bg-white/[0.03] p-1 rounded-xl border border-white/5 h-[42px] items-center">
                        {[
                            { id: "tree", icon: "M3 9h18M3 15h18 M3 6h18M3 18h18 M7 6v12M17 6v12" },
                            { id: "tiles", icon: "M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z" },
                            { id: "list", icon: "M3 6h7M3 12h7M3 18h7M14 6h7M14 12h7M14 18h7" }
                        ].map((m) => (
                            <button
                                key={m.id}
                                onClick={() => !isDragging && onViewModeChange(m.id as any)}
                                className={`px-4 h-full rounded-lg transition-all cursor-pointer flex items-center justify-center ${viewMode === m.id
                                    ? "bg-white/10 text-white shadow-lg shadow-white/5"
                                    : "text-tertiary hover:text-secondary hover:bg-white/5"
                                    } ${isDragging ? 'opacity-20 pointer-events-none' : ''}`}
                                title={`Режим: ${m.id}`}
                            >
                                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d={m.icon} />
                                </svg>

                            </button>
                        ))}
                    </div>

                    {/* TREE CONTROLS ANIMATED GROUP */}
                    <div
                        className={`flex items-center overflow-hidden transition-all duration-[150ms] ease-in-out ${viewMode === "tree" ? 'w-[52px] opacity-100' : 'w-0 opacity-0 pointer-events-none'}`}
                    >
                        <div className="h-4 w-[1px] bg-white/5 mx-2 flex-shrink-0"></div>
                        <button
                            onClick={toggleAll}
                            className={`p-2 transition-all h-10 w-10 flex flex-shrink-0 flex-col items-center justify-center border-none shadow-none bg-transparent focus:outline-none relative cursor-pointer ${!isDragging ? 'group/toggle' : 'opacity-10 cursor-default'} text-white/20 hover:text-indigo-400`}
                            title={isAllExpanded ? "Свернуть все" : "Развернуть все"}
                        >
                            <div className="flex flex-col items-center space-y-[3px]">
                                <svg width="14" height="6" viewBox="0 0 24 10" fill="none"
                                    className={`transition-all duration-300 ease-in-out stroke-current ${isAllExpanded ? 'rotate-180' : ''}`}
                                    strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M5 8l7-7 7 7" />
                                </svg>
                                <svg width="14" height="6" viewBox="0 0 24 10" fill="none"
                                    className={`transition-all duration-300 ease-in-out stroke-current ${isAllExpanded ? 'rotate-180' : ''}`}
                                    strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M5 2l7 7 7-7" />
                                </svg>
                            </div>
                        </button>
                    </div>

                    {/* SEARCH INPUT */}
                    <div className="flex-1 ml-4 mr-4 relative group">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-tertiary group-focus-within:text-indigo-400 transition-colors pointer-events-none">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="11" cy="11" r="8"></circle>
                                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                            </svg>
                        </div>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Поиск скриптов..."
                            className="w-full bg-white/[0.03] border border-white/5 rounded-xl h-[42px] pl-10 pr-10 text-xs font-medium transition-all focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.05] placeholder:text-tertiary/50"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery("")}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 hover:bg-white/10 rounded-lg text-tertiary hover:text-white transition-all flex items-center justify-center cursor-pointer"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex items-center space-x-3">
                    {/* Hidden Toggle (Eye) */}
                    <button
                        onClick={() => !isDragging && setShowHidden(!showHidden)}
                        className={`h-[42px] w-[42px] flex items-center justify-center rounded-xl transition-all cursor-pointer border ${showHidden
                            ? "bg-white/10 border-white/20 text-white shadow-lg"
                            : "bg-white/[0.03] border-white/5 text-tertiary hover:text-secondary hover:bg-white/[0.05]"
                            } ${isDragging ? 'opacity-20 pointer-events-none' : ''}`}
                        title={showHidden ? "Скрыть 'Скрытые'" : "Показать 'Скрытые'"}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            {showHidden ? (
                                <>
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                    <circle cx="12" cy="12" r="3" />
                                </>
                            ) : (
                                <>
                                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                                    <line x1="1" y1="1" x2="23" y2="23" />
                                </>
                            )}
                        </svg>
                    </button>
                </div>
            </div>

            <SearchContext.Provider value={{
                query: searchQuery.toLowerCase().includes("file:") ? searchQuery.replace(/file:/gi, "").trim() :
                    searchQuery.toLowerCase().includes("path:") ? searchQuery.replace(/path:/gi, "").trim() : searchQuery,
                prefix: searchQuery.toLowerCase().startsWith("file:") ? "file" :
                    searchQuery.toLowerCase().startsWith("path:") ? "path" : null
            }}>
                <div
                    ref={containerRef}
                    onScroll={handleScroll}
                    className={`flex-1 overflow-y-auto custom-scrollbar mt-2 transition-all duration-300 ${draggedScriptPath ? 'opacity-30 blur-[1px]' : ''}`}
                >
                    {viewMode === "tiles" ? (
                        <div className="flex flex-row gap-6 pb-10 pr-6 items-start">
                            {filtered.length === 0 ? (
                                <div className="text-tertiary w-full text-center py-40 italic tracking-[0.3em] text-sm font-bold">Пустой канал...</div>
                            ) : (
                                masonryColumns.map((col, colIdx) => (
                                    <div key={colIdx} className="flex flex-col gap-6 flex-1 min-w-0">
                                        {col.map(s => (
                                            <HubScriptCard
                                                key={s.path}
                                                s={s}
                                                isDragging={isDragging}
                                                draggedScriptPath={draggedScriptPath}
                                                editingScript={editingScript}
                                                pendingScripts={pendingScripts}
                                                removingTags={removingTags}
                                                allUniqueTags={allUniqueTags}
                                                popoverRef={popoverRef}
                                                onMouseDown={handleCustomMouseDown}
                                                onToggle={handleToggle}
                                                onStartEditing={startEditing}
                                                onAddTag={addTag}
                                                onRemoveTag={removeTag}
                                                onCloseEditing={stopEditing}
                                                onScriptContextMenu={onScriptContextMenu}
                                            />
                                        ))}
                                    </div>
                                ))
                            )}
                        </div>
                    ) : viewMode === "list" ? (
                        <div className="flex flex-row gap-x-8 gap-y-1 pb-10 pr-6 items-start">
                            {filtered.length === 0 ? (
                                <div className="text-tertiary w-full text-center py-40 italic tracking-[0.3em] text-sm font-bold">Пустой раздел...</div>
                            ) : (
                                masonryColumns.map((col, colIdx) => (
                                    <div key={colIdx} className="flex flex-col gap-y-1 flex-1 min-w-0">
                                        {col.map(s => {
                                            const removingTagKeys = Array.from(removingTags as Set<string>).filter(k => k.startsWith(s.path + '-'));
                                            return (
                                                <ScriptRow
                                                    key={s.path}
                                                    s={s}
                                                    isDragging={isDragging}
                                                    draggedScriptPath={draggedScriptPath}
                                                    isEditing={editingScript === s.path}
                                                    isPending={pendingScripts.has(s.path)}
                                                    removingTagKeys={removingTagKeys}
                                                    allUniqueTags={allUniqueTags}
                                                    popoverRef={popoverRef}
                                                    onMouseDown={handleCustomMouseDown}
                                                    onDoubleClick={(s) => handleToggle(s, true)}
                                                    onToggle={handleToggle}
                                                    onStartEditing={startEditing}
                                                    onAddTag={addTag}
                                                    onRemoveTag={removeTag}
                                                    onCloseEditing={stopEditing}
                                                    onScriptContextMenu={onScriptContextMenu}
                                                />
                                            );
                                        })}
                                    </div>
                                ))
                            )}
                        </div>
                    ) : (
                        <div className="flex flex-col space-y-0.5 select-none pr-6">
                            <TreeContext.Provider value={stableCtxRef.current}>
                                {!hasContent ? (
                                    <div className="text-tertiary text-center py-40 italic tracking-[0.3em] text-sm font-bold">Пустой раздел дерева...</div>
                                ) : (
                                    <TreeNodeRenderer
                                        node={tree}
                                        depth={0}
                                        isExpanded={true}
                                    />
                                )}
                            </TreeContext.Provider>
                        </div>
                    )}
                </div>
            </SearchContext.Provider>
        </div >
    );
}
