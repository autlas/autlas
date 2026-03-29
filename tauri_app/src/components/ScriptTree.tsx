import { useState, useEffect, useRef, useMemo } from "react";
import CheatSheet from "./CheatSheet";
import { SearchContext } from "../context/SearchContext";
import { ScriptTreeProps } from "../types/script";
import { useScriptTree } from "../hooks/useScriptTree";
import { useHotkeys } from "react-hotkeys-hook";
import EmptyState from "./EmptyState";
import ScriptTreeToolbar from "./ScriptTreeToolbar";
import ScriptGridView from "./ScriptGridView";
import { TreeContext, TreeNodeRenderer } from "./TreeNodeRenderer";

export default function ScriptTree({ filterTag, onTagsLoaded, onLoadingChange, onRunningCountChange, viewMode, onViewModeChange, onCustomDragStart, isDragging, draggedScriptPath, animationsEnabled, onScriptContextMenu, onFolderContextMenu, searchQuery, setSearchQuery, contextMenu, onShowUI, manualRefresh, onScanComplete, isPathsEmpty, onAddPath, onRefresh }: ScriptTreeProps) {
    const searchInputRef = useRef<HTMLInputElement>(null);
    const lastGTimeRef = useRef(0);
    const lastFTimeRef = useRef(0);
    const isInstantScrollRef = useRef(false);
    const [sortBy, setSortBy] = useState<"name" | "path">("name");

    const {
        loading, filtered, tree, groupedHub,
        expandedFolders,
        editingScript, pendingScripts, removingTags,
        isAllExpanded, showHidden, allUniqueTags,
        popoverRef, folderRefs,
        setShowHidden,
        toggleFolder, toggleAll, setFolderExpansionRecursive,
        handleToggle, handleRestart, startEditing, stopEditing,
        addTag, removeTag, handleCustomMouseDown, folderDurations,
        focusedPath, setFocusedPath, isVimMode, setIsVimMode, visibleItems, moveFocus
    } = useScriptTree({ filterTag, onTagsLoaded, onCustomDragStart, searchQuery, setSearchQuery, onRunningCountChange, manualRefresh, onScanComplete, viewMode, sortBy });
    const [isCheatSheetOpen, setIsCheatSheetOpen] = useState(false);

    // ─── VIM HOTKEYS ───────────────────────────────────────────────
    useHotkeys('j', () => {
        const vimNav = localStorage.getItem("ahk_vim_mode_nav") || "hjkl";
        moveFocus('down', vimNav === 'jk' || viewMode === 'tree' ? 1 : columnsCount);
    }, { preventDefault: true });

    useHotkeys('k', () => {
        const vimNav = localStorage.getItem("ahk_vim_mode_nav") || "hjkl";
        moveFocus('up', vimNav === 'jk' || viewMode === 'tree' ? 1 : columnsCount);
    }, { preventDefault: true });

    useHotkeys('h', () => {
        const vimNav = localStorage.getItem("ahk_vim_mode_nav") || "hjkl";
        if (vimNav === 'jk' && viewMode !== 'tree') return;
        moveFocus('left', 1);
    }, { preventDefault: true });

    useHotkeys('l', () => {
        const vimNav = localStorage.getItem("ahk_vim_mode_nav") || "hjkl";
        if (vimNav === 'jk' && viewMode !== 'tree') return;
        moveFocus('right', 1);
    }, { preventDefault: true });

    useHotkeys('enter, space', () => {
        if (!focusedPath) return;
        const item = visibleItems.find(i => i.path === focusedPath);
        if (item) {
            if (item.type === 'script') {
                handleToggle(item.data);
            } else {
                toggleFolder(item.path);
            }
        }
    }, { preventDefault: true });

    useHotkeys('r', () => {
        if (!focusedPath) return;
        const item = visibleItems.find(i => i.path === focusedPath);
        if (item && item.type === 'script' && item.data.is_running) {
            handleRestart(item.data);
        }
    }, { preventDefault: true });

    useHotkeys('t', () => {
        if (!focusedPath) return;
        const item = visibleItems.find(i => i.path === focusedPath);
        if (item && item.type === 'script') {
            startEditing(item.data);
        }
    }, { preventDefault: true });

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
    });

    useHotkeys('f', () => {
        lastFTimeRef.current = performance.now();
    });

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
    });

    useHotkeys('shift+g', (e) => {
        e.preventDefault();
        if (visibleItems.length > 0) {
            isInstantScrollRef.current = true;
            setFocusedPath(visibleItems[visibleItems.length - 1].path);
            setIsVimMode(true);
        }
    });

    useHotkeys('q', () => onViewModeChange('tree'));
    useHotkeys('w', () => onViewModeChange('tiles'));
    useHotkeys('e', () => onViewModeChange('list'));
    useHotkeys('s', () => setSortBy(prev => prev === 'name' ? 'path' : 'name'));

    useHotkeys('i', (e) => {
        if (focusedPath) {
            const item = visibleItems.find(it => it.path === focusedPath);
            if (item && item.type === 'script' && item.data.is_running && item.data.has_ui) {
                onShowUI(item.data);
                return;
            }
        }
        const now = performance.now();
        const fDiff = now - lastFTimeRef.current;
        const gDiff = now - lastGTimeRef.current;
        if (fDiff < 1000) {
            e.preventDefault();
            lastFTimeRef.current = 0;
            lastGTimeRef.current = 0;
            setSearchQuery('file:');
            setTimeout(() => searchInputRef.current?.focus(), 10);
        } else if (gDiff < 1000) {
            e.preventDefault();
            lastFTimeRef.current = 0;
            lastGTimeRef.current = 0;
            if (searchInputRef.current) searchInputRef.current.focus();
        }
    });

    useHotkeys('ctrl+f', (e) => {
        e.preventDefault();
        if (searchInputRef.current) searchInputRef.current.focus();
    });

    useHotkeys('esc', () => {
        if (isCheatSheetOpen) {
            setIsCheatSheetOpen(false);
            return;
        }
        if (document.activeElement === searchInputRef.current) {
            searchInputRef.current?.blur();
        }
        setFocusedPath(null);
        setIsVimMode(false);
    }, { enableOnFormTags: true }, [isCheatSheetOpen]);

    const lastScrollTimeRef = useRef(0);

    useEffect(() => {
        if (!focusedPath) return;
        const el = folderRefs.current.get(focusedPath) || document.getElementById(`script-${focusedPath}`);
        if (el) {
            const now = performance.now();
            const diff = now - lastScrollTimeRef.current;
            lastScrollTimeRef.current = now;
            const behavior = isInstantScrollRef.current || (diff < 80 && diff > 0) ? 'auto' : 'smooth';
            isInstantScrollRef.current = false;
            el.scrollIntoView({ behavior, block: 'nearest' });
        }
    }, [focusedPath]);

    useEffect(() => {
        if (onLoadingChange) onLoadingChange(loading);
    }, [loading, onLoadingChange]);

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

    const expandedFoldersRef = useRef<Record<string, boolean>>(expandedFolders);
    expandedFoldersRef.current = expandedFolders;

    const treeContextValue = useMemo(() => ({
        expandedFoldersRef,
        toggleFolder, setFolderExpansionRecursive, folderRefs,
        isDragging, draggedScriptPath, animationsEnabled,
        onFolderContextMenu, onScriptContextMenu,
        editingScript, pendingScripts, removingTags, allUniqueTags,
        popoverRef, handleCustomMouseDown, handleToggle,
        startEditing, stopEditing, addTag, removeTag, folderDurations,
        showHidden,
        contextMenu,
        onShowUI,
        onRestart: handleRestart,
        focusedPath,
        setFocusedPath,
        isVimMode,
        setIsVimMode
    }), [
        expandedFolders, toggleFolder, setFolderExpansionRecursive, isDragging, draggedScriptPath,
        animationsEnabled, onFolderContextMenu, onScriptContextMenu, editingScript,
        pendingScripts, removingTags, allUniqueTags, folderDurations, showHidden,
        contextMenu, onShowUI, handleRestart, focusedPath, isVimMode
    ]);

    const masonryColumns = useMemo(() => {
        const cols: import("../api").Script[][] = Array.from({ length: columnsCount }, () => []);
        filtered.forEach((s, i) => cols[i % columnsCount].push(s));
        return cols;
    }, [filtered, columnsCount]);

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
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                showHidden={showHidden}
                setShowHidden={setShowHidden}
                filterTag={filterTag}
                searchInputRef={searchInputRef}
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
                    className={`flex-1 overflow-y-auto custom-scrollbar -mx-8 px-8 transition-all duration-300 ${draggedScriptPath ? 'opacity-30 blur-[1px]' : ''}`}
                    id="script-list-container"
                >
                    {viewMode !== "tree" ? (
                        <ScriptGridView
                            mode={viewMode as "tiles" | "list"}
                            filtered={filtered}
                            groupedHub={groupedHub}
                            filterTag={filterTag}
                            columnsCount={columnsCount}
                            masonryColumns={masonryColumns}
                            isPathsEmpty={!!isPathsEmpty}
                            hasContent={hasContent}
                            searchQuery={searchQuery}
                            onAddPath={onAddPath}
                            onRefresh={onRefresh}
                            onViewModeChange={onViewModeChange}
                            setSearchQuery={setSearchQuery}
                            isDragging={isDragging}
                            draggedScriptPath={draggedScriptPath}
                            editingScript={editingScript}
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
                            focusedPath={focusedPath}
                            setFocusedPath={setFocusedPath}
                            isVimMode={isVimMode}
                            setIsVimMode={setIsVimMode}
                        />
                    ) : (
                        <div className="flex flex-col space-y-0.5 select-none">
                            <TreeContext.Provider value={treeContextValue}>
                                {!hasContent ? (
                                    <EmptyState
                                        isPathsEmpty={!!isPathsEmpty}
                                        hasContent={hasContent}
                                        searchQuery={searchQuery}
                                        filterTag={filterTag}
                                        onAddPath={onAddPath}
                                        onRefresh={onRefresh}
                                        onViewModeChange={onViewModeChange}
                                        setSearchQuery={setSearchQuery}
                                    />
                                ) : (
                                    <TreeNodeRenderer node={tree} depth={0} isExpanded={true} />
                                )}
                            </TreeContext.Provider>
                        </div>
                    )}
                </div>
            </SearchContext.Provider>
            <CheatSheet isOpen={isCheatSheetOpen} onClose={() => setIsCheatSheetOpen(false)} />
        </div>
    );
}
