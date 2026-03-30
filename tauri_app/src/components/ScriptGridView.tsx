import React from "react";
import HubScriptCard from "./HubScriptCard";
import ScriptRow from "./ScriptRow";
import EmptyState from "./EmptyState";
import { Script } from "../api";

const TagSectionHeader = ({ tag }: { tag: string }) => (
    <div className="flex items-center mb-4 mt-12 first:mt-2 px-2 sticky top-0 z-40 py-4">
        <span className="text-[22px] font-black uppercase tracking-[0.15em] text-white/30 flex items-center leading-none">
            {tag}
        </span>
    </div>
);

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
    onRefresh?: () => void;
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
}

export default function ScriptGridView({
    mode, filtered, groupedHub, filterTag, columnsCount, masonryColumns,
    isPathsEmpty, hasContent, searchQuery, onAddPath, onRefresh, onOpenSettings,
    isDragging, draggedScriptPath, editingScript, pendingScripts, removingTags, allUniqueTags,
    popoverRef, showHidden, contextMenu, handleCustomMouseDown, handleToggle,
    startEditing, addTag, removeTag, stopEditing, onScriptContextMenu,
    onShowUI, onRestart, setFocusedPath, onSelectScript,
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
                    onAddPath={onAddPath}
                    onRefresh={onRefresh}
                    onOpenSettings={onOpenSettings}
                />
            ) : (filterTag === "hub" && groupedHub) ? (
                groupedHub.map(({ tag, scripts }) => {
                    const sectionMasonry: Script[][] = Array.from({ length: columnsCount }, () => []);
                    scripts.forEach((s, i) => sectionMasonry[i % columnsCount].push(s));
                    return (
                        <div key={tag} className={`flex flex-col ${isTiles ? 'mb-10' : 'mb-8'} last:pb-10`}>
                            <TagSectionHeader tag={tag} />
                            <div
                                className={`grid ${gridGap} items-start`}
                                style={{ gridTemplateColumns: `repeat(${columnsCount}, minmax(0, 1fr))` }}
                            >
                                {sectionMasonry.map((col, colIdx) => (
                                    <div key={colIdx} className={colClass}>
                                        {col.map(s => renderCard(s))}
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })
            ) : (
                <div
                    className={`grid ${gridGap} items-start pt-6 pb-10`}
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
}
