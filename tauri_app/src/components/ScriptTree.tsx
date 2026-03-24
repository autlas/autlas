import React, { useState, useEffect, useMemo, useRef, memo, useCallback } from "react";
import { getScripts, Script, runScript, killScript } from "../api";
import { invoke } from "@tauri-apps/api/core";

interface ScriptTreeProps {
    filterTag: string;
    onTagsLoaded: (tags: string[]) => void;
    viewMode: "tree" | "hub";
    onCustomDragStart: (script: { path: string, filename: string, x: number, y: number }) => void;
    isDragging: boolean;
    animationsEnabled: boolean;
}

interface TreeNode {
    name: string;
    fullName: string;
    scripts: Script[];
    children: Record<string, TreeNode>;
}

// ─── Tag Picker Popover (isolated state → no parent re-render on keystroke) ──
interface TagPickerProps {
    script: Script;
    allUniqueTags: string[];
    popoverRef: React.RefObject<HTMLDivElement | null>;
    onAdd: (script: Script, tag: string) => void;
    onClose: () => void;
    variant: "tree" | "hub";
}

const TagPickerPopover = memo(function TagPickerPopover({ script, allUniqueTags, popoverRef, onAdd, onClose, variant }: TagPickerProps) {
    const [query, setQuery] = useState("");
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => { setSelectedIndex(0); }, [query]);

    const availableTags = useMemo(
        () => allUniqueTags.filter(t => t.toLowerCase().includes(query.toLowerCase()) && !script.tags.includes(t)),
        [allUniqueTags, query, script.tags]
    );
    const showCreate = query && !allUniqueTags.some(t => t.toLowerCase() === query.toLowerCase());
    const totalCount = availableTags.length + (showCreate ? 1 : 0);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex(p => totalCount > 0 ? (p + 1) % totalCount : 0); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex(p => totalCount > 0 ? (p - 1 + totalCount) % totalCount : 0); }
        else if (e.key === "Enter") {
            e.preventDefault();
            if (totalCount > 0) {
                if (selectedIndex < availableTags.length) onAdd(script, availableTags[selectedIndex]);
                else if (showCreate) onAdd(script, query);
            }
        } else if (e.key === "Escape") { onClose(); }
    };

    if (variant === "tree") return (
        <div
            ref={popoverRef}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            className="absolute right-0 top-9 w-64 bg-[#1a1a1c]/95 border border-white/10 rounded-2xl shadow-[0_0_30px_rgba(0,0,0,0.8)] z-[1000] p-3 backdrop-blur-3xl pointer-events-auto !cursor-default opacity-100"
        >
            <input
                className="w-full bg-white/5 border border-white/5 rounded-xl px-4 py-2.5 text-[12px] text-white outline-none focus:border-indigo-500/50 transition-all font-bold mb-3"
                placeholder="Имя нового тега..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
                onKeyDown={handleKeyDown}
            />
            <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-1">
                {availableTags.map((tag, index) => (
                    <button key={tag} onClick={(e) => { e.stopPropagation(); onAdd(script, tag); }} onMouseDown={(e) => e.stopPropagation()}
                        className={`cursor-pointer w-full text-left px-4 py-2 rounded-xl transition-all flex items-center justify-between group/suggest ${selectedIndex === index ? 'bg-white/10 text-white' : 'hover:bg-white/5 text-[11px] text-white/40 hover:text-white'}`}>
                        <span>{tag}</span>
                        <span className={`text-indigo-400 font-bold ${selectedIndex === index ? 'opacity-100' : 'opacity-0 group-hover/suggest:opacity-100'}`}>+</span>
                    </button>
                ))}
                {showCreate && (
                    <button onClick={(e) => { e.stopPropagation(); onAdd(script, query); }} onMouseDown={(e) => e.stopPropagation()}
                        className={`cursor-pointer w-full text-left px-4 py-2.5 rounded-xl text-[11px] transition-all flex items-center justify-between ${selectedIndex === availableTags.length ? 'bg-indigo-500/30 text-indigo-300 font-bold' : 'bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 font-bold'}`}>
                        <span>Создать "{query}"</span>
                        <span className="text-xl leading-none">+</span>
                    </button>
                )}
            </div>
            <button onClick={(e) => { e.stopPropagation(); onClose(); }} onMouseDown={(e) => e.stopPropagation()}
                className="w-full mt-3 py-2 text-[10px] text-white/20 hover:text-white/40 transition-all font-bold uppercase tracking-widest cursor-pointer">
                Отмена
            </button>
        </div>
    );

    // hub variant
    return (
        <div
            ref={popoverRef}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            className="absolute inset-x-0 bottom-0 top-0 bg-[#1a1a1c]/95 border border-white/10 rounded-[2.5rem] shadow-[0_0_30px_rgba(0,0,0,0.8)] z-[1000] p-6 backdrop-blur-3xl pointer-events-auto flex flex-col !cursor-default opacity-100"
        >
            <input
                className="w-full bg-white/5 border border-white/5 rounded-2xl px-6 py-4 text-sm text-white outline-none focus:border-indigo-500/50 transition-all font-bold mb-4"
                placeholder="Поиск или новый тег..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
                onKeyDown={handleKeyDown}
            />
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 mb-4">
                {availableTags.map((tag, index) => (
                    <button key={tag} onClick={(e) => { e.stopPropagation(); onAdd(script, tag); }} onMouseDown={(e) => e.stopPropagation()}
                        className={`cursor-pointer w-full text-left px-6 py-3 rounded-2xl transition-all flex items-center justify-between group/suggest ${selectedIndex === index ? 'bg-white/10 text-white' : 'hover:bg-white/5 text-sm text-white/40 hover:text-white'}`}>
                        <span>{tag}</span>
                        <span className={`text-indigo-400 font-bold ${selectedIndex === index ? 'opacity-100' : 'opacity-0 group-hover/suggest:opacity-100'}`}>+</span>
                    </button>
                ))}
                {showCreate && (
                    <button onClick={(e) => { e.stopPropagation(); onAdd(script, query); }} onMouseDown={(e) => e.stopPropagation()}
                        className={`cursor-pointer w-full text-left px-6 py-3 rounded-2xl transition-all flex items-center justify-between ${selectedIndex === availableTags.length ? 'bg-indigo-500/30 text-indigo-300 font-bold' : 'bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 font-bold'}`}>
                        <span>Создать "{query}"</span>
                        <span className="text-xl leading-none">+</span>
                    </button>
                )}
            </div>
            <button onClick={(e) => { e.stopPropagation(); onClose(); }} onMouseDown={(e) => e.stopPropagation()}
                className="w-full py-4 text-[12px] text-white/20 hover:text-white/40 transition-all font-bold uppercase tracking-[0.2em] cursor-pointer">
                Закрыть
            </button>
        </div>
    );
});

// ─── Memoized Script Row ── extracted to prevent re-render on folder toggle ──
interface ScriptRowProps {
    s: Script;
    isDragging: boolean;
    isEditing: boolean;
    isPending: boolean;
    removingTagKeys: string[]; // tag IDs being removed for this script
    allUniqueTags: string[];
    popoverRef: React.RefObject<HTMLDivElement | null>;
    onMouseDown: (e: React.MouseEvent, s: Script) => void;
    onDoubleClick: (s: Script) => void;
    onToggle: (s: Script) => void;
    onStartEditing: (s: Script) => void;
    onAddTag: (s: Script, tag: string) => void;
    onRemoveTag: (s: Script, tag: string) => void;
    onCloseEditing: () => void;
}

const ScriptRow = memo(function ScriptRow({
    s, isDragging, isEditing, isPending, removingTagKeys,
    allUniqueTags, popoverRef,
    onMouseDown, onDoubleClick, onToggle, onStartEditing, onAddTag, onRemoveTag, onCloseEditing
}: ScriptRowProps) {
    return (
        <div
            onMouseDown={(e) => onMouseDown(e, s)}
            onDoubleClick={() => !isDragging && onDoubleClick(s)}
            className={`flex items-center justify-between h-[36px] px-3 rounded-lg transition-all border border-transparent select-none relative ${isEditing ? 'z-[200]' : 'z-10 hover:z-[100]'}
                ${!isDragging ? `group ${isEditing ? 'bg-white/5' : 'hover:bg-white/5 cursor-grab active:cursor-grabbing active:scale-[0.99] has-[button:active]:scale-100'}` : 'bg-transparent cursor-default opacity-40'}
                ${s.is_hidden ? 'opacity-40 grayscale-[0.5]' : ''}
                ${s.is_running ? 'border-green-500/10' : ''}
            `}
        >
            <div className="flex items-center space-x-4 overflow-visible flex-1 mr-4 pointer-events-none">
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0
                    ${isPending ? 'bg-yellow-500 animate-pulse shadow-[0_0_10px_rgba(234,179,8,0.6)]' :
                        s.is_running ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.6)]' : 'bg-white/10'}
                `}></div>
                <span className={`text-[15px] font-medium tracking-tight truncate max-w-[200px]
                    ${isPending ? 'text-yellow-500/80 animate-pulse' :
                        s.is_running ? 'text-green-400 font-bold' : (isEditing ? 'text-white' : 'text-white/50 group-hover:text-white')}
                `}>{s.filename}</span>

                {!isDragging && (
                    <div className="flex items-center space-x-2 flex-shrink-0 pr-2 overflow-visible relative">
                        {s.tags.map(t => {
                            const isRemoving = removingTagKeys.includes(`${s.path}-${t}`);
                            return (
                                <div key={t}
                                    className="relative group/tag inline-flex items-center h-7 mr-2 pointer-events-auto"
                                    onDoubleClick={(e) => e.stopPropagation()}
                                >
                                    <div className={isRemoving ? 'animate-tag-out' : 'animate-tag-in'}>
                                        <span className="text-[11px] font-bold px-3 h-7 rounded-lg bg-white/[0.03] text-white/35 border border-white/10 cursor-default shadow-lg flex items-center justify-center">
                                            {t}
                                        </span>
                                    </div>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onRemoveTag(s, t); }}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onDoubleClick={(e) => e.stopPropagation()}
                                        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover/tag:opacity-100 transition-all shadow-lg hover:scale-125 active:scale-90 cursor-pointer z-50 pointer-events-auto border-none"
                                        title={`Удалить тег ${t}`}
                                    >
                                        <svg width="8" height="2" viewBox="0 0 8 2" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M1 1h6" /></svg>
                                    </button>
                                </div>
                            );
                        })}
                        <button
                            onClick={(e) => { e.stopPropagation(); onStartEditing(s); }}
                            onMouseDown={(e) => e.stopPropagation()}
                            onDoubleClick={(e) => e.stopPropagation()}
                            className={`w-7 h-7 ml-1 flex items-center justify-center rounded-lg bg-white/5 text-white/20 border border-white/5 hover:text-indigo-400 hover:bg-white/10 transition-all shadow-lg group/plus cursor-pointer pointer-events-auto ${isEditing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                        >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        </button>

                        {isEditing && (
                            <TagPickerPopover
                                script={s}
                                allUniqueTags={allUniqueTags}
                                popoverRef={popoverRef}
                                onAdd={onAddTag}
                                onClose={onCloseEditing}
                                variant="tree"
                            />
                        )}
                    </div>
                )}
            </div>

            {!isDragging && (
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center space-x-2 pointer-events-auto">
                    <button
                        onClick={(e) => { e.stopPropagation(); onToggle(s); }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => e.stopPropagation()}
                        className={`text-[12px] font-bold px-4 h-7 rounded-lg bg-white/5 border border-white/5 shadow-xl transition-all cursor-pointer active:scale-95 flex items-center justify-center
                            ${isPending ? 'text-white/20 animate-pulse cursor-wait' :
                                s.is_running ? 'text-red-500 hover:bg-red-500 hover:text-white' : 'text-indigo-400 hover:bg-indigo-500 hover:text-white'}
                        `}
                    >
                        {isPending ? "Wait..." : s.is_running ? "Kill" : "Run"}
                    </button>
                </div>
            )}
        </div>
    );
}, (prev, next) => {
    // Custom comparator — only re-render if THIS row's data actually changed
    return prev.s.path === next.s.path &&
        prev.s.is_running === next.s.is_running &&
        prev.s.is_hidden === next.s.is_hidden &&
        prev.s.filename === next.s.filename &&
        prev.s.tags.length === next.s.tags.length &&
        prev.s.tags.every((t, i) => t === next.s.tags[i]) &&
        prev.isDragging === next.isDragging &&
        prev.isEditing === next.isEditing &&
        prev.isPending === next.isPending &&
        prev.removingTagKeys.length === next.removingTagKeys.length &&
        prev.removingTagKeys.every((k, i) => k === next.removingTagKeys[i]);
});

export default function ScriptTree({ filterTag, onTagsLoaded, viewMode, onCustomDragStart, isDragging, animationsEnabled }: ScriptTreeProps) {
    const [allScripts, setAllScripts] = useState<Script[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
    const [isAllExpanded, setIsAllExpanded] = useState(true);
    const [editingScript, setEditingScript] = useState<string | null>(null);
    const popoverRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (editingScript && popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
                setEditingScript(null);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [editingScript]);

    // Local Filters
    const [treeFilter, setTreeFilter] = useState<"all" | "tagged" | "untagged">("all");
    const [showHidden, setShowHidden] = useState(false);
    const [pendingScripts, setPendingScripts] = useState<Set<string>>(new Set());
    const [removingTags, setRemovingTags] = useState<Set<string>>(new Set());


    // DnD Threshold Refs
    const pendingDragRef = useRef<{ script: Script, x: number, y: number } | null>(null);
    const dragTimerRef = useRef<number | null>(null);
    const folderRefs = useRef<Map<string, HTMLDivElement>>(new Map());




    const lastTagsKeyRef = useRef<string>('');

    const fetchData = async () => {
        try {
            const data = await getScripts();
            setAllScripts(prev => {
                if (prev.length !== data.length) return data;
                // Map-based comparison (order-insensitive — backend may reorder scripts)
                const prevMap = new Map(prev.map(s => [s.path, s]));
                for (const d of data) {
                    const p = prevMap.get(d.path);
                    if (!p ||
                        p.is_running !== d.is_running ||
                        p.is_hidden !== d.is_hidden ||
                        p.tags.length !== d.tags.length ||
                        p.tags.some((t, j) => t !== d.tags[j])) {
                        return data; // something changed → new reference
                    }
                }
                return prev; // identical → stable reference → no re-render
            });
            // Only notify parent of tag changes when tags actually changed
            const tagsKey = data.flatMap(s => s.tags).sort().join(',');
            if (tagsKey !== lastTagsKeyRef.current) {
                lastTagsKeyRef.current = tagsKey;
                const tags = new Set<string>();
                data.forEach(s => s.tags.forEach(t => tags.add(t)));
                onTagsLoaded(Array.from(tags).sort());
            }
        } catch (e) {
            // silence
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 3000);
        return () => clearInterval(interval);
    }, []);

    const toggleFolder = useCallback((path: string) => {
        const isCurrentlyExpanded = expandedFolders[path] !== false;

        // Instant state update — no delay
        setExpandedFolders(prev => ({ ...prev, [path]: !isCurrentlyExpanded }));

        // Auto-scroll ONLY when COLLAPSING — deferred to next frame so it doesn't block render
        if (isCurrentlyExpanded) {
            requestAnimationFrame(() => {
                const header = folderRefs.current.get(path);
                if (header) {
                    const container = header.closest('.overflow-y-auto');
                    if (container) {
                        const rect = header.getBoundingClientRect();
                        const containerRect = container.getBoundingClientRect();
                        if (rect.top < containerRect.top) {
                            header.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                    }
                }
            });
        }
    }, [expandedFolders]);

    const handleToggle = useCallback(async (script: Script, forceStart = false) => {
        if (pendingScripts.has(script.path)) return;

        const wasRunning = script.is_running;
        if (forceStart && wasRunning) return; // Don't stop on double-click

        setPendingScripts(prev => new Set(prev).add(script.path));

        try {
            if (wasRunning) {
                await killScript(script.path);
            } else {
                await runScript(script.path);
            }

            let attempts = 0;
            const burstInterval = setInterval(async () => {
                attempts++;
                try {
                    const data = await getScripts();
                    setAllScripts(data);

                    const updated = data.find(s => s.path === script.path);
                    if (updated && updated.is_running !== wasRunning) {
                        stopBurst(burstInterval, script.path);
                    }

                    if (attempts > 60) stopBurst(burstInterval, script.path);
                } catch (e) {
                    stopBurst(burstInterval, script.path);
                }
            }, 100);

        } catch (e) {
            console.error(e);
            stopBurst(null, script.path);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingScripts]);

    const stopBurst = useCallback((interval: any, path: string) => {
        if (interval) clearInterval(interval);
        setPendingScripts(prev => {
            const next = new Set(prev);
            next.delete(path);
            return next;
        });
    }, []);

    const stopEditing = useCallback(() => setEditingScript(null), []);

    const allUniqueTags = useMemo(() => {
        const tags = new Set<string>();
        allScripts.forEach(s => s.tags.forEach(t => tags.add(t)));
        return Array.from(tags).sort();
    }, [allScripts]);

    const startEditing = useCallback((s: Script) => {
        setEditingScript(s.path);
    }, []);

    const addTag = useCallback(async (script: Script, newTag: string) => {
        const trimmed = newTag.trim();
        if (!trimmed) return;
        if (script.tags.includes(trimmed)) {
            setEditingScript(null);
            return;
        }
        const updatedTags = [...script.tags, trimmed];
        setAllScripts(prev => prev.map(s => s.path === script.path ? { ...s, tags: updatedTags } : s));
        setEditingScript(null);
        try {
            await invoke("save_script_tags", { path: script.path, tags: updatedTags });
        } catch (e) {
            console.error(e);
            setAllScripts(prev => prev.map(s => s.path === script.path ? { ...s, tags: script.tags } : s));
        }
    }, []);

    const removeTag = useCallback(async (script: Script, tagToRemove: string) => {
        const tagId = `${script.path}-${tagToRemove}`;
        if (removingTags.has(tagId)) return;

        setRemovingTags(prev => new Set(prev).add(tagId));

        await new Promise(r => setTimeout(r, 90));

        const newTags = script.tags.filter(t => t !== tagToRemove);
        setAllScripts(prev => prev.map(s => s.path === script.path ? { ...s, tags: newTags } : s));
        setRemovingTags(prev => {
            const next = new Set(prev);
            next.delete(tagId);
            return next;
        });

        try {
            await invoke("save_script_tags", { path: script.path, tags: newTags });
        } catch (e) {
            console.error(e);
            setAllScripts(prev => prev.map(s => s.path === script.path ? { ...s, tags: script.tags } : s));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [removingTags]);

    const handleCustomMouseDown = useCallback((e: React.MouseEvent, script: Script) => {
        if (e.button !== 0) return;
        const target = e.target as HTMLElement;
        if (target.closest('button') || target.closest('input')) return;

        e.preventDefault();

        const startX = e.clientX;
        const startY = e.clientY;
        pendingDragRef.current = { script, x: startX, y: startY };

        dragTimerRef.current = window.setTimeout(() => {
            initiateDrag(startX, startY);
        }, 300);

        const handleInitialMouseMove = (mv: MouseEvent) => {
            if (!pendingDragRef.current) return;
            const dist = Math.sqrt(Math.pow(mv.clientX - startX, 2) + Math.pow(mv.clientY - startY, 2));
            if (dist > 8) {
                initiateDrag(mv.clientX, mv.clientY);
            }
        };

        const handleInitialMouseUp = () => {
            cleanupPendingDrag();
        };

        const initiateDrag = (x: number, y: number) => {
            if (pendingDragRef.current) {
                onCustomDragStart({
                    path: pendingDragRef.current.script.path,
                    filename: pendingDragRef.current.script.filename,
                    x,
                    y
                });
                cleanupPendingDrag();
            }
        };

        const cleanupPendingDrag = () => {
            if (dragTimerRef.current) {
                clearTimeout(dragTimerRef.current);
                dragTimerRef.current = null;
            }
            pendingDragRef.current = null;
            window.removeEventListener('mousemove', handleInitialMouseMove);
            window.removeEventListener('mouseup', handleInitialMouseUp);
        };

        window.addEventListener('mousemove', handleInitialMouseMove);
        window.addEventListener('mouseup', handleInitialMouseUp);
    }, [onCustomDragStart]);

    const filtered = useMemo(() => {
        if (viewMode === "hub") {
            return allScripts.filter(s => s.is_running || s.tags.some(t => t.toLowerCase() === "hub" || t.toLowerCase() === "fav"));
        }

        let list = [...allScripts];

        // New filtering logic combining sidebar tags and local tree filters
        list = list.filter(s => {
            // 1. Sidebar Category/Tag Filter
            if (filterTag === "Запущенные") {
                if (!s.is_running) return false;
            } else if (filterTag === "Без тегов") {
                if (s.tags.length > 0) return false;
            } else if (filterTag === "Скрытые") {
                if (!s.is_hidden) return false;
            } else if (filterTag === "С тегами") {
                if (s.tags.length === 0) return false;
            } else if (filterTag !== "Все скрипты" && filterTag !== "Дерево" && filterTag !== "Хаб" && filterTag !== "") {
                // If it's a specific tag from sidebar
                if (!s.tags.includes(filterTag)) return false;
            } else {
                // Default for "Все скрипты" or empty filterTag, exclude hidden unless explicitly shown
                if (s.is_hidden && !showHidden) return false;
            }

            // 2. Tree Local Filter (Segmented Control) - Only in Tree Mode
            if (viewMode === "tree") {
                if (treeFilter === "tagged" && s.tags.length === 0) return false;
                if (treeFilter === "untagged" && s.tags.length > 0) return false;

                // 3. Hidden Logic (Eye Toggle)
                if (s.is_hidden && !showHidden) return false;
            } else {
                // In Hub mode, hide hidden scripts by default
                if (s.is_hidden) return false;
            }

            return true;
        });

        return list;
    }, [allScripts, filterTag, viewMode, treeFilter, showHidden]);

    const tree = useMemo(() => {
        const root: TreeNode = { name: "Root", fullName: "Root", scripts: [], children: {} };
        filtered.forEach(script => {
            const pathParts = script.path.split(/[\\/]/);
            const desktopIdx = pathParts.findIndex(p => p === "Desktop");
            const ahkIdx = pathParts.findIndex(p => p === "AHKmanager");

            let startIdx = 0;
            if (desktopIdx !== -1) startIdx = desktopIdx;
            else if (ahkIdx !== -1) startIdx = ahkIdx;

            let current = root;
            for (let i = startIdx; i < pathParts.length - 1; i++) {
                const part = pathParts[i];
                if (!part) continue;
                if (!current.children[part]) {
                    current.children[part] = {
                        name: part,
                        fullName: pathParts.slice(0, i + 1).join("\\"),
                        scripts: [],
                        children: {}
                    };
                }
                current = current.children[part];
            }
            current.scripts.push(script);
        });
        return root;
    }, [filtered]);

    const toggleAll = () => {
        const nextState = !isAllExpanded;
        const next: Record<string, boolean> = {};
        const traverse = (node: TreeNode) => {
            if (node.name !== "Root") next[node.fullName] = nextState;
            Object.values(node.children).forEach(traverse);
        };
        traverse(tree);
        setExpandedFolders(next);
        setIsAllExpanded(nextState);
    };

    const renderNode = (node: TreeNode, depth: number = 0) => {
        const isExpanded = depth === 0 || expandedFolders[node.fullName] !== false;

        return (
            <div key={node.fullName} className={`flex flex-col ${isExpanded ? 'overflow-visible' : 'overflow-hidden'}`}>
                {node.name !== "Root" && (
                    <div
                        ref={el => { if (el) folderRefs.current.set(node.fullName, el); }}
                        onClick={() => !isDragging && toggleFolder(node.fullName)}
                        className={`flex items-center space-x-2 h-[32px] rounded-lg z-10 relative transition-all mb-0.5 border border-transparent hover:z-[50]
              ${!isDragging ? 'bg-white/[0.015] hover:bg-white/[0.05] cursor-pointer group' : 'bg-transparent text-white/30 cursor-default'}
            `}
                    >
                        <div className={`w-4 h-4 flex items-center justify-center transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`}>
                            <svg width="6" height="6" viewBox="0 0 6 6" className={`transition-colors ${isExpanded && !isDragging ? 'fill-white/20' : 'fill-white/5'} ${!isDragging && 'group-hover:fill-white'}`}><path d="M0 0L6 3L0 6V0Z" /></svg>
                        </div>
                        <span className={`text-[14px] font-bold transition-colors ${isExpanded && !isDragging ? 'text-white' : 'text-white/20'} ${!isDragging && 'group-hover:text-white'}`}>{node.name}</span>
                    </div>
                )}

                <div className={`grid ${animationsEnabled ? 'transition-all duration-150 ease-in-out' : ''} relative ${isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`} style={{ overflow: isExpanded ? 'visible' : 'hidden' }}>
                    <div className="min-h-0 overflow-hidden">
                        {node.name !== "Root" && (
                            <div
                                onClick={() => !isDragging && toggleFolder(node.fullName)}
                                className={`absolute left-[13px] top-0 bottom-4 w-5 -ml-2.5 z-20 ${animationsEnabled ? 'transition-all duration-150' : ''} rounded-full ${!isDragging ? 'cursor-pointer group/line hover:bg-white/[0.05]' : ''} ${isExpanded ? 'opacity-100' : 'opacity-0 pointer-events-auto'}`}
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
                                    />
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    if (loading) return <div className="p-10 text-center text-white/10 font-bold text-xs tracking-[0.5em] animate-pulse uppercase">Syncing Uplink...</div>;

    const hasContent = Object.keys(tree.children).length > 0 || tree.scripts.length > 0;
    const anyExpanded = Object.values(expandedFolders).some(val => val);

    return (
        <div className="flex flex-col space-y-1.5">
            {viewMode === "tree" && (
                <div className="flex items-center justify-between pl-1 mb-4 pb-2 border-b" style={{ borderColor: 'var(--border-color)' }}>
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
                                    className={`px-4 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${treeFilter === f.id
                                        ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/20"
                                        : "text-white/20 hover:text-white/40"
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
                            : "bg-white/[0.03] border-white/5 text-white/10 hover:text-white/30 hover:bg-white/[0.05]"
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

            {viewMode === "hub" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                    {filtered.length === 0 && <div className="text-white/10 col-span-3 text-center py-40 italic tracking-[0.3em] text-[14px] font-bold">Пустой канал...</div>}
                    {filtered.map(s => (
                        <div
                            key={s.path}
                            onMouseDown={(e) => handleCustomMouseDown(e, s)}
                            onDoubleClick={() => !isDragging && handleToggle(s, true)}
                            className={`p-6 rounded-[2.5rem] border transition-all flex flex-col justify-between h-64 select-none relative ${editingScript === s.path ? 'z-[200]' : 'z-10 hover:z-[100]'}
                                ${!isDragging
                                    ? `group ${editingScript === s.path ? 'shadow-2xl' : 'hover:shadow-2xl cursor-grab active:cursor-grabbing active:scale-[0.98]'}`
                                    : 'opacity-30 border-transparent shadow-none cursor-default'}
                                ${s.is_running && !isDragging ? 'border-indigo-500/30' : ''}
                            `}
                            style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: s.is_running && !isDragging ? 'var(--accent-indigo)' : 'var(--border-color)' }}
                        >
                            <div className="flex justify-between items-start pointer-events-none">
                                <div className="flex flex-col overflow-hidden flex-1">
                                    <span className={`text-xl font-black truncate pr-4 transition-colors tracking-tight ${!isDragging ? (editingScript === s.path ? 'text-indigo-400' : 'text-white/40 group-hover:text-indigo-400') : 'text-white/40'}`}>{s.filename}</span>
                                    <span className="text-[12px] text-white/20 font-bold tracking-[0.4em] mt-2">{s.parent}</span>
                                </div>
                                <div className={`w-3 h-3 rounded-full mt-2 transition-opacity ${s.is_running ? 'bg-green-500' : 'bg-white/5 border border-white/10'} ${isDragging ? 'opacity-20' : ''}`}></div>
                            </div>

                            <div className="mt-4 flex-1">
                                {editingScript === s.path && !isDragging ? (
                                    <TagPickerPopover
                                        script={s}
                                        allUniqueTags={allUniqueTags}
                                        popoverRef={popoverRef}
                                        onAdd={addTag}
                                        onClose={stopEditing}
                                        variant="hub"
                                    />
                                ) : (
                                    <div className="flex flex-wrap gap-2 pointer-events-none">
                                        {s.tags.map(t => {
                                            const isRemoving = removingTags.has(`${s.path}-${t}`);
                                            return (
                                                <div key={t}
                                                    className="relative group/tag inline-flex items-center pointer-events-auto"
                                                    onDoubleClick={(e) => e.stopPropagation()}
                                                >
                                                    <div className={isRemoving ? 'animate-tag-out' : 'animate-tag-in'}>
                                                        <span className={`text-[12px] px-5 py-3 bg-white/5 border border-white/5 text-white/40 font-bold rounded-xl shadow-lg leading-none flex items-center transition-opacity ${isDragging ? 'opacity-20' : ''}`}>#{t}</span>
                                                    </div>
                                                    {!isDragging && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); removeTag(s, t); }}
                                                            onMouseDown={(e) => e.stopPropagation()}
                                                            onDoubleClick={(e) => e.stopPropagation()}
                                                            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover/tag:opacity-100 transition-all shadow-xl hover:scale-125 active:scale-90 cursor-pointer z-50 border-none"
                                                            title={`Удалить тег ${t}`}
                                                        >
                                                            <svg width="10" height="2" viewBox="0 0 10 2" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                                                <path d="M1 1h8" />
                                                            </svg>
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })}
                                        {!isDragging && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); startEditing(s); }}
                                                onMouseDown={(e) => e.stopPropagation()}
                                                onDoubleClick={(e) => e.stopPropagation()}
                                                className="w-[42px] h-[40px] flex items-center justify-center border border-dashed border-white/10 rounded-xl text-white/10 hover:text-white/40 hover:border-white/20 transition-all cursor-pointer pointer-events-auto opacity-0 group-hover:opacity-100"
                                            >

                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>

                            {!isDragging && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleToggle(s); }}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    className={`w-full py-3.5 rounded-2xl text-[12px] font-bold tracking-[0.1em] transition-all transform cursor-pointer active:scale-95 mt-4 pointer-events-auto shadow-xl 
                                                ${pendingScripts.has(s.path) ? 'bg-white/5 text-white/20 animate-pulse cursor-wait border border-white/5' :
                                            s.is_running ? "bg-red-600/10 text-red-500 border border-red-500/20" :
                                                "bg-white text-black hover:bg-gray-100 group-hover:shadow-[0_0_20px_rgba(255,255,255,0.2)]"}
                                            `}
                                >
                                    {pendingScripts.has(s.path) ? (s.is_running ? "KRASHING..." : "IGNITING...") : (s.is_running ? "Kill" : "Run")}
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                <div className="flex flex-col space-y-0.5 select-none pr-6">
                    {!hasContent ? (
                        <div className="text-white/10 text-center py-40 italic tracking-[0.3em] text-[14px] font-bold">Пустой раздел дерева...</div>
                    ) : renderNode(tree)}
                </div>
            )}
        </div >
    );
}
