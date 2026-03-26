import React, { useState, useEffect, useRef, useMemo } from "react";
import { HighlightText } from "./HighlightText";
import { SearchContext } from "../context/SearchContext";
import { ScriptTreeProps, TreeNode } from "../types/script";
import { useScriptTree } from "../hooks/useScriptTree";
import ScriptRow from "./ScriptRow";
import HubScriptCard from "./HubScriptCard";

export default function ScriptTree({ filterTag, onTagsLoaded, viewMode, onViewModeChange, onCustomDragStart, isDragging, draggedScriptPath, animationsEnabled, onScriptContextMenu, onFolderContextMenu, searchQuery, setSearchQuery }: ScriptTreeProps) {
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

    const [columnsCount, setColumnsCount] = useState(1);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!containerRef.current) return;

        const GAP = 24; // gap-6
        const MIN_COL_WIDTH = 340;

        const updateColumns = (width: number) => {
            const count = Math.max(1, Math.floor((width + GAP) / (MIN_COL_WIDTH + GAP)));
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

    const masonryColumns = useMemo(() => {
        const cols: any[][] = Array.from({ length: columnsCount }, () => []);
        filtered.forEach((s, i) => {
            cols[i % columnsCount].push(s);
        });
        return cols;
    }, [filtered, columnsCount]);

    const renderNode = (node: TreeNode, depth: number = 0): React.ReactNode => {
        const isExpanded = depth === 0 || expandedFolders[node.fullName] !== false;

        return (
            <div key={node.fullName} className={`flex flex-col ${isExpanded ? 'overflow-visible' : 'overflow-hidden'}`}>
                {node.name !== "Root" && (
                    <div
                        ref={el => { if (el) folderRefs.current.set(node.fullName, el); }}
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

                <div className={`grid ${animationsEnabled ? 'transition-all duration-150 ease-in-out' : ''} relative ${isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`} style={{ overflow: isExpanded ? 'visible' : 'hidden' }}>
                    <div className={`min-h-0 ${isExpanded ? 'overflow-visible' : 'overflow-hidden'}`}>
                        {node.name !== "Root" && (
                            <div
                                onClick={() => !isDragging && toggleFolder(node.fullName)}
                                className={`absolute left-[13px] top-0 bottom-4 w-5 -ml-2.5 z-20 ${animationsEnabled ? 'transition-all duration-150' : ''} rounded-full ${!draggedScriptPath ? 'cursor-pointer group/line hover:bg-white/[0.05]' : ''} ${isExpanded ? 'opacity-100' : 'opacity-0 pointer-events-auto'}`}
                            >
                                <div className={`absolute left-[9px] top-0 bottom-0 w-[1px] transition-colors shadow-2xl ${isDragging ? 'bg-white/5' : 'bg-white/10'}`}></div>
                            </div>
                        )}

                        <div className={`${node.name !== "Root" ? 'pl-5 ml-2.5 mb-0.5 mt-0.5' : ''} space-y-1.5 relative`}>
                            {Object.values(node.children).sort((a, b) => a.name.localeCompare(b.name)).map(child => renderNode(child, depth + 1))}
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
        );
    };

    if (loading) return <div className="p-10 text-center text-tertiary font-bold text-xs tracking-[0.5em] animate-pulse uppercase">Syncing Uplink...</div>;

    const hasContent = Object.keys(tree.children).length > 0 || tree.scripts.length > 0;

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className={`flex items-center justify-between pl-1 pr-8 pb-2 border-b transition-all duration-300 ${draggedScriptPath ? 'opacity-20 blur-[1px] pointer-events-none' : ''}`} style={{ borderColor: 'var(--border-color)' }}>
                <div className="flex items-center space-x-1">
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
                                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/20"
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

                    {viewMode === "tree" && <div className="h-4 w-[1px] bg-white/5 mx-2"></div>}
                    {viewMode === "tree" && (
                        <button
                            onClick={toggleAll}
                            className={`p-2 transition-all h-10 w-10 flex flex-col items-center justify-center border-none shadow-none bg-transparent focus:outline-none relative cursor-pointer ${!isDragging ? 'group/toggle' : 'opacity-10 cursor-default'} text-white/20 hover:text-indigo-400`}
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
                    )}

                    {/* SEARCH INPUT */}
                    <div className="flex-1 max-w-sm ml-4 relative group">
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
                            ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-400 shadow-[0_0_15px_rgba(79,70,229,0.2)]"
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
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-8 gap-y-1 pb-10 pr-6">
                            {filtered.length === 0 && <div className="text-tertiary col-span-2 text-center py-40 italic tracking-[0.3em] text-sm font-bold">Пустой раздел...</div>}
                            {filtered.map(s => {
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
                    ) : (
                        <div className="flex flex-col space-y-0.5 select-none pr-6">
                            {!hasContent ? (
                                <div className="text-tertiary text-center py-40 italic tracking-[0.3em] text-sm font-bold">Пустой раздел дерева...</div>
                            ) : renderNode(tree)}
                        </div>
                    )}
                </div>
            </SearchContext.Provider>
        </div >
    );
}
