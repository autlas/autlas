import React from "react";
import { ScriptTreeProps, TreeNode } from "../types/script";
import { useScriptTree } from "../hooks/useScriptTree";
import ScriptRow from "./ScriptRow";
import HubScriptCard from "./HubScriptCard";

export default function ScriptTree({ filterTag, onTagsLoaded, viewMode, onCustomDragStart, isDragging, draggedScriptPath, animationsEnabled, onScriptContextMenu }: ScriptTreeProps) {
    const {
        loading, filtered, tree,
        expandedFolders,
        editingScript, pendingScripts, removingTags,
        treeFilter, showHidden, allUniqueTags,
        popoverRef, folderRefs,
        setTreeFilter, setShowHidden,
        toggleFolder, toggleAll,
        handleToggle, startEditing, stopEditing,
        addTag, removeTag, handleCustomMouseDown,
    } = useScriptTree({ filterTag, onTagsLoaded, viewMode, onCustomDragStart });

    const renderNode = (node: TreeNode, depth: number = 0): React.ReactNode => {
        const isExpanded = depth === 0 || expandedFolders[node.fullName] !== false;

        return (
            <div key={node.fullName} className={`flex flex-col ${isExpanded ? 'overflow-visible' : 'overflow-hidden'}`}>
                {node.name !== "Root" && (
                    <div
                        ref={el => { if (el) folderRefs.current.set(node.fullName, el); }}
                        onClick={() => !isDragging && toggleFolder(node.fullName)}
                        className={`flex items-center space-x-2 h-[38px] rounded-lg z-10 relative transition-all duration-300 mb-0.5 border border-transparent hover:z-[50]
                            ${!draggedScriptPath ? 'bg-white/[0.015] hover:bg-white/[0.05] cursor-pointer group' : 'bg-transparent text-tertiary cursor-default pointer-events-none'}
                        `}
                    >
                        <div className={`w-4 h-4 flex items-center justify-center transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`}>
                            <svg width="6" height="6" viewBox="0 0 6 6" className={`transition-colors ${isExpanded && !isDragging ? 'fill-white/20' : 'fill-white/5'} ${!isDragging && 'group-hover:fill-white'}`}><path d="M0 0L6 3L0 6V0Z" /></svg>
                        </div>
                        <span className={`text-sm font-bold transition-colors ${isExpanded && !isDragging ? 'text-primary' : 'text-tertiary'} ${!isDragging && 'group-hover:text-primary'}`}>{node.name}</span>
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
                                const removingTagKeys = Array.from(removingTags).filter(k => k.startsWith(s.path + '-'));
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
    const anyExpanded = Object.values(expandedFolders).some(val => val);

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {viewMode === "tree" && (
                <div className={`flex items-center justify-between pl-1 mb-4 pb-2 border-b transition-all duration-300 ${draggedScriptPath ? 'opacity-20 blur-[1px] pointer-events-none' : ''}`} style={{ borderColor: 'var(--border-color)' }}>
                    <div className="flex items-center space-x-1">
                        <button
                            onClick={toggleAll}
                            className={`p-2 transition-all h-10 w-10 flex flex-col items-center justify-center border-none shadow-none bg-transparent focus:outline-none relative cursor-pointer ${!isDragging ? 'group/toggle' : 'opacity-10 cursor-default'}`}
                            title="Свернуть/Развернуть все"
                        >
                            <div className="flex flex-col items-center space-y-[3px]">
                                <svg width="14" height="6" viewBox="0 0 24 10" fill="none"
                                    className={`transition-all duration-300 ease-in-out stroke-white/20 ${!isDragging && 'group-hover/toggle:stroke-indigo-400'} ${anyExpanded ? 'rotate-180' : ''}`}
                                    strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M5 8l7-7 7 7" />
                                </svg>
                                <svg width="14" height="6" viewBox="0 0 24 10" fill="none"
                                    className={`transition-all duration-300 ease-in-out stroke-white/20 ${!isDragging && 'group-hover/toggle:stroke-indigo-400'} ${anyExpanded ? 'rotate-180' : ''}`}
                                    strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M5 2l7 7 7-7" />
                                </svg>
                            </div>
                        </button>

                        <div className="h-4 w-[1px] bg-white/5 mx-2"></div>

                        {/* Segmented Filter Control */}
                        <div className="flex bg-white/[0.03] p-1 rounded-xl border border-white/5">
                            {[
                                { id: "all", label: "Все" },
                                { id: "tagged", label: "С тегами" },
                                { id: "untagged", label: "Без" }
                            ].map((f) => (
                                <button
                                    key={f.id}
                                    onClick={() => !isDragging && setTreeFilter(f.id as any)}
                                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${treeFilter === f.id
                                        ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/20"
                                        : "text-tertiary hover:text-secondary"
                                        } ${isDragging ? 'opacity-20 pointer-events-none' : ''}`}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Hidden Toggle (Eye) */}
                    <button
                        onClick={() => !isDragging && setShowHidden(!showHidden)}
                        className={`p-2.5 rounded-xl transition-all cursor-pointer border ${showHidden
                            ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-400 shadow-[0_0_15px_rgba(79,70,229,0.2)]"
                            : "bg-white/[0.03] border-white/5 text-tertiary hover:text-secondary hover:bg-white/[0.05]"
                            } ${isDragging ? 'opacity-10 pointer-events-none' : ''}`}
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
            )}

            <div className={`flex-1 overflow-y-auto custom-scrollbar pr-2 mt-2 transition-all duration-300 ${draggedScriptPath ? 'opacity-30 blur-[1px]' : ''}`}>
                {viewMode === "hub" ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                        {filtered.length === 0 && <div className="text-tertiary col-span-3 text-center py-40 italic tracking-[0.3em] text-sm font-bold">Пустой канал...</div>}
                        {filtered.map(s => (
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
                ) : (
                    <div className="flex flex-col space-y-0.5 select-none">
                        {!hasContent ? (
                            <div className="text-tertiary text-center py-40 italic tracking-[0.3em] text-sm font-bold">Пустой раздел дерева...</div>
                        ) : renderNode(tree)}
                    </div>
                )}
            </div>
        </div>
    );
}
