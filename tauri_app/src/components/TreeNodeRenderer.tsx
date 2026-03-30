import React, { useState, useEffect, useRef, createContext, memo } from "react";
import { useTreeStore } from "../store/useTreeStore";
import { HighlightText } from "./HighlightText";
import ScriptRow from "./ScriptRow";
import { Script } from "../api";
import { TreeNode } from "../types/script";

// Stable context: only callbacks and refs — never changes after mount, no re-renders
export interface TreeContextValue {
    toggleFolder: (path: string) => void;
    setFolderExpansionRecursive: (node: TreeNode, expanded: boolean) => void;
    folderRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
    animationsEnabled: boolean;
    allUniqueTags: string[];
    popoverRef: React.MutableRefObject<HTMLDivElement | null>;
    onFolderContextMenu: (e: React.MouseEvent, data: any) => void;
    onScriptContextMenu: (e: React.MouseEvent, s: Script) => void;
    handleCustomMouseDown: (e: React.MouseEvent, script: Script) => void;
    handleToggle: (s: Script, forceStart?: boolean) => void;
    startEditing: (s: Script) => void;
    stopEditing: () => void;
    addTag: (script: Script, tag: string) => void;
    removeTag: (script: Script, tag: string) => void;
    onShowUI: (s: Script) => void;
    onRestart: (s: Script) => void;
    onSelectScript?: (s: Script) => void;
}

export const TreeContext = createContext<TreeContextValue>(null as any);

// Module-level ref for callbacks — avoids useContext which bypasses React.memo
let _treeCallbacks: TreeContextValue | null = null;
export function setTreeCallbacks(cb: TreeContextValue) { _treeCallbacks = cb; }

export const TreeNodeRenderer = memo(function TreeNodeRenderer({
    node,
    depth,
}: {
    node: TreeNode;
    depth: number;
}) {
    // Subscribe to isExpanded via local state (triggers re-render only when expand state changes)
    const [isExpanded, setIsExpanded] = useState(() =>
        node.name === "Root" || useTreeStore.getState().expandedFolders[node.fullName] !== false
    );
    // Focus highlight via DOM manipulation — no React re-render needed
    const folderRowRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (node.name === "Root") return;
        let prevExpanded = useTreeStore.getState().expandedFolders[node.fullName] !== false;
        let prevFocused = useTreeStore.getState().focusedPath === node.fullName;
        // Apply initial focus class
        if (prevFocused && useTreeStore.getState().isVimMode && folderRowRef.current) folderRowRef.current.classList.add("vim-focus-folder");
        return useTreeStore.subscribe((state) => {
            const expanded = state.expandedFolders[node.fullName] !== false;
            if (expanded !== prevExpanded) { prevExpanded = expanded; setIsExpanded(expanded); }
            const focused = state.focusedPath === node.fullName && state.isVimMode;
            if (focused !== prevFocused) {
                prevFocused = focused;
                if (folderRowRef.current) {
                    if (focused) folderRowRef.current.classList.add("vim-focus-folder");
                    else folderRowRef.current.classList.remove("vim-focus-folder");
                }
            }
        });
    }, [node.fullName]);
    const isFolderFocused = false; // never causes re-render, CSS class handles it

    console.log(`[Tree] ${performance.now().toFixed(1)}ms render: ${node.name} (depth=${depth}, exp=${isExpanded}, focus=${isFolderFocused})`);

    // Everything else: read on demand, no subscription
    const st = useTreeStore.getState();
    const isDragging = st.isDragging;
    const draggedScriptPath = st.draggedScriptPath;
    const editingScript = st.editingScript;
    const pendingScripts = st.pendingScripts;
    const removingTags = st.removingTags;
    const showHidden = st.showHidden;
    const contextMenu = st.contextMenu;
    const isVimMode = st.isVimMode;
    const folderDurations = st.folderDurations;

    const ctx = _treeCallbacks!;
    const { toggleFolder, setFolderExpansionRecursive,
        folderRefs, allUniqueTags,
        onFolderContextMenu, onScriptContextMenu,
        popoverRef, handleCustomMouseDown, handleToggle,
        startEditing, stopEditing, addTag, removeTag, onShowUI } = ctx;



    const [everExpanded, setEverExpanded] = useState(isExpanded);
    const [gridExpanded, setGridExpanded] = useState(isExpanded);
    const [animatingOut, setAnimatingOut] = useState(false);
    const skipFirstEffect = useRef(true);

    // Track if this folder was ever opened — once mounted, keep in DOM forever
    useEffect(() => {
        if (isExpanded && !everExpanded) setEverExpanded(true);
    }, [isExpanded, everExpanded]);

    useEffect(() => {
        if (skipFirstEffect.current) { skipFirstEffect.current = false; return; }
        const animated = ctx.animationsEnabled;
        if (isExpanded) {
            setAnimatingOut(false);
            if (animated) {
                setGridExpanded(false);
                requestAnimationFrame(() => requestAnimationFrame(() => setGridExpanded(true)));
            } else {
                setGridExpanded(true);
            }
        } else {
            if (animated) {
                setAnimatingOut(true);
                // Delay gridExpanded=false so grid is visible (display:grid) before transition starts
                requestAnimationFrame(() => requestAnimationFrame(() => setGridExpanded(false)));
                const t = setTimeout(() => setAnimatingOut(false), 300);
                return () => clearTimeout(t);
            } else {
                setGridExpanded(false);
            }
        }
    }, [isExpanded]);

    return (
        <div className="flex flex-col">
            {node.name !== "Root" && (
                <div
                    ref={el => { if (el) { folderRefs.current!.set(node.fullName, el); (folderRowRef as any).current = el; } }}
                    onClick={() => { if (!isDragging) toggleFolder(node.fullName); }}
                    onMouseEnter={() => {
                        if (!isVimMode) useTreeStore.getState().setFocusedPath(node.fullName);
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
                        ${isFolderFocused && isVimMode ? '!transition-none !bg-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.15)]' : 'transition-all duration-300'}
                        ${!draggedScriptPath ? (isVimMode ? 'bg-transparent cursor-pointer' : 'bg-transparent hover:bg-white/[0.05] cursor-pointer group') : 'bg-transparent text-tertiary cursor-default pointer-events-none'}
                        ${contextMenu?.type === 'folder' && contextMenu?.data?.fullName === node.fullName ? 'bg-white/5 border-white/10' : ''}
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
                    <div className="vim-focus-indicator absolute left-0 top-1 bottom-1 w-[3.5px] bg-indigo-500 rounded-full shadow-[0_0_15px_rgba(99,102,241,0.6)] z-20 hidden" />
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
                                const isActive = contextMenu?.type === 'folder' && contextMenu?.data?.fullName === partFullName;
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

            {everExpanded && (
                <div
                    style={{
                        display: (!isExpanded && !animatingOut) ? 'none' : 'grid',
                        gridTemplateRows: gridExpanded ? '1fr' : '0fr',
                        transition: ctx.animationsEnabled ? `grid-template-rows ${folderDurations[node.fullName] ? (folderDurations[node.fullName] / 1000) + 's' : '0.15s'} cubic-bezier(0.33, 1, 0.68, 1)` : 'none',
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
                                            onRestart={ctx.onRestart}
                                            onSelectScript={ctx.onSelectScript}
                                            setFocusedPath={useTreeStore.getState().setFocusedPath}
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
    // Same node reference = nothing changed, skip render
    if (prev.node === next.node && prev.depth === next.depth) return true;
    // Different node reference = tree was rebuilt, must re-render
    return false;
});
