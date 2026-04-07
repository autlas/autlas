import React from "react";
import HubScriptCard from "./HubScriptCard";
import ScriptRow from "./ScriptRow";
import EmptyState from "../common/EmptyState";
import { Script } from "../../api";
import { ChevronDownIcon, TagIconSvg, TagDotIcon } from "../ui/Icons";
import { useTreeStore } from "../../store/useTreeStore";

const TagSectionHeader = ({ tag, isCollapsed, onToggle, runningCount }: { tag: string; isCollapsed: boolean; onToggle: () => void; runningCount: number }) => {
    const tagIcon = useTreeStore(s => s.tagIcons[tag]);
    return (
        <div className="flex items-center mb-1 mt-12 first:mt-2 px-2 sticky top-0 z-40 py-4 cursor-pointer select-none group" onClick={onToggle}>
            <span className="text-white/15 flex-shrink-0">
                {tagIcon ? <TagIconSvg name={tagIcon} size={32} /> : <TagDotIcon size={32} />}
            </span>
            <span className="text-[22px] font-black uppercase tracking-[0.15em] text-white/30 flex items-center leading-none ml-5">
                {tag}
            </span>
            <ChevronDownIcon className={`ml-3 text-white/15 group-hover:text-white/30 transition-all duration-200 ${isCollapsed ? '-rotate-90' : ''}`} />
            <div className={`ml-3 w-5 h-5 rounded-full bg-green-500 shadow-[0_0_12px_rgba(34,197,94,0.6)] flex items-center justify-center transition-all duration-300 ease-[cubic-bezier(0.34,1.3,0.64,1)] origin-center ${isCollapsed && runningCount > 0 ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}`}>
                <span className="text-[15px] font-bold leading-none" style={{ color: "var(--bg-secondary)" }}>{runningCount}</span>
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
    masonryColumns: Script[][];
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
}

export default React.memo(function ScriptGridView({
    mode, filtered, groupedHub, filterTag, columnsCount, masonryColumns,
    isPathsEmpty, hasContent, searchQuery, onAddPath, onRemovePath, scanPaths, onRefresh, isRefreshing, onOpenSettings,
    isDragging, draggedScriptPath, editingScript, pendingScripts, removingTags, allUniqueTags,
    popoverRef, showHidden, contextMenu, handleCustomMouseDown, handleToggle,
    startEditing, addTag, removeTag, stopEditing, onScriptContextMenu,
    onShowUI, onRestart, setFocusedPath, onSelectScript,
    collapsedSections, toggleSection,
}: ScriptGridViewProps) {
    const isTiles = mode === "tiles";
    const gridGap = isTiles ? "gap-6" : "gap-x-8 gap-y-1";
    const colClass = isTiles ? "flex flex-col gap-6" : "flex flex-col gap-y-1";

    const renderCard = (s: Script) => {
        if (isTiles) {
            return (
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
                    visibilityMode={showHidden}
                    isContextMenuOpen={contextMenu?.type === 'script' && contextMenu?.data?.path === s.path}
                    onMouseDown={handleCustomMouseDown}
                    onToggle={handleToggle}
                    onStartEditing={startEditing}
                    onAddTag={addTag}
                    onRemoveTag={removeTag}
                    onCloseEditing={stopEditing}
                    onScriptContextMenu={onScriptContextMenu}
                    onShowUI={onShowUI}
                    onRestart={onRestart}

                    setFocusedPath={setFocusedPath}
                    onSelectScript={onSelectScript}
                />
            );
        }
        const removingTagKeys = Array.from(removingTags as Set<string>).filter(k => k.startsWith(s.path + '-'));
        return (
            <ScriptRow
                key={s.path}
                s={s}
                isDragging={isDragging}
                draggedScriptPath={draggedScriptPath}
                isEditing={editingScript === s.path}
                isPending={!!pendingScripts[s.path]}
                pendingType={pendingScripts[s.path]}
                removingTagKeys={removingTagKeys}
                allUniqueTags={allUniqueTags}
                popoverRef={popoverRef}
                visibilityMode={showHidden}
                isContextMenuOpen={contextMenu?.type === 'script' && contextMenu?.data?.path === s.path}
                onMouseDown={handleCustomMouseDown}
                onDoubleClick={handleToggle}
                onToggle={handleToggle}
                onStartEditing={startEditing}
                onAddTag={addTag}
                onRemoveTag={removeTag}
                onCloseEditing={stopEditing}
                onScriptContextMenu={onScriptContextMenu}
                onShowUI={onShowUI}
                onRestart={onRestart}
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
                                                {col.map(s => renderCard(s))}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })
            ) : (
                <div
                    className={`grid ${gridGap} items-start pb-10`}
                    style={{ gridTemplateColumns: `repeat(${columnsCount}, minmax(0, 1fr))` }}
                >
                    {masonryColumns.map((col, colIdx) => (
                        <div key={colIdx} className={colClass}>
                            {col.map(s => renderCard(s))}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
})
