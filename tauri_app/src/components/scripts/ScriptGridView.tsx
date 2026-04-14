import React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import HubScriptCard from "./HubScriptCard";
import ScriptRow from "./ScriptRow";
import EmptyState from "../common/EmptyState";
import { Script } from "../../api";
import { ChevronDownIcon, TagIconSvg, TagDotIcon } from "../ui/Icons";
import { useTreeStore } from "../../store/useTreeStore";

const TagSectionHeader = ({ tag, isCollapsed, onToggle, runningCount }: { tag: string; isCollapsed: boolean; onToggle: () => void; runningCount: number }) => {
    const tagIcon = useTreeStore(s => s.tagIcons[tag]);
    return (
        <div className="flex items-center mb-2 mt-12 first:mt-2 px-6 sticky top-[-11px] z-[150] py-3 cursor-pointer select-none group backdrop-blur-md rounded-2xl border border-white/5" onClick={onToggle}>
            <span className="text-white/45 group-hover:text-white/80 transition-colors duration-200 flex-shrink-0">
                {tagIcon ? <TagIconSvg name={tagIcon} size={32} /> : <TagDotIcon size={32} />}
            </span>
            <span className="text-xl font-bold uppercase tracking-[0.075em] text-white/45 group-hover:text-white/80 transition-colors duration-200 flex items-center leading-none ml-5">
                {tag}
            </span>
            <ChevronDownIcon className={`ml-3 text-white/15 group-hover:text-white/30 transition-all duration-200 ${isCollapsed ? '-rotate-90' : ''}`} />
            <div className={`ml-3 w-5 h-5 rounded-full bg-green-500 shadow-[0_0_12px_rgba(34,197,94,0.6)] flex items-center justify-center transition-all duration-300 ease-[cubic-bezier(0.34,1.3,0.64,1)] origin-center ${isCollapsed && runningCount > 0 ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}`}>
                <span className="text-sm font-bold leading-none" style={{ color: "var(--bg-secondary)" }}>{runningCount}</span>
            </div>
        </div>
    );
};

interface ScriptGridViewProps {
    mode: "tiles" | "list";
    filtered: Script[];
    groupedHub: { tag: string; scripts: Script[] }[] | null;
    filterTag: string;
    columnsCount: number;
    // empty state
    isPathsEmpty: boolean;
    hasContent: boolean;
    searchQuery: string;
    onAddPath?: () => void;
    onRemovePath?: (path: string) => void;
    scanPaths?: string[];
    onRefresh?: () => void;
    isRefreshing?: boolean;
    onViewModeChange: (mode: any) => void;
    onOpenSettings?: () => void;
    setSearchQuery: (q: string) => void;
    // script state
    isDragging: boolean;
    draggedScriptPath: string | null;
    editingScript: string | null;
    pendingScripts: Record<string, "run" | "kill" | "restart">;
    removingTags: Set<string>;
    allUniqueTags: string[];
    popoverRef: React.MutableRefObject<HTMLDivElement | null>;
    showHidden: 'none' | 'all' | 'only';
    contextMenu: any;
    handleCustomMouseDown: (e: React.MouseEvent, script: Script) => void;
    handleToggle: (s: Script) => void;
    startEditing: (s: Script) => void;
    addTag: (script: Script, tag: string) => void;
    removeTag: (script: Script, tag: string) => void;
    stopEditing: () => void;
    onScriptContextMenu: (e: React.MouseEvent, s: Script) => void;
    onShowUI: (s: Script) => void;
    onRestart: (s: Script) => void;
    setFocusedPath: (path: string | null) => void;
    onSelectScript?: (s: Script) => void;
    collapsedSections: Set<string>;
    toggleSection: (tag: string) => void;
    scrollContainerRef: React.RefObject<HTMLDivElement | null>;
    scrollMargin: number;
    /** This view is the one currently shown on screen. Grid and tree views
     *  share a scroll container; only the active view should auto-scroll
     *  to keep focus in view (otherwise both fight for scrollTop). */
    isActive: boolean;
}

export default React.memo(function ScriptGridView({
    mode, filtered, groupedHub, filterTag, columnsCount,
    isPathsEmpty, hasContent, searchQuery, onAddPath, onRemovePath, scanPaths, onRefresh, isRefreshing, onOpenSettings,
    isDragging, draggedScriptPath, editingScript, pendingScripts, removingTags, allUniqueTags,
    popoverRef, showHidden, contextMenu, handleCustomMouseDown, handleToggle,
    startEditing, addTag, removeTag, stopEditing, onScriptContextMenu,
    onShowUI, onRestart, setFocusedPath, onSelectScript,
    collapsedSections, toggleSection,
    scrollContainerRef, scrollMargin,
    isActive,
}: ScriptGridViewProps) {
    const isTiles = mode === "tiles";
    const gridGap = isTiles ? "gap-6" : "gap-x-8 gap-y-1";
    const colClass = isTiles ? "flex flex-col gap-6" : "flex flex-col gap-y-1";
    // Row heights: tile=200 + gap-6 (24) = 224 ; row=38 + mb-0.5 (2) + gap-y-1 (4) = 44
    const rowHeight = isTiles ? 224 : 44;
    const virtualRows = Math.ceil(filtered.length / columnsCount);

    const virtualizer = useVirtualizer({
        count: virtualRows,
        getScrollElement: () => scrollContainerRef.current,
        estimateSize: () => rowHeight,
        overscan: isTiles ? 5 : 15,
        scrollMargin,
        // Built-in padding: item >= 300px from top / 200px from bottom when
        // scrolled via scrollToIndex (vim j/k).
        scrollPaddingStart: 300,
        scrollPaddingEnd: 200,
    });

    // Reset cached measurements when layout parameters change.
    // estimateSize captures `rowHeight` at creation, but the virtualizer
    // keeps per-row measurements that become stale on mode/columns change.
    React.useEffect(() => {
        virtualizer.measure();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, columnsCount]);

    // Build a path → filtered index map. Avoids O(N) findIndex on every
    // j-press when the list has thousands of items.
    const pathToIndex = React.useMemo(() => {
        const map = new Map<string, number>();
        filtered.forEach((s, i) => map.set(s.path, i));
        return map;
    }, [filtered]);

    // Scroll-to-focused-item for non-hub tiles/list (hub has its own path).
    // Gated by isActive: when grid view is hidden (user is on tree), the
    // tree view owns the shared scroll container — this subscription must
    // stay quiet so the two virtualizers don't fight for scrollTop.
    React.useEffect(() => {
        if (!isActive) return;
        if (filterTag === "hub") return;
        return useTreeStore.subscribe((state, prev) => {
            if (state.focusedPath === prev.focusedPath) return;
            if (!state.focusedPath || !state.isVimMode) return;
            const idx = pathToIndex.get(state.focusedPath);
            if (idx === undefined) return;
            const row = Math.floor(idx / columnsCount);
            virtualizer.scrollToIndex(row, { align: "auto" });
        });
    }, [isActive, filterTag, pathToIndex, columnsCount, virtualizer]);

    // When this view becomes active OR the mode changes (tiles ↔ list),
    // scroll the focused item back into view. Without the `mode` dep
    // switching tiles → list wouldn't trigger scroll because isActive
    // stays true the whole time.
    React.useEffect(() => {
        if (!isActive) return;
        if (filterTag === "hub") return;
        const focused = useTreeStore.getState().focusedPath;
        if (!focused) return;
        const idx = pathToIndex.get(focused);
        if (idx === undefined) return;
        const row = Math.floor(idx / columnsCount);
        // Two rAFs: first lets virtualizer.measure() settle after mode swap,
        // second scrolls after the new layout has been committed.
        let raf2 = 0;
        const raf1 = requestAnimationFrame(() => {
            raf2 = requestAnimationFrame(() => virtualizer.scrollToIndex(row, { align: "auto" }));
        });
        return () => {
            cancelAnimationFrame(raf1);
            if (raf2) cancelAnimationFrame(raf2);
        };
    }, [isActive, mode, filterTag, pathToIndex, columnsCount, virtualizer]);

    const renderCard = (s: Script, groupTag?: string) => {
        // В Hub-режиме один и тот же скрипт может появиться в нескольких группах
        // (по одной карточке на тег). Чтобы открытый tag-picker привязывался
        // только к конкретной карточке, а не ко всем дублям, scope-им editingScript
        // через ключ "groupTag::path".
        const editingKey = groupTag ? `${groupTag}::${s.path}` : s.path;
        const scopedEditingScript = editingScript === editingKey ? s.path : null;
        const scopedStartEditing = groupTag
            ? () => useTreeStore.getState().setEditingScript(editingKey)
            : startEditing;
        // Тот же scope для contextMenu: помечаем data._groupTag, чтобы из нескольких
        // карточек одного скрипта подсвечивалась только та, на которой кликнули.
        const scopedContextMenu = groupTag
            ? (e: React.MouseEvent, sc: Script) => onScriptContextMenu(e, { ...sc, _groupTag: groupTag } as Script)
            : onScriptContextMenu;
        const isContextMenuOpenScoped = contextMenu?.type === 'script'
            && contextMenu?.data?.path === s.path
            && (contextMenu?.data?._groupTag ?? undefined) === groupTag;
        if (isTiles) {
            return (
                <HubScriptCard
                    key={editingKey}
                    s={s}
                    isDragging={isDragging}
                    draggedScriptPath={draggedScriptPath}
                    editingScript={scopedEditingScript}
                    pendingScripts={pendingScripts}
                    removingTags={removingTags}
                    allUniqueTags={allUniqueTags}
                    popoverRef={popoverRef}
                    visibilityMode={showHidden}
                    isContextMenuOpen={isContextMenuOpenScoped}
                    onMouseDown={handleCustomMouseDown}
                    onToggle={handleToggle}
                    onStartEditing={scopedStartEditing}
                    onAddTag={addTag}
                    onRemoveTag={removeTag}
                    onCloseEditing={stopEditing}
                    onScriptContextMenu={scopedContextMenu}
                    onShowUI={onShowUI}
                    onRestart={onRestart}
                    focusKey={editingKey}
                    setFocusedPath={setFocusedPath}
                    onSelectScript={onSelectScript}
                />
            );
        }
        const removingTagKeys = Array.from(removingTags as Set<string>).filter(k => k.startsWith(s.path + '-'));
        return (
            <ScriptRow
                key={editingKey}
                s={s}
                isDragging={isDragging}
                draggedScriptPath={draggedScriptPath}
                isEditing={scopedEditingScript === s.path}
                isPending={!!pendingScripts[s.path]}
                pendingType={pendingScripts[s.path]}
                removingTagKeys={removingTagKeys}
                allUniqueTags={allUniqueTags}
                popoverRef={popoverRef}
                visibilityMode={showHidden}
                isContextMenuOpen={isContextMenuOpenScoped}
                onMouseDown={handleCustomMouseDown}
                onDoubleClick={handleToggle}
                onToggle={handleToggle}
                onStartEditing={scopedStartEditing}
                onScriptContextMenu={scopedContextMenu}
                onAddTag={addTag}
                onRemoveTag={removeTag}
                onCloseEditing={stopEditing}
                onShowUI={onShowUI}
                onRestart={onRestart}
                focusKey={editingKey}
                setFocusedPath={setFocusedPath}
                onSelectScript={onSelectScript}
            />
        );
    };

    return (
        <div className="flex flex-col min-h-full">
            {filtered.length === 0 ? (
                <EmptyState
                    isPathsEmpty={isPathsEmpty}
                    hasContent={hasContent}
                    searchQuery={searchQuery}
                    filterTag={filterTag}
                    scanPaths={scanPaths}
                    onAddPath={onAddPath}
                    onRemovePath={onRemovePath}
                    onRefresh={onRefresh}
                    isRefreshing={isRefreshing}
                    onOpenSettings={onOpenSettings}
                />
            ) : (filterTag === "hub" && groupedHub) ? (
                groupedHub.map(({ tag, scripts }) => {
                    const isCollapsed = collapsedSections.has(tag);
                    const sectionMasonry: Script[][] = Array.from({ length: columnsCount }, () => []);
                    scripts.forEach((s, i) => sectionMasonry[i % columnsCount].push(s));
                    return (
                        <div key={tag} className="flex flex-col last:pb-10">
                            <TagSectionHeader tag={tag} isCollapsed={isCollapsed} onToggle={() => toggleSection(tag)} runningCount={scripts.filter(s => s.is_running).length} />
                            <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out overflow-hidden -m-3 ${isCollapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'}`}>
                                <div className="min-h-0 p-3">
                                    <div
                                        className={`grid ${gridGap} items-start ${isTiles ? 'pb-10' : 'pb-8'}`}
                                        style={{ gridTemplateColumns: `repeat(${columnsCount}, minmax(0, 1fr))` }}
                                    >
                                        {sectionMasonry.map((col, colIdx) => (
                                            <div key={colIdx} className={colClass}>
                                                {col.map(s => renderCard(s, tag))}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })
            ) : (
                <div style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}>
                    {virtualizer.getVirtualItems().map(vRow => {
                        const startIdx = vRow.index * columnsCount;
                        const endIdx = Math.min(startIdx + columnsCount, filtered.length);
                        const rowScripts = filtered.slice(startIdx, endIdx);
                        return (
                            <div
                                key={vRow.key}
                                className={`grid ${gridGap}`}
                                style={{
                                    position: "absolute",
                                    top: 0,
                                    left: 0,
                                    width: "100%",
                                    transform: `translateY(${vRow.start - virtualizer.options.scrollMargin}px)`,
                                    gridTemplateColumns: `repeat(${columnsCount}, minmax(0, 1fr))`,
                                }}
                            >
                                {rowScripts.map(s => renderCard(s))}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
})
