import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import CheatSheet from "./CheatSheet";
import { SearchContext } from "../context/SearchContext";
import { ScriptTreeProps } from "../types/script";
import { useScriptTree } from "../hooks/useScriptTree";
import { useHotkeys } from "react-hotkeys-hook";
import EmptyState from "./EmptyState";
import ScriptTreeToolbar from "./ScriptTreeToolbar";
import ScriptGridView from "./ScriptGridView";
import { TreeContext, TreeNodeRenderer, setTreeCallbacks } from "./TreeNodeRenderer";
import { useTreeStore } from "../store/useTreeStore";

export default function ScriptTree({ filterTag, onTagsLoaded, onLoadingChange, onRunningCountChange, viewMode, onViewModeChange, onCustomDragStart, isDragging, draggedScriptPath, animationsEnabled, onScriptContextMenu, onFolderContextMenu, searchQuery, setSearchQuery, contextMenu, onShowUI, refreshKey, onScanComplete, isPathsEmpty, onAddPath, onRemovePath, scanPaths, onRefresh, onOpenSettings, onSelectScript, onExposeActions, isActive = true }: ScriptTreeProps) {
    const searchInputRef = useRef<HTMLInputElement>(null);
    const lastGTimeRef = useRef(0);
    const lastFTimeRef = useRef(0);
    const [gridEverMounted, setGridEverMounted] = useState(viewMode !== "tree");
    const lastGridMode = useRef<"tiles" | "list">(viewMode !== "tree" ? viewMode as "tiles" | "list" : "tiles");
    const isInstantScrollRef = useRef(false);
    const [sortBy, setSortBy] = useState<"name" | "size">("name");

    // Hub collapsed sections
    const [hubCollapsed, setHubCollapsed] = useState<Set<string>>(() => {
        try { return new Set(JSON.parse(localStorage.getItem("ahk_hub_collapsed") || "[]")); } catch { return new Set(); }
    });
    const toggleHubSection = useCallback((tag: string) => {
        setHubCollapsed(prev => {
            const next = new Set(prev);
            next.has(tag) ? next.delete(tag) : next.add(tag);
            localStorage.setItem("ahk_hub_collapsed", JSON.stringify([...next]));
            return next;
        });
    }, []);

    const {
        loading, isFetching, allScripts, filtered, tree, groupedHub,
        isAllExpanded, allUniqueTags,
        popoverRef, folderRefs,
        toggleFolder, toggleAll, setFolderExpansionRecursive,
        handleToggle, handleRestart, startEditing, stopEditing,
        addTag, removeTag, handleCustomMouseDown,
        visibleItems, moveFocus
    } = useScriptTree({ filterTag, onTagsLoaded, onCustomDragStart, searchQuery, setSearchQuery, onRunningCountChange, refreshKey, onScanComplete, viewMode, sortBy });

    const hubTags = useMemo(() => groupedHub?.map(g => g.tag) ?? [], [groupedHub]);
    const isAllHubExpanded = useMemo(() => hubTags.length === 0 || hubTags.every(t => !hubCollapsed.has(t)), [hubTags, hubCollapsed]);
    const toggleAllHub = useCallback(() => {
        setHubCollapsed(() => {
            const next = new Set(isAllHubExpanded ? hubTags : [] as string[]);
            localStorage.setItem("ahk_hub_collapsed", JSON.stringify([...next]));
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
        onExposeActions?.({ toggle: handleToggle, restart: handleRestart, pendingScripts, allScripts });
    }, [handleToggle, handleRestart, pendingScripts, allScripts, onExposeActions]);

    const [isCheatSheetOpen, setIsCheatSheetOpen] = useState(false);
    const isSearchActiveRef = useRef(false);
    const setIsSearchActive = (v: boolean) => {
        isSearchActiveRef.current = v;
    };

    // ─── VIM HOTKEYS ───────────────────────────────────────────────
    useHotkeys('j', () => {
        const vimNav = localStorage.getItem("ahk_vim_mode_nav") || "hjkl";
        moveFocus('down', vimNav === 'jk' || viewMode === 'tree' ? 1 : columnsCount);
    }, { preventDefault: true, enabled: isActive });

    useHotkeys('k', () => {
        const vimNav = localStorage.getItem("ahk_vim_mode_nav") || "hjkl";
        moveFocus('up', vimNav === 'jk' || viewMode === 'tree' ? 1 : columnsCount);
    }, { preventDefault: true, enabled: isActive });

    useHotkeys('h', () => {
        const vimNav = localStorage.getItem("ahk_vim_mode_nav") || "hjkl";
        if (vimNav === 'jk' && viewMode !== 'tree') return;
        moveFocus('left', 1);
    }, { preventDefault: true, enabled: isActive });

    useHotkeys('l', () => {
        const vimNav = localStorage.getItem("ahk_vim_mode_nav") || "hjkl";
        if (vimNav === 'jk' && viewMode !== 'tree') return;
        moveFocus('right', 1);
    }, { preventDefault: true, enabled: isActive });

    useHotkeys('enter', () => {
        if (!useTreeStore.getState().focusedPath) return;
        const item = visibleItems.find(i => i.path === useTreeStore.getState().focusedPath);
        if (item) {
            if (item.type === 'script') {
                handleToggle(item.data);
            } else {
                toggleFolder(item.path);
            }
        }
    }, { preventDefault: true, enabled: isActive });

    useHotkeys('space', () => {
        if (!useTreeStore.getState().focusedPath) return;
        const item = visibleItems.find(i => i.path === useTreeStore.getState().focusedPath);
        if (item && item.type === 'script') {
            onSelectScript?.(item.data);
        } else if (item) {
            toggleFolder(item.path);
        }
    }, { preventDefault: true, enabled: isActive });

    useHotkeys('r', () => {
        if (!useTreeStore.getState().focusedPath) return;
        const item = visibleItems.find(i => i.path === useTreeStore.getState().focusedPath);
        if (item && item.type === 'script' && item.data.is_running) {
            handleRestart(item.data);
        }
    }, { preventDefault: true, enabled: isActive });

    useHotkeys('t', () => {
        if (!useTreeStore.getState().focusedPath) return;
        const item = visibleItems.find(i => i.path === useTreeStore.getState().focusedPath);
        if (item && item.type === 'script') {
            startEditing(item.data);
        }
    }, { preventDefault: true, enabled: isActive });

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const isQuestionMark = e.key === '?' || (e.key === ',' && e.shiftKey && e.code === 'Slash') || (e.key === '7' && e.shiftKey);
            if (isQuestionMark) {
                if (document.activeElement !== searchInputRef.current) {
                    setIsCheatSheetOpen(prev => !prev);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    useEffect(() => {
        if (visibleItems.length > 0) {
            isInstantScrollRef.current = true;
            const target = visibleItems.find(i => i.type === 'script') || visibleItems[0];
            setFocusedPath(target.path);
        }
    }, [sortBy]);

    useHotkeys('shift+/', () => {
        setIsCheatSheetOpen(prev => !prev);
    }, { enabled: isActive });

    useHotkeys('f', () => {
        lastFTimeRef.current = performance.now();
    }, { enabled: isActive });

    useHotkeys('g', () => {
        const now = performance.now();
        const diff = now - lastGTimeRef.current;
        if (diff < 500 && diff > 0) {
            if (visibleItems.length > 0) {
                isInstantScrollRef.current = true;
                const target = visibleItems.find(i => i.type === 'script') || visibleItems[0];
                setFocusedPath(target.path);
                setIsVimMode(true);
            }
            lastGTimeRef.current = 0;
        } else {
            lastGTimeRef.current = now;
        }
    }, { enabled: isActive });

    useHotkeys('shift+g', (e) => {
        e.preventDefault();
        if (visibleItems.length > 0) {
            isInstantScrollRef.current = true;
            setFocusedPath(visibleItems[visibleItems.length - 1].path);
            setIsVimMode(true);
        }
    }, { enabled: isActive });

    useHotkeys('q', () => onViewModeChange('tree'), { enabled: isActive });
    useHotkeys('w', () => onViewModeChange('tiles'), { enabled: isActive });
    useHotkeys('e', () => onViewModeChange('list'), { enabled: isActive });
    useHotkeys('s', () => setSortBy(prev => prev === 'name' ? 'size' : 'name'), { enabled: isActive });

    useHotkeys('i', (e) => {
        const now = performance.now();
        const fDiff = now - lastFTimeRef.current;
        const gDiff = now - lastGTimeRef.current;
        if (fDiff < 1000) {
            e.preventDefault();
            lastFTimeRef.current = 0;
            lastGTimeRef.current = 0;
            setSearchQuery('file:');
            setTimeout(() => searchInputRef.current?.focus(), 10);
            return;
        }
        if (gDiff < 1000) {
            e.preventDefault();
            lastFTimeRef.current = 0;
            lastGTimeRef.current = 0;
            if (searchInputRef.current) searchInputRef.current.focus();
            return;
        }
        if (useTreeStore.getState().focusedPath) {
            const item = visibleItems.find(it => it.path === useTreeStore.getState().focusedPath);
            if (item && item.type === 'script' && item.data.is_running && item.data.has_ui) {
                onShowUI(item.data);
            }
        }
    }, { enabled: isActive });

    useHotkeys('ctrl+f', (e) => {
        e.preventDefault();
        if (searchInputRef.current) searchInputRef.current.focus();
    }, { enabled: isActive });

    useHotkeys('esc', () => {
        if (isCheatSheetOpen) {
            setIsCheatSheetOpen(false);
            return;
        }
        if (isSearchActiveRef.current) {
            searchInputRef.current?.blur();
            return;
        }
        setFocusedPath(null);
        setIsVimMode(false);
    }, { enableOnFormTags: true, enabled: isActive }, [isCheatSheetOpen]);

    const lastScrollTimeRef = useRef(0);

    useEffect(() => {
        return useTreeStore.subscribe((state, prev) => {
            if (state.focusedPath === prev.focusedPath) return;
            if (!state.focusedPath || !state.isVimMode) return;
            const el = folderRefs.current.get(state.focusedPath) || document.getElementById(`script-${state.focusedPath}`);
            if (el) {
                const now = performance.now();
                const diff = now - lastScrollTimeRef.current;
                lastScrollTimeRef.current = now;
                const behavior = isInstantScrollRef.current || (diff < 80 && diff > 0) ? 'auto' : 'smooth';
                isInstantScrollRef.current = false;
                el.scrollIntoView({ behavior, block: 'nearest' });
            }
        });
    }, []);

    useEffect(() => {
        if (viewMode !== "tree") {
            setGridEverMounted(true);
            lastGridMode.current = viewMode as "tiles" | "list";
        }
    }, [viewMode]);

    useEffect(() => {
        if (onLoadingChange) onLoadingChange(isFetching);
    }, [isFetching, onLoadingChange]);

    const [columnsCount, setColumnsCount] = useState(1);
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollPositions = useRef<Record<string, number>>({});

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

    const treeContextValue = useMemo(() => ({
        toggleFolder, setFolderExpansionRecursive, folderRefs,
        animationsEnabled, allUniqueTags,
        onFolderContextMenu, onScriptContextMenu,
        popoverRef, handleCustomMouseDown, handleToggle,
        startEditing, stopEditing, addTag, removeTag,
        onShowUI,
        onRestart: handleRestart,
        onSelectScript
    }), [
        toggleFolder, setFolderExpansionRecursive,
        animationsEnabled, onFolderContextMenu, onScriptContextMenu,
        allUniqueTags,
        handleCustomMouseDown, handleToggle,
        startEditing, stopEditing, addTag, removeTag,
        onShowUI, handleRestart, onSelectScript
    ]);

    // Set module-level callbacks for TreeNodeRenderer (bypasses useContext → prevents memo bypass)
    setTreeCallbacks(treeContextValue);

    const masonryColumns = useMemo(() => {
        const cols: import("../api").Script[][] = Array.from({ length: columnsCount }, () => []);
        filtered.forEach((s, i) => cols[i % columnsCount].push(s));
        return cols;
    }, [filtered, columnsCount]);

    const hasAnyContent = useMemo(() => {
        const sysTagNames = ["hub", "fav", "favourites"];
        return allScripts.some(s => {
            if (filterTag === "hub") return s.is_running || s.tags.some(t => sysTagNames.includes(t.toLowerCase()));
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
        <div className="flex flex-col h-full min-h-0">
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
            <SearchContext.Provider value={{
                query: searchQuery.toLowerCase().includes("file:") ? searchQuery.replace(/file:/gi, "").trim() :
                    searchQuery.toLowerCase().includes("path:") ? searchQuery.replace(/path:/gi, "").trim() : searchQuery,
                prefix: searchQuery.toLowerCase().startsWith("file:") ? "file" :
                    searchQuery.toLowerCase().startsWith("path:") ? "path" : null
            }}>
                <div
                    ref={containerRef}
                    onScroll={handleScroll}
                    onMouseMove={() => { if (useTreeStore.getState().isVimMode) setIsVimMode(false); }}
                    className={`flex-1 overflow-y-auto custom-scrollbar -mx-4 pl-4 pr-[6px] transition-all duration-300 ${draggedScriptPath ? 'opacity-30 blur-[1px]' : ''}`}
                    id="script-list-container"
                >
                    {gridEverMounted && <div className={viewMode !== "tree" ? "" : "hidden"}>
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
                            onViewModeChange={onViewModeChange}
                            onOpenSettings={onOpenSettings}
                            setSearchQuery={setSearchQuery}
                            isDragging={isDragging}
                            draggedScriptPath={draggedScriptPath}
                            editingScript={viewMode !== "tree" ? editingScript : null}
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
                    <div className={viewMode === "tree" ? "flex flex-col space-y-0.5 select-none min-h-full" : "hidden"}>
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
                                    onOpenSettings={onOpenSettings}
                                />
                            ) : (
                                <TreeNodeRenderer node={tree} depth={0} />
                            )}
                        </TreeContext.Provider>
                    </div>
                </div>
            </SearchContext.Provider>
            <CheatSheet isOpen={isCheatSheetOpen} onClose={() => setIsCheatSheetOpen(false)} />
        </div>
    );
}
