import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { SearchContext } from "../../context/SearchContext";
import { ScriptTreeProps } from "../../types/script";
import { useScriptTree } from "../../hooks/useScriptTree";
import { useVimHotkeys } from "../../hooks/useVimHotkeys";
import EmptyState from "../common/EmptyState";
import ScriptTreeToolbar from "./ScriptTreeToolbar";
import ScriptGridView from "./ScriptGridView";
import { TreeContext, TreeNodeRenderer, setTreeCallbacks } from "./TreeNodeRenderer";
import { useTreeStore } from "../../store/useTreeStore";
import { safeSetItem } from "../../utils/safeStorage";

export default function ScriptTree({ filterTag, onTagsLoaded, onLoadingChange, onRunningCountChange, viewMode, onViewModeChange, onCustomDragStart, isDragging, draggedScriptPath, animationsEnabled, onScriptContextMenu, onFolderContextMenu, searchQuery, setSearchQuery, contextMenu, onShowUI, refreshKey, onScanComplete, isPathsEmpty, onAddPath, onRemovePath, scanPaths, onRefresh, isRefreshing, onOpenSettings, onSelectScript, onExposeActions, isDetailOpen, onCloseDetail, onDetailPinToggle, isActive = true }: ScriptTreeProps) {
    const searchInputRef = useRef<HTMLInputElement>(null);
    const [gridEverMounted, setGridEverMounted] = useState(viewMode !== "tree");
    const lastGridMode = useRef<"tiles" | "list">(viewMode !== "tree" ? viewMode as "tiles" | "list" : "tiles");
    const isInstantScrollRef = useRef(false);
    const treeViewRef = useRef<HTMLDivElement>(null);
    const gridViewRef = useRef<HTMLDivElement>(null);
    const viewModeRef = useRef(viewMode);
    viewModeRef.current = viewMode;
    const sortBy = useTreeStore(store => store.sortBy);
    const setSortBy = useTreeStore(store => store.setSortBy);

    // Hub collapsed sections
    const [hubCollapsed, setHubCollapsed] = useState<Set<string>>(() => {
        try { return new Set(JSON.parse(localStorage.getItem("ahk_hub_collapsed") || "[]")); } catch { return new Set(); }
    });
    const toggleHubSection = useCallback((tag: string) => {
        setHubCollapsed(prev => {
            const next = new Set(prev);
            next.has(tag) ? next.delete(tag) : next.add(tag);
            safeSetItem("ahk_hub_collapsed", JSON.stringify([...next]));
            return next;
        });
    }, []);

    const {
        loading, isFetching, allScripts, filtered, tree, groupedHub, searchMatches,
        isAllExpanded, allUniqueTags,
        popoverRef, folderRefs,
        toggleFolder, toggleAll, setFolderExpansionRecursive,
        handleToggle, handleRestart, startEditing, stopEditing,
        addTag, removeTag, handleCustomMouseDown,
        visibleItems, moveFocus,
        setTagIcon, removeTagIcon,
        deleteTagFromAll, renameTag, toggleHiddenByPath
    } = useScriptTree({ filterTag, onTagsLoaded, onCustomDragStart, searchQuery, setSearchQuery, onRunningCountChange, refreshKey, onScanComplete, viewMode, sortBy });

    const hubTags = useMemo(() => groupedHub?.map(g => g.tag) ?? [], [groupedHub]);
    const isAllHubExpanded = useMemo(() => hubTags.length === 0 || hubTags.every(t => !hubCollapsed.has(t)), [hubTags, hubCollapsed]);
    const toggleAllHub = useCallback(() => {
        setHubCollapsed(() => {
            const next = new Set(isAllHubExpanded ? hubTags : [] as string[]);
            safeSetItem("ahk_hub_collapsed", JSON.stringify([...next]));
            return next;
        });
    }, [isAllHubExpanded, hubTags]);

    const pendingScripts = useTreeStore(s => s.pendingScripts);
    const showHidden = useTreeStore(s => s.showHidden);
    const setShowHidden = useTreeStore(s => s.setShowHidden);
    const setFocusedPath = useTreeStore(s => s.setFocusedPath);
    const setIsVimMode = useTreeStore(s => s.setIsVimMode);
    const editingScript = useTreeStore(s => s.editingScript);
    const removingTags = useTreeStore(s => s.removingTags);

    useEffect(() => {
        onExposeActions?.({ toggle: handleToggle, restart: handleRestart, pendingScripts, allScripts, setTagIcon, removeTagIcon, deleteTagFromAll, renameTag, toggleHiddenByPath });
    }, [handleToggle, handleRestart, pendingScripts, allScripts, setTagIcon, removeTagIcon, deleteTagFromAll, renameTag, toggleHiddenByPath, onExposeActions]);

    const toolbarRef = useRef<HTMLDivElement>(null);
    const toolbarH = 110;
    const isSearchActiveRef = useRef(false);
    const setIsSearchActive = (v: boolean) => {
        isSearchActiveRef.current = v;
    };

    const [columnsCount, setColumnsCount] = useState(1);
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollPositions = useRef<Record<string, number>>({});

    // Instant scroll-to-path used by gg / G. Kept here (not in useVimHotkeys)
    // because it needs folderRefs from useScriptTree.
    const scrollPathIntoView = useCallback((path: string) => {
        requestAnimationFrame(() => {
            const el = folderRefs.current.get(path) || document.getElementById(`script-${path}`);
            if (el) el.scrollIntoView({ behavior: 'auto', block: 'nearest' });
        });
    }, [folderRefs]);

    useVimHotkeys({
        isActive,
        viewMode,
        onViewModeChange,
        columnsCount,
        visibleItems,
        moveFocus,
        scrollPathIntoView,
        handleToggle,
        handleRestart,
        toggleFolder,
        startEditing,
        stopEditing,
        onShowUI,
        onSelectScript,
        isDetailOpen,
        onCloseDetail,
        onDetailPinToggle,
        editingScript,
        searchInputRef,
        isSearchActiveRef,
        isInstantScrollRef,
    });

    // Reset focus to the first script when the sort order changes.
    useEffect(() => {
        if (visibleItems.length > 0) {
            isInstantScrollRef.current = true;
            const target = visibleItems.find(i => i.type === 'script') || visibleItems[0];
            setFocusedPath(target.path);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sortBy]);

    const lastScrollTimeRef = useRef(0);

    useEffect(() => {
        if (!isActive) return;
        return useTreeStore.subscribe((state, prev) => {
            if (state.focusedPath === prev.focusedPath) return;
            if (!state.focusedPath || !state.isVimMode) return;
            const container = containerRef.current;
            if (!container) return;
            const activeView = viewModeRef.current === "tree" ? treeViewRef.current : gridViewRef.current;
            // CSS.escape handles backslashes in Windows paths — without it
            // \U / \D etc. are interpreted as CSS escape sequences and the
            // query silently returns null.
            const selector = `#script-${CSS.escape(state.focusedPath)}`;
            const fromFolderRefs = folderRefs.current.get(state.focusedPath);
            // Scope to the current active view first (avoids hidden siblings
            // inside the same ScriptTree), then to this instance's scroll
            // container (avoids OTHER ScriptTree instances — one per tag tab
            // — that keep their DOM mounted with duplicate script ids).
            const fromQuery = activeView?.querySelector<HTMLElement>(selector)
                || container.querySelector<HTMLElement>(selector);
            const el = fromFolderRefs || fromQuery;

            if (!el) return;
            const eRect = el.getBoundingClientRect();
            if (eRect.width === 0 && eRect.height === 0) return;

            lastScrollTimeRef.current = performance.now();
            isInstantScrollRef.current = false;

            // Manual scroll with scrolloff-like padding. compute-scroll-into-view
            // ignores CSS scroll-margin so we compute the target directly and
            // scroll this instance's scroll container.
            const cRect = container.getBoundingClientRect();
            const SCROLLOFF = 120;
            const topBound = cRect.top + toolbarH + SCROLLOFF;
            const bottomBound = cRect.bottom - SCROLLOFF;
            let delta = 0;
            if (eRect.top < topBound) {
                delta = eRect.top - topBound;
            } else if (eRect.bottom > bottomBound) {
                delta = eRect.bottom - bottomBound;
            }
            if (delta !== 0) container.scrollBy({ top: delta, behavior: 'auto' });
        });
    }, [isActive]);

    useEffect(() => {
        if (viewMode !== "tree") {
            setGridEverMounted(true);
            lastGridMode.current = viewMode as "tiles" | "list";
        }
    }, [viewMode]);

    useEffect(() => {
        if (onLoadingChange) onLoadingChange(isFetching);
    }, [isFetching, onLoadingChange]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const updateColumns = (width: number) => {
            if (width <= 0) return;
            const GAP = 24;
            const minW = viewMode === "tiles" ? 340 : 450;
            const count = Math.max(1, Math.floor((width + GAP) / (minW + GAP)));
            setColumnsCount(count);
        };
        const resizeObserver = new ResizeObserver(() => {
            updateColumns(container.getBoundingClientRect().width);
        });
        resizeObserver.observe(container);
        const handleResize = () => updateColumns(container.getBoundingClientRect().width);
        window.addEventListener('resize', handleResize);
        handleResize();
        return () => {
            resizeObserver.disconnect();
            window.removeEventListener('resize', handleResize);
        };
    }, [viewMode, filterTag, loading]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const currentKey = `${filterTag}-${viewMode}`;
        container.scrollTop = scrollPositions.current[currentKey] || 0;
    }, [filterTag, viewMode, loading]);

    useEffect(() => {
        if (searchQuery && containerRef.current) containerRef.current.scrollTop = 0;
    }, [searchQuery]);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        scrollPositions.current[`${filterTag}-${viewMode}`] = e.currentTarget.scrollTop;
    };

    const isTreeView = viewMode === "tree";
    const treeContextValue = useMemo(() => ({
        toggleFolder, setFolderExpansionRecursive, folderRefs,
        animationsEnabled, allUniqueTags,
        onFolderContextMenu, onScriptContextMenu,
        popoverRef, handleCustomMouseDown, handleToggle,
        startEditing, stopEditing, addTag, removeTag,
        onShowUI,
        onRestart: handleRestart,
        onSelectScript,
        isTreeView: isTreeView && isActive
    }), [
        toggleFolder, setFolderExpansionRecursive,
        animationsEnabled, onFolderContextMenu, onScriptContextMenu,
        allUniqueTags,
        handleCustomMouseDown, handleToggle,
        startEditing, stopEditing, addTag, removeTag,
        onShowUI, handleRestart, onSelectScript, isTreeView, isActive
    ]);

    // Set module-level callbacks for TreeNodeRenderer (bypasses useContext → prevents memo bypass)
    setTreeCallbacks(treeContextValue);

    const masonryColumns = useMemo(() => {
        const cols: import("../../api").Script[][] = Array.from({ length: columnsCount }, () => []);
        filtered.forEach((s, i) => cols[i % columnsCount].push(s));
        return cols;
    }, [filtered, columnsCount]);

    const hasAnyContent = useMemo(() => {
        return allScripts.some(s => {
            if (filterTag === "hub") return s.is_running || s.is_hub;
            if (filterTag === "running") return s.is_running;
            if (filterTag === "hidden") return s.is_hidden;
            if (filterTag === "no_tags") return s.tags.length === 0;
            if (filterTag === "tags") return s.tags.length > 0;
            if (filterTag !== "all" && filterTag !== "all_scripts" && filterTag !== "") return s.tags.includes(filterTag);
            return true;
        });
    }, [allScripts, filterTag]);

    if (loading) return <div className="p-10 text-center text-tertiary font-bold text-xs tracking-[0.5em] animate-pulse uppercase">Syncing Uplink...</div>;

    const hasContent = Object.keys(tree.children).length > 0 || tree.scripts.length > 0;

    return (
        <div className="flex-1 min-h-0 overflow-hidden relative -mx-4">
            <div
                ref={containerRef}
                onScroll={handleScroll}
                onMouseMove={() => { if (useTreeStore.getState().isVimMode) setIsVimMode(false); }}
                className={`absolute inset-0 overflow-y-auto custom-scrollbar pl-4 pr-[6px] ${draggedScriptPath ? 'opacity-30 blur-[1px] transition-all duration-300' : ''}`}
                style={{ paddingTop: toolbarH, scrollPaddingTop: toolbarH + 16, scrollPaddingBottom: 16 }}
                id="script-list-container"
            >
                <SearchContext.Provider value={{
                    query: searchQuery.toLowerCase().includes("file:") ? searchQuery.replace(/file:/gi, "").trim() :
                        searchQuery.toLowerCase().includes("path:") ? searchQuery.replace(/path:/gi, "").trim() : searchQuery,
                    prefix: searchQuery.toLowerCase().startsWith("file:") ? "file" :
                        searchQuery.toLowerCase().startsWith("path:") ? "path" : null,
                    matches: searchMatches,
                }}>
                    {gridEverMounted && <div ref={gridViewRef} className={viewMode !== "tree" ? "" : "hidden"}>
                        <ScriptGridView
                            mode={viewMode !== "tree" ? viewMode as "tiles" | "list" : lastGridMode.current}
                            filtered={filtered}
                            groupedHub={groupedHub}
                            filterTag={filterTag}
                            columnsCount={columnsCount}
                            masonryColumns={masonryColumns}
                            isPathsEmpty={!!isPathsEmpty}
                            hasContent={hasAnyContent}
                            searchQuery={searchQuery}
                            onAddPath={onAddPath}
                            onRemovePath={onRemovePath}
                            scanPaths={scanPaths}
                            onRefresh={onRefresh}
                            isRefreshing={isRefreshing}
                            onViewModeChange={onViewModeChange}
                            onOpenSettings={onOpenSettings}
                            setSearchQuery={setSearchQuery}
                            isDragging={isDragging}
                            draggedScriptPath={draggedScriptPath}
                            editingScript={viewMode !== "tree" && isActive ? editingScript : null}
                            pendingScripts={pendingScripts}
                            removingTags={removingTags}
                            allUniqueTags={allUniqueTags}
                            popoverRef={popoverRef}
                            showHidden={showHidden}
                            contextMenu={contextMenu}
                            handleCustomMouseDown={handleCustomMouseDown}
                            handleToggle={handleToggle}
                            startEditing={startEditing}
                            addTag={addTag}
                            removeTag={removeTag}
                            stopEditing={stopEditing}
                            onScriptContextMenu={onScriptContextMenu}
                            onShowUI={onShowUI}
                            onRestart={handleRestart}
                            setFocusedPath={setFocusedPath}
                            onSelectScript={onSelectScript}
                            collapsedSections={hubCollapsed}
                            toggleSection={toggleHubSection}
                        />
                    </div>}
                    <div ref={treeViewRef} className={viewMode === "tree" ? "flex flex-col space-y-0.5 select-none min-h-full" : "hidden"}>
                        <TreeContext.Provider value={treeContextValue}>
                            {!hasContent ? (
                                <EmptyState
                                    isPathsEmpty={!!isPathsEmpty}
                                    hasContent={hasAnyContent}
                                    searchQuery={searchQuery}
                                    filterTag={filterTag}
                                    scanPaths={scanPaths}
                                    onAddPath={onAddPath}
                                    onRemovePath={onRemovePath}
                                    onRefresh={onRefresh}
                                    isRefreshing={isRefreshing}
                                    onOpenSettings={onOpenSettings}
                                />
                            ) : (
                                <TreeNodeRenderer node={tree} depth={0} />
                            )}
                        </TreeContext.Provider>
                    </div>
                </SearchContext.Provider>
            </div>
            <div
                className="absolute top-0 left-0 right-0 h-[50px] pointer-events-none z-[499]"
                style={{ background: 'linear-gradient(to bottom, color-mix(in srgb, var(--bg-primary) 90%, transparent), transparent)' }}
            />
            <div
                ref={toolbarRef}
                className="absolute z-[500] rounded-2xl border border-white/10"
                style={{
                    top: 12,
                    left: 12,
                    right: 12,
                    paddingLeft: 8,
                    paddingRight: 8,
                    backgroundColor: 'rgba(0,0,0,0.01)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                }}
            >
                <ScriptTreeToolbar
                    viewMode={viewMode}
                    onViewModeChange={onViewModeChange}
                    isDragging={isDragging}
                    draggedScriptPath={draggedScriptPath}
                    sortBy={sortBy}
                    setSortBy={setSortBy}
                    isAllExpanded={isAllExpanded}
                    toggleAll={toggleAll}
                    isAllHubExpanded={isAllHubExpanded}
                    toggleAllHub={toggleAllHub}
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    showHidden={showHidden}
                    setShowHidden={setShowHidden}
                    filterTag={filterTag}
                    searchInputRef={searchInputRef}
                    onSearchFocus={() => setIsSearchActive(true)}
                    onSearchBlur={() => setIsSearchActive(false)}
                />
            </div>
        </div>
    );
}
