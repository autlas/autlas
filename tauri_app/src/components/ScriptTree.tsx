import React, { useState, useEffect, useRef, useMemo, createContext, useContext, memo } from "react";
import { createPortal } from "react-dom";
import { HighlightText } from "./HighlightText";
import { SearchContext } from "../context/SearchContext";
import { ScriptTreeProps, TreeNode } from "../types/script";
import { useScriptTree } from "../hooks/useScriptTree";
import { useTranslation } from "react-i18next";
import ScriptRow from "./ScriptRow";
import HubScriptCard from "./HubScriptCard";
import { Script } from "../api";
import { useHotkeys } from "react-hotkeys-hook";

// ─── PERF LOGGING ──────────────────────────────────────────────
const PERF = false;

// ───────────────────────────────────────────────────────────────

interface TreeContextValue {
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
}
const TreeContext = createContext<TreeContextValue>(null as any);

const TagSectionHeader = ({ tag }: { tag: string }) => (
    <div className="flex items-center mb-4 mt-12 first:mt-2 px-2 sticky top-0 z-40 py-4">
        <span className="text-[22px] font-black uppercase tracking-[0.15em] text-white/30 flex items-center leading-none">
            {tag}
        </span>
    </div>
);

const ShortcutItem = ({ keys, desc, sets }: { keys?: string[], desc: string, sets?: string[][] }) => (
    <div className="flex items-center justify-between group/item min-h-[40px]">
        <span className="text-secondary/80 text-sm group-hover/item:text-white transition-colors">{desc}</span>
        <div className="flex gap-3 ml-4 items-center">
            {sets ? (
                sets.map((set, i) => (
                    <React.Fragment key={i}>
                        {i > 0 && <span className="text-[10px] text-white/30 font-black uppercase tracking-widest">or</span>}
                        <div className="flex gap-1.5">
                            {set.map((k, ki) => (
                                <kbd key={k + ki} className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[12px] font-bold text-white/50 shadow-sm min-w-[28px] text-center group-hover/item:text-indigo-400 group-hover/item:border-indigo-500/30 transition-all">
                                    {k}
                                </kbd>
                            ))}
                        </div>
                    </React.Fragment>
                ))
            ) : (
                <div className="flex gap-1.5">
                    {keys?.map((k, ki) => (
                        <kbd key={k + ki} className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[12px] font-bold text-white/50 shadow-sm min-w-[28px] text-center group-hover/item:text-indigo-400 group-hover/item:border-indigo-500/30 transition-all">
                            {k}
                        </kbd>
                    ))}
                </div>
            )}
        </div>
    </div>
);

const CheatSheet = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
    if (!isOpen) return null;
    return createPortal(
        <div
            className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300"
            onClick={onClose}
        >
            <div
                className="bg-[#0a0a0c] border border-white/10 p-10 rounded-[40px] shadow-2xl max-w-4xl w-full mx-4 relative overflow-hidden group"
                onClick={e => e.stopPropagation()}
            >
                {/* Decorative glow */}
                <div className="absolute -top-24 -left-24 w-48 h-48 bg-indigo-500/20 rounded-full blur-[80px] pointer-events-none" />
                <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-purple-500/20 rounded-full blur-[80px] pointer-events-none" />

                <h2 className="text-3xl font-black mb-8 text-white tracking-tight flex items-center">
                    <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center mr-4 text-white shadow-[0_0_20px_rgba(79,70,229,0.4)]">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                    </div>
                    AHK Manager Shortcuts
                </h2>

                <div className="grid grid-cols-2 gap-x-12 gap-y-10">
                    <div className="space-y-4">
                        <h3 className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] mb-6 flex items-center">
                            <span className="w-4 h-[2px] bg-indigo-500/30 mr-2" />
                            Navigation
                        </h3>
                        <ShortcutItem keys={['h', 'j', 'k', 'l']} desc="Navigate (HJKL)" />
                        <ShortcutItem sets={[['g', 'g'], ['G']]} desc="Scroll Top / Bottom" />
                        <ShortcutItem sets={[['Enter'], ['Space']]} desc="Run / Stop Script" />
                        <ShortcutItem keys={['Esc']} desc="Clear Focus / Close" />
                    </div>

                    <div className="flex flex-col gap-4">
                        <h3 className="text-[12px] font-black uppercase tracking-[0.2em] text-indigo-400 flex items-center mb-2">
                            <span className="w-4 h-[2px] bg-indigo-500/30 mr-2" />
                            View & Search
                        </h3>
                        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                            <ShortcutItem keys={['i']} desc="Focus Search" />
                            <ShortcutItem keys={['/']} desc="Global Search" />
                            <ShortcutItem keys={['q', 'w', 'e']} desc="Tree / Tiles / List" />
                            <ShortcutItem keys={['s']} desc="Toggle Sort (N/P)" />
                            <ShortcutItem keys={['?']} desc="Show Help" />
                        </div>
                    </div>
                </div>

                <div className="mt-12 pt-8 border-t border-white/5 flex justify-between items-center">
                    <p className="text-white/30 text-xs font-medium italic">Holding navigation keys scales scroll speed.</p>
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 rounded-2xl bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 text-xs font-black tracking-widest uppercase transition-all border border-indigo-500/20 active:scale-95"
                    >
                        Got it
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

const TreeNodeRenderer = memo(function TreeNodeRenderer({
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
        focusedPath, setFocusedPath, isVimMode, setIsVimMode } = ctx;

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
                        setFocusedPath(node.fullName);
                        setIsVimMode(false);
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
                        ${!draggedScriptPath ? (focusedPath === node.fullName && isVimMode ? '' : 'bg-transparent hover:bg-white/[0.05] cursor-pointer group') : 'bg-transparent text-tertiary cursor-default pointer-events-none'}
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
                            // Calculate full names for each part back to front
                            const partFullNames: string[] = [];
                            let currentPath = node.fullName;
                            for (let i = rawParts.length - 1; i >= 0; i--) {
                                partFullNames[i] = currentPath;
                                // Find parent directory separator (either \ or /)
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
                                                    is_hidden: !!node.is_hidden, // Note: hidden state might be different for parents, but our recursive state is on the node
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
                                            onDoubleClick={(s) => handleToggle(s, true)}
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
export default function ScriptTree({ filterTag, onTagsLoaded, onLoadingChange, onRunningCountChange, viewMode, onViewModeChange, onCustomDragStart, isDragging, draggedScriptPath, animationsEnabled, onScriptContextMenu, onFolderContextMenu, searchQuery, setSearchQuery, contextMenu, onShowUI, manualRefresh, onScanComplete, isPathsEmpty, onAddPath, onRefresh }: ScriptTreeProps) {
    const { t } = useTranslation();
    const searchInputRef = useRef<HTMLInputElement>(null);
    const lastGTimeRef = useRef(0);
    const lastFTimeRef = useRef(0);
    const isInstantScrollRef = useRef(false);
    const [sortBy, setSortBy] = useState<"name" | "path">("name");
    const renderStartRef = useRef(0);
    if (PERF) {
        renderStartRef.current = performance.now();
    }

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
            // Check for '?' character (logical) OR physical key combo Shift+/ (layout-independent)
            // Also handle Shift+7 which is '?' on Russian layout
            const isQuestionMark = e.key === '?' || (e.key === ',' && e.shiftKey && e.code === 'Slash') || (e.key === '7' && e.shiftKey);

            if (isQuestionMark) {
                // If not in search input, toggle cheatsheet
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
            // gg - Scroll to top
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

    // --- MODE & SORT HOTKEYS ---
    useHotkeys('q', () => onViewModeChange('tree'));
    useHotkeys('w', () => onViewModeChange('tiles'));
    useHotkeys('e', () => onViewModeChange('list'));
    useHotkeys('s', () => setSortBy(prev => prev === 'name' ? 'path' : 'name'));

    useHotkeys('i', (e) => {
        // First priority: If focusing a running script with UI, open UI
        if (focusedPath) {
            const item = visibleItems.find(it => it.path === focusedPath);
            if (item && item.type === 'script' && item.data.is_running && item.data.has_ui) {
                onShowUI(item.data);
                return;
            }
        }

        // Second priority: Existing search logic
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

            // If navigating rapidly (held key) OR specifically requested (gg/G), use instant 'auto' behavior
            const behavior = isInstantScrollRef.current || (diff < 80 && diff > 0) ? 'auto' : 'smooth';
            isInstantScrollRef.current = false;

            el.scrollIntoView({ behavior, block: 'nearest' });
        }
    }, [focusedPath]);

    useEffect(() => {
        if (onLoadingChange) {
            onLoadingChange(loading);
        }
    }, [loading, onLoadingChange]);

    const [columnsCount, setColumnsCount] = useState(1);
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollPositions = useRef<Record<string, number>>({});
    const prevKeyRef = useRef<string>("");

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
            const w = container.getBoundingClientRect().width;
            updateColumns(w);
        });
        resizeObserver.observe(container);

        const handleResize = () => {
            const w = container.getBoundingClientRect().width;
            updateColumns(w);
        };
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
        const savedPos = scrollPositions.current[currentKey] || 0;
        container.scrollTop = savedPos;
        prevKeyRef.current = currentKey;
    }, [filterTag, viewMode, loading]);

    useEffect(() => {
        if (searchQuery && containerRef.current) {
            containerRef.current.scrollTop = 0;
        }
    }, [searchQuery]);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const container = e.currentTarget;
        const currentKey = `${filterTag}-${viewMode}`;
        scrollPositions.current[currentKey] = container.scrollTop;
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
        const cols: Script[][] = Array.from({ length: columnsCount }, () => [] as Script[]);
        filtered.forEach((s, i) => {
            cols[i % columnsCount].push(s);
        });
        return cols;
    }, [filtered, columnsCount]);

    if (loading) return <div className="p-10 text-center text-tertiary font-bold text-xs tracking-[0.5em] animate-pulse uppercase">Syncing Uplink...</div>;

    const hasContent = Object.keys(tree.children).length > 0 || tree.scripts.length > 0;

    const EmptyPlaceholder = () => {
        const isSearching = !!searchQuery.trim();
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center min-h-[400px]">
                {isPathsEmpty ? (
                    <div className="max-w-[400px] space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
                        <div className="w-24 h-24 rounded-[32px] bg-white/5 border border-white/10 flex items-center justify-center mx-auto shadow-2xl relative overflow-hidden group/folder">
                            <div className="absolute inset-0 bg-indigo-500/10 opacity-0 group-hover/folder:opacity-100 transition-opacity" />
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-tertiary relative z-10">
                                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                            </svg>
                        </div>
                        <div className="space-y-3">
                            <h3 className="text-2xl font-black text-white tracking-tight leading-none">{t("hub.no_folders_title", "Library is Empty")}</h3>
                            <p className="text-[13px] text-tertiary/80 leading-relaxed font-medium px-4">
                                {t("hub.no_folders_desc", "Configure scan directories in settings to see your scripts here. You can add multiple folders to track all your AHK utilities.")}
                            </p>
                        </div>
                        <button
                            onClick={onAddPath}
                            className="h-14 px-8 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-[11px] font-black tracking-[0.2em] uppercase transition-all shadow-xl shadow-indigo-600/20 active:scale-95 border-none cursor-pointer flex items-center justify-center gap-3 mx-auto"
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="12" y1="5" x2="12" y2="19" />
                                <line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                            {t("settings.add_path")}
                        </button>
                    </div>
                ) : !hasContent ? (
                    <div className="max-w-[400px] space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                        <div className="w-24 h-24 rounded-[32px] bg-white/5 border border-white/10 flex items-center justify-center mx-auto shadow-2xl relative overflow-hidden group/ghost">
                            <div className="absolute inset-0 bg-white/5 opacity-0 group-hover/ghost:opacity-100 transition-opacity" />
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-tertiary relative z-10">
                                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                                <circle cx="12" cy="12" r="3" />
                                <line x1="12" y1="18" x2="12" y2="18.01" />
                            </svg>
                        </div>
                        <div className="space-y-3">
                            <h3 className="text-2xl font-black text-white tracking-tight leading-none">{t("hub.no_scripts_title", "No Scripts Detected")}</h3>
                            <p className="text-[13px] text-tertiary/80 leading-relaxed font-medium px-4">
                                {t("hub.no_scripts_desc", "The selected folders don't contain any .ahk files. Try adding scripts or checking your paths.")}
                            </p>
                        </div>
                        <div className="flex gap-4 justify-center">
                            <button
                                onClick={onRefresh}
                                className="h-12 px-6 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded-xl text-[10px] font-black tracking-widest uppercase transition-all border border-white/5 active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M23 4v6h-6" />
                                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                                </svg>
                                {t("settings.manual_scan", "Refresh Scan")}
                            </button>
                            <button
                                onClick={() => onViewModeChange("settings" as any)}
                                className="h-12 px-6 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded-xl text-[10px] font-black tracking-widest uppercase transition-all border border-white/5 active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="3" />
                                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                                </svg>
                                {t("sidebar.settings")}
                            </button>
                        </div>
                    </div>
                ) : isSearching ? (
                    <div className="max-w-[400px] space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <div className="text-secondary/20">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="11" cy="11" r="8" />
                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-xl font-bold text-white tracking-tight">{t("hub.not_found_title", "Nothing Found")}</h3>
                            <p className="text-xs text-tertiary/60 leading-relaxed font-medium">
                                {t("hub.not_found_desc", "No scripts match your search.")}
                            </p>
                        </div>
                        <button
                            onClick={() => setSearchQuery("")}
                            className="bg-white/5 hover:bg-white/10 text-white/50 hover:text-white px-5 py-2 rounded-xl text-[10px] font-black tracking-widest uppercase transition-all border border-white/5 cursor-pointer"
                        >
                            {t("search.clear_all", "Reset Filters")}
                        </button>
                    </div>
                ) : (
                    <span className="text-tertiary/20 font-black tracking-[0.2em] uppercase text-sm animate-pulse">
                        {t(filterTag === "all" ? "hub.empty_tree" : "hub.empty_channel")}
                    </span>
                )}
            </div>
        );
    };

    const lowerSearch = searchQuery.toLowerCase();
    const prefixMatch = lowerSearch.startsWith("path:") ? "path:" :
        lowerSearch.startsWith("file:") ? "file:" : null;
    const displayValue = prefixMatch ? searchQuery.substring(prefixMatch.length) : searchQuery;

    return (
        <div className="flex flex-col h-full min-h-0">
            <div className={`flex items-center justify-between pt-6 pb-2 border-b transition-all duration-300 ${draggedScriptPath ? 'opacity-20 blur-[1px] pointer-events-none' : ''}`} style={{ borderColor: 'var(--border-color)' }}>
                <div className="flex-1 flex items-center space-x-1">
                    <div className="flex bg-white/[0.03] p-1 rounded-xl border border-white/5 h-[42px] items-center">
                        {[
                            {
                                id: "tree",
                                icon: (isCurrent: boolean) => (
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-opacity duration-200 ${isCurrent ? 'opacity-100' : 'opacity-25'}`}>
                                        <circle cx="6" cy="6" r="2" />
                                        <path d="M6 8v12h8M6 13h8" />
                                        <circle cx="16" cy="13" r="2" />
                                        <circle cx="16" cy="20" r="2" />
                                    </svg>
                                )
                            },
                            {
                                id: "tiles",
                                icon: (isCurrent: boolean) => (
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-opacity duration-200 ${isCurrent ? 'opacity-100' : 'opacity-25'}`}>
                                        <rect x="3" y="3" width="7" height="7" rx="1" ry="1" />
                                        <rect x="14" y="3" width="7" height="7" rx="1" ry="1" />
                                        <rect x="14" y="14" width="7" height="7" rx="1" ry="1" />
                                        <rect x="3" y="14" width="7" height="7" rx="1" ry="1" />
                                    </svg>
                                )
                            },
                            {
                                id: "list",
                                icon: (isCurrent: boolean) => (
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-opacity duration-200 ${isCurrent ? 'opacity-100' : 'opacity-25'}`}>
                                        <line x1="3" y1="6" x2="10" y2="6" /><line x1="3" y1="12" x2="10" y2="12" /><line x1="3" y1="18" x2="10" y2="18" />
                                        <line x1="14" y1="6" x2="21" y2="6" /><line x1="14" y1="12" x2="21" y2="12" /><line x1="14" y1="18" x2="21" y2="18" />
                                    </svg>
                                )
                            }
                        ].map((m) => {
                            const isCurrent = viewMode === m.id;
                            return (
                                <button
                                    key={m.id}
                                    onClick={() => !isDragging && onViewModeChange(m.id as any)}
                                    className={`px-4 h-full rounded-lg transition-all cursor-pointer flex items-center justify-center 
                                        ${isCurrent ? "bg-white/10 shadow-lg shadow-white/5" : "hover:bg-white/5"} 
                                        ${isDragging ? 'opacity-20 pointer-events-none' : ''}`}
                                    title={t("search.mode", { mode: m.id })}
                                >
                                    {m.icon(isCurrent)}
                                </button>
                            );
                        })}
                    </div>

                    {/* SORTING CONTROLS */}
                    <div className={`flex items-center overflow-hidden transition-all duration-300 ease-in-out ${viewMode !== "tree" ? 'w-[145px] opacity-100 ml-4' : 'w-0 opacity-0 pointer-events-none'}`}>
                        <div className="flex bg-white/[0.03] border border-white/5 rounded-xl p-1 gap-1 h-[42px] flex-shrink-0 w-[145px]">
                            <button
                                onClick={() => !isDragging && setSortBy("name")}
                                className={`flex-1 h-full rounded-lg text-[10px] font-black tracking-widest uppercase transition-all flex items-center justify-center cursor-pointer
                                    ${sortBy === "name"
                                        ? "bg-white/10 text-white shadow-lg shadow-white/5"
                                        : "text-tertiary hover:text-white hover:bg-white/5"}
                                    ${isDragging ? 'opacity-20 pointer-events-none' : ''}`}
                            >
                                Name
                            </button>
                            <button
                                onClick={() => !isDragging && setSortBy("path")}
                                className={`flex-1 h-full rounded-lg text-[10px] font-black tracking-widest uppercase transition-all flex items-center justify-center cursor-pointer
                                    ${sortBy === "path"
                                        ? "bg-white/10 text-white shadow-lg shadow-white/5"
                                        : "text-tertiary hover:text-white hover:bg-white/5"}
                                    ${isDragging ? 'opacity-20 pointer-events-none' : ''}`}
                            >
                                Path
                            </button>
                        </div>
                    </div>

                    <div className={`flex items-center overflow-hidden transition-all duration-[150ms] ease-in-out ${viewMode === "tree" ? 'w-[52px] opacity-100' : 'w-0 opacity-0 pointer-events-none'}`}>
                        <div className="h-4 w-[1px] bg-white/5 mx-2 flex-shrink-0"></div>
                        <button
                            onClick={toggleAll}
                            className={`p-2 transition-all h-10 w-10 flex flex-shrink-0 flex-col items-center justify-center border-none shadow-none bg-transparent focus:outline-none relative cursor-pointer ${!isDragging ? 'group/toggle' : 'opacity-10 cursor-default'} text-white/20 hover:text-indigo-400`}
                            title={t(isAllExpanded ? "context.collapse_all" : "context.expand_all")}
                        >
                            <div className="flex flex-col items-center space-y-[3px]">
                                <svg width="14" height="6" viewBox="0 0 24 10" fill="none" className={`transition-all duration-300 ease-in-out stroke-current ${isAllExpanded ? 'rotate-180' : ''}`} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 8l7-7 7 7" /></svg>
                                <svg width="14" height="6" viewBox="0 0 24 10" fill="none" className={`transition-all duration-300 ease-in-out stroke-current ${isAllExpanded ? 'rotate-180' : ''}`} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 2l7 7 7-7" /></svg>
                            </div>
                        </button>
                    </div>

                    <div className={`flex-1 ml-4 mr-4 relative group flex items-center bg-white/[0.03] border border-white/5 rounded-xl h-[41px] mb-[1px] transition-all focus-within:border-indigo-500/50 focus-within:bg-white/[0.05]`}>
                        <div className="pl-3 text-tertiary group-focus-within:text-indigo-400 transition-colors pointer-events-none">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="11" cy="11" r="8"></circle>
                                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                            </svg>
                        </div>

                        {prefixMatch && (
                            <div className="ml-2 bg-white/10 text-white/50 px-2 py-0.5 rounded-lg text-[12px] font-bold uppercase tracking-widest border border-white/10 pointer-events-none flex-shrink-0">
                                {prefixMatch.replace(':', '')}
                            </div>
                        )}

                        <input
                            ref={searchInputRef}
                            type="text"
                            value={displayValue}
                            onChange={(e) => {
                                const val = e.target.value;
                                setSearchQuery(prefixMatch ? prefixMatch + val : val);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Escape') {
                                    searchInputRef.current?.blur();
                                } else if (e.key === 'Backspace' && prefixMatch && displayValue === "") {
                                    setSearchQuery("");
                                } else if (e.key === 'Tab') {
                                    const q = searchQuery.toLowerCase();
                                    if (q === 'p') {
                                        e.preventDefault();
                                        setSearchQuery('path:');
                                    } else if (q === 'f') {
                                        e.preventDefault();
                                        setSearchQuery('file:');
                                    }
                                }
                            }}
                            placeholder={prefixMatch ? "" : t("search.placeholder")}
                            className={`flex-1 bg-transparent border-none outline-none h-full pr-10 text-[14px] font-normal text-white placeholder:text-tertiary/50 ${prefixMatch ? 'ml-[10px]' : 'ml-2'}`}
                        />

                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery("")}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 hover:bg-white/10 rounded-lg text-tertiary hover:text-white transition-all flex items-center justify-center cursor-pointer z-10"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        )}
                    </div>
                </div>

                {filterTag !== "hub" && (
                    <div className="flex items-center space-x-3">
                        <button
                            onClick={() => {
                                if (isDragging) return;
                                if (showHidden === 'none') setShowHidden('all');
                                else if (showHidden === 'all') setShowHidden('only');
                                else setShowHidden('none');
                            }}
                            className={`h-[42px] w-[42px] flex items-center justify-center rounded-xl transition-all cursor-pointer border 
                                ${showHidden === 'none' ? "bg-white/[0.03] border-white/5 text-tertiary hover:text-secondary hover:bg-white/[0.05]" :
                                    showHidden === 'all' ? "bg-white/10 border-white/20 text-white shadow-lg" :
                                        "bg-white/10 border-white/20 text-indigo-400 shadow-lg"} 
                                ${isDragging ? 'opacity-20 pointer-events-none' : ''}`}
                            title={showHidden === 'none' ? t("context.show_hidden") : showHidden === 'all' ? t("context.hide_hidden") : t("context.show_only_hidden", "Show Only Hidden")}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                {showHidden === 'none' ? (
                                    <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></>
                                ) : showHidden === 'all' ? (
                                    <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>
                                ) : (
                                    <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" fill="currentColor" /></>
                                )}
                            </svg>
                        </button>
                    </div>
                )}
            </div>

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
                    {viewMode === "tiles" ? (
                        <div className="flex flex-col pb-10 min-h-full">
                            {filtered.length === 0 ? (
                                <EmptyPlaceholder />
                            ) : (
                                (filterTag === "hub" && groupedHub) ? (
                                    groupedHub.map(({ tag, scripts }) => {
                                        const sectionMasonry = Array.from({ length: columnsCount }, () => [] as Script[]);
                                        scripts.forEach((s, i) => sectionMasonry[i % columnsCount].push(s));
                                        return (
                                            <div key={tag} className="flex flex-col mb-10">
                                                <TagSectionHeader tag={tag} />
                                                <div
                                                    className="grid gap-6 items-start"
                                                    style={{ gridTemplateColumns: `repeat(${columnsCount}, minmax(0, 1fr))` }}
                                                >
                                                    {sectionMasonry.map((col, colIdx) => (
                                                        <div key={colIdx} className="flex flex-col gap-6">
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
                                                                    onRestart={handleRestart}
                                                                    isFocused={focusedPath === s.path}
                                                                    setFocusedPath={setFocusedPath}
                                                                    isVimMode={isVimMode}
                                                                    setIsVimMode={setIsVimMode}
                                                                />
                                                            ))}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div
                                        className="grid gap-6 items-start pt-6"
                                        style={{ gridTemplateColumns: `repeat(${columnsCount}, minmax(0, 1fr))` }}
                                    >
                                        {masonryColumns.map((col, colIdx) => (
                                            <div key={colIdx} className="flex flex-col gap-6">
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
                                                        onRestart={handleRestart}
                                                        isFocused={focusedPath === s.path}
                                                        setFocusedPath={setFocusedPath}
                                                        isVimMode={isVimMode}
                                                        setIsVimMode={setIsVimMode}
                                                    />
                                                ))}
                                            </div>
                                        ))}
                                    </div>
                                )
                            )}
                        </div>
                    ) : viewMode === "list" ? (
                        <div className="flex flex-col pb-10 min-h-full">
                            {filtered.length === 0 ? (
                                <EmptyPlaceholder />
                            ) : (
                                (filterTag === "hub" && groupedHub) ? (
                                    groupedHub.map(({ tag, scripts }) => {
                                        const sectionMasonry = Array.from({ length: columnsCount }, () => [] as Script[]);
                                        scripts.forEach((s, i) => sectionMasonry[i % columnsCount].push(s));
                                        return (
                                            <div key={tag} className="flex flex-col mb-8">
                                                <TagSectionHeader tag={tag} />
                                                <div
                                                    className="grid gap-x-8 gap-y-1 items-start"
                                                    style={{ gridTemplateColumns: `repeat(${columnsCount}, minmax(0, 1fr))` }}
                                                >
                                                    {sectionMasonry.map((col, colIdx) => (
                                                        <div key={colIdx} className="flex flex-col gap-y-1">
                                                            {col.map(s => {
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
                                                                        onMouseDown={handleCustomMouseDown}
                                                                        onDoubleClick={(s) => handleToggle(s, true)}
                                                                        onToggle={handleToggle}
                                                                        onStartEditing={startEditing}
                                                                        onAddTag={addTag}
                                                                        onRemoveTag={removeTag}
                                                                        onCloseEditing={stopEditing}
                                                                        onScriptContextMenu={onScriptContextMenu}
                                                                        visibilityMode={showHidden}
                                                                        isContextMenuOpen={contextMenu?.type === 'script' && contextMenu?.data?.path === s.path}
                                                                        onShowUI={onShowUI}
                                                                        onRestart={handleRestart}
                                                                        isFocused={focusedPath === s.path}
                                                                        setFocusedPath={setFocusedPath}
                                                                        isVimMode={isVimMode}
                                                                        setIsVimMode={setIsVimMode}
                                                                    />
                                                                );
                                                            })}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div
                                        className="grid gap-x-8 gap-y-1 items-start pt-6"
                                        style={{ gridTemplateColumns: `repeat(${columnsCount}, minmax(0, 1fr))` }}
                                    >
                                        {masonryColumns.map((col, colIdx) => (
                                            <div key={colIdx} className="flex flex-col gap-y-1">
                                                {col.map(s => {
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
                                                            onMouseDown={handleCustomMouseDown}
                                                            onDoubleClick={(s) => handleToggle(s, true)}
                                                            onToggle={handleToggle}
                                                            onStartEditing={startEditing}
                                                            onAddTag={addTag}
                                                            onRemoveTag={removeTag}
                                                            onCloseEditing={stopEditing}
                                                            onScriptContextMenu={onScriptContextMenu}
                                                            visibilityMode={showHidden}
                                                            isContextMenuOpen={contextMenu?.type === 'script' && contextMenu?.data?.path === s.path}
                                                            onShowUI={onShowUI}
                                                            onRestart={handleRestart}
                                                            isFocused={focusedPath === s.path}
                                                            setFocusedPath={setFocusedPath}
                                                            isVimMode={isVimMode}
                                                            setIsVimMode={setIsVimMode}
                                                        />
                                                    );
                                                })}
                                            </div>
                                        ))}
                                    </div>
                                )
                            )}
                        </div>
                    ) : (
                        <div className="flex flex-col space-y-0.5 select-none">
                            <TreeContext.Provider value={treeContextValue}>
                                {!hasContent ? (
                                    <EmptyPlaceholder />
                                ) : (
                                    <TreeNodeRenderer
                                        node={tree}
                                        depth={0}
                                        isExpanded={true}
                                    />
                                )}
                            </TreeContext.Provider>
                        </div>
                    )}
                </div>
            </SearchContext.Provider>
            <CheatSheet
                isOpen={isCheatSheetOpen}
                onClose={() => setIsCheatSheetOpen(false)}
            />
        </div >
    );
}
