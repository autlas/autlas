import React, { useState, useEffect, useRef, createContext, useContext, memo } from "react";
import { HighlightText } from "./HighlightText";
import ScriptRow from "./ScriptRow";
import { Script } from "../api";
import { TreeNode } from "../types/script";

export interface TreeContextValue {
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
    pendingScripts: Record<string, "run" | "kill" | "restart">;
    removingTags: Set<string>;
    allUniqueTags: string[];
    popoverRef: React.MutableRefObject<HTMLDivElement | null>;
    handleCustomMouseDown: (e: React.MouseEvent, script: Script) => void;
    handleToggle: (s: Script, forceStart?: boolean) => void;
    startEditing: (s: Script) => void;
    stopEditing: () => void;
    addTag: (script: Script, tag: string) => void;
    removeTag: (script: Script, tag: string) => void;
    folderDurations: Record<string, number>;
    showHidden: 'none' | 'all' | 'only';
    contextMenu: { x: number, y: number, type: string, data: any } | null;
    onShowUI: (s: Script) => void;
    onRestart: (s: Script) => void;
    focusedPath: string | null;
    setFocusedPath: (path: string | null) => void;
    isVimMode: boolean;
    setIsVimMode: (v: boolean) => void;
    onSelectScript?: (s: Script) => void;
}

export const TreeContext = createContext<TreeContextValue>(null as any);

export const TreeNodeRenderer = memo(function TreeNodeRenderer({
    node,
    depth,
    isExpanded,
}: {
    node: TreeNode;
    depth: number;
    isExpanded: boolean;
}) {
    const ctx = useContext(TreeContext);
    const { expandedFoldersRef, toggleFolder, setFolderExpansionRecursive,
        folderRefs, isDragging, draggedScriptPath,
        onFolderContextMenu, onScriptContextMenu,
        editingScript, pendingScripts, removingTags, allUniqueTags,
        popoverRef, handleCustomMouseDown, handleToggle,
        startEditing, stopEditing, addTag, removeTag, onShowUI,
        focusedPath, setFocusedPath, isVimMode } = ctx;

    const [childVisible, setChildVisible] = useState(isExpanded);
    const [gridExpanded, setGridExpanded] = useState(isExpanded);
    const skipFirstEffect = useRef(true);

    useEffect(() => {
        if (skipFirstEffect.current) { skipFirstEffect.current = false; return; }
        const animated = ctx.animationsEnabled;
        if (isExpanded) {
            setChildVisible(true);
            if (animated) {
                setGridExpanded(false);
                requestAnimationFrame(() => requestAnimationFrame(() => setGridExpanded(true)));
            } else {
                setGridExpanded(true);
            }
        } else {
            if (animated) {
                setGridExpanded(false);
                const t = setTimeout(() => setChildVisible(false), 230);
                return () => clearTimeout(t);
            } else {
                setGridExpanded(false);
                setChildVisible(false);
            }
        }
    }, [isExpanded]);

    return (
        <div className="flex flex-col">
            {node.name !== "Root" && (
                <div
                    ref={el => { if (el) folderRefs.current!.set(node.fullName, el); }}
                    onClick={() => !isDragging && toggleFolder(node.fullName)}
                    onMouseEnter={() => {
                        if (!isVimMode) setFocusedPath(node.fullName);
                    }}
                    onContextMenu={(e) => {
                        e.preventDefault();
                        onFolderContextMenu(e, {
                            ...node,
                            is_hidden: !!node.is_hidden,
                            onExpandAll: () => setFolderExpansionRecursive(node, true),
                            onCollapseAll: () => setFolderExpansionRecursive(node, false),
                        } as any);
                    }}
                    id={`folder-${node.fullName}`}
                    className={`flex items-center space-x-2 h-[38px] pl-[4px] rounded-lg z-10 relative mb-0.5 border border-transparent hover:z-[50] scroll-mt-[250px] scroll-mb-[250px]
                        ${focusedPath === node.fullName && isVimMode ? '!transition-none !bg-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.15)]' : 'transition-all duration-300'}
                        ${!draggedScriptPath ? (isVimMode ? 'bg-transparent cursor-pointer' : 'bg-transparent hover:bg-white/[0.05] cursor-pointer group') : 'bg-transparent text-tertiary cursor-default pointer-events-none'}
                        ${ctx.contextMenu?.type === 'folder' && ctx.contextMenu?.data?.fullName === node.fullName ? 'bg-white/5 border-white/10' : ''}
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
                    {focusedPath === node.fullName && isVimMode && (
                        <div className="absolute left-0 top-1 bottom-1 w-[3.5px] bg-indigo-500 rounded-full shadow-[0_0_15px_rgba(99,102,241,0.6)] z-20" />
                    )}
                    <div className="flex items-center overflow-hidden h-full">
                        {(() => {
                            const rawParts = node.name.split('|').map(p => p.trim());
                            const partFullNames: string[] = [];
                            let currentPath = node.fullName;
                            for (let i = rawParts.length - 1; i >= 0; i--) {
                                partFullNames[i] = currentPath;
                                const lastSlash = Math.max(currentPath.lastIndexOf('\\'), currentPath.lastIndexOf('/'));
                                if (lastSlash !== -1) {
                                    currentPath = currentPath.substring(0, lastSlash);
                                }
                            }

                            return rawParts.map((part, i) => {
                                const partFullName = partFullNames[i];
                                const isActive = ctx.contextMenu?.type === 'folder' && ctx.contextMenu?.data?.fullName === partFullName;
                                return (
                                    <React.Fragment key={part + i}>
                                        {i > 0 && <div className="w-[5px] h-[5px] rounded-full bg-white/10 mx-2 flex-shrink-0" />}
                                        <div
                                            className={`px-2 py-0.5 rounded-md transition-all duration-200
                                                ${!isDragging ? 'hover:bg-white/[0.08]' : ''}
                                                ${isActive ? 'bg-white/10' : ''}
                                            `}
                                            onContextMenu={(e) => {
                                                if (isDragging) return;
                                                e.preventDefault();
                                                e.stopPropagation();
                                                onFolderContextMenu(e, {
                                                    ...node,
                                                    name: part,
                                                    fullName: partFullName,
                                                    is_hidden: !!node.is_hidden,
                                                    onExpandAll: () => setFolderExpansionRecursive(node, true),
                                                    onCollapseAll: () => setFolderExpansionRecursive(node, false),
                                                } as any);
                                            }}
                                        >
                                            <span className={`text-base font-medium tracking-tight transition-colors truncate stabilize-text
                                                ${!isDragging ? (isActive ? 'text-indigo-400' : 'text-secondary/90 hover:text-white group-hover:text-primary') : 'text-tertiary'} `}>
                                                <HighlightText text={part} variant="path" />
                                            </span>
                                        </div>
                                    </React.Fragment>
                                );
                            });
                        })()}
                    </div>
                </div>
            )}

            {childVisible && (
                <div
                    style={{
                        display: 'grid',
                        gridTemplateRows: gridExpanded ? '1fr' : '0fr',
                        transition: ctx.animationsEnabled ? `grid-template-rows ${ctx.folderDurations[node.fullName] ? (ctx.folderDurations[node.fullName] / 1000) + 's' : '0.15s'} cubic-bezier(0.33, 1, 0.68, 1)` : 'none',
                    }}
                >
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
                                            isPending={!!pendingScripts[s.path]}
                                            pendingType={pendingScripts[s.path]}
                                            removingTagKeys={removingTagKeys}
                                            allUniqueTags={allUniqueTags}
                                            popoverRef={popoverRef}
                                            visibilityMode={ctx.showHidden}
                                            isContextMenuOpen={ctx.contextMenu?.type === 'script' && ctx.contextMenu?.data?.path === s.path}
                                            onMouseDown={handleCustomMouseDown}
                                            onDoubleClick={handleToggle}
                                            onToggle={handleToggle}
                                            onStartEditing={startEditing}
                                            onAddTag={addTag}
                                            onRemoveTag={removeTag}
                                            onCloseEditing={stopEditing}
                                            onScriptContextMenu={onScriptContextMenu}
                                            onShowUI={onShowUI}
                                            onRestart={ctx.onRestart}
                                            isFocused={focusedPath === s.path}
                                            setFocusedPath={ctx.setFocusedPath}
                                            isVimMode={ctx.isVimMode}
                                            setIsVimMode={ctx.setIsVimMode}
                                            onSelectScript={ctx.onSelectScript}
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
    if (prev.depth === 0) return false;
    if (prev.isExpanded !== next.isExpanded) return false;
    if (prev.node.fullName !== next.node.fullName) return false;
    if (prev.node.scripts.length !== next.node.scripts.length) return false;
    const prevChildKeys = Object.keys(prev.node.children);
    const nextChildKeys = Object.keys(next.node.children);
    if (prevChildKeys.length !== nextChildKeys.length) return false;
    for (let i = 0; i < prev.node.scripts.length; i++) {
        const ps = prev.node.scripts[i];
        const ns = next.node.scripts[i];
        if (ps.path !== ns.path || ps.is_running !== ns.is_running || ps.tags.join(',') !== ns.tags.join(',')) return false;
    }
    return true;
});
