import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import React from "react";
import { getScripts, Script, runScript, killScript } from "../api";
import { invoke } from "@tauri-apps/api/core";
import { TreeNode } from "../types/script";

interface UseScriptTreeOptions {
    filterTag: string;
    onTagsLoaded: (tags: string[]) => void;
    viewMode: "tree" | "hub";
    onCustomDragStart: (script: { path: string, filename: string, tags: string[], x: number, y: number }) => void;
}

export function useScriptTree({ filterTag, onTagsLoaded, viewMode, onCustomDragStart }: UseScriptTreeOptions) {
    const [allScripts, setAllScripts] = useState<Script[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
    const [isAllExpanded, setIsAllExpanded] = useState(true);
    const [editingScript, setEditingScript] = useState<string | null>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const [treeFilter, setTreeFilter] = useState<"all" | "tagged" | "untagged">("all");
    const [showHidden, setShowHidden] = useState(false);
    const [pendingScripts, setPendingScripts] = useState<Set<string>>(new Set());
    const [removingTags, setRemovingTags] = useState<Set<string>>(new Set());

    const pendingDragRef = useRef<{ script: Script, x: number, y: number } | null>(null);
    const dragTimerRef = useRef<number | null>(null);
    const folderRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    const lastTagsKeyRef = useRef<string>('');

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (editingScript && popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
                setEditingScript(null);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [editingScript]);

    const fetchData = async () => {
        try {
            const data = await getScripts();
            setAllScripts(prev => {
                if (prev.length !== data.length) return data;
                const prevMap = new Map(prev.map(s => [s.path, s]));
                for (const d of data) {
                    const p = prevMap.get(d.path);
                    if (!p ||
                        p.is_running !== d.is_running ||
                        p.is_hidden !== d.is_hidden ||
                        p.tags.length !== d.tags.length ||
                        p.tags.some((t, j) => t !== d.tags[j])) {
                        return data;
                    }
                }
                return prev;
            });
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
        setExpandedFolders(prev => ({ ...prev, [path]: !isCurrentlyExpanded }));
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

    const stopBurst = useCallback((interval: any, path: string) => {
        if (interval) clearInterval(interval);
        setPendingScripts(prev => {
            const next = new Set(prev);
            next.delete(path);
            return next;
        });
    }, []);

    const handleToggle = useCallback(async (script: Script, forceStart = false) => {
        if (pendingScripts.has(script.path)) return;
        const wasRunning = script.is_running;
        if (forceStart && wasRunning) return;
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

    const stopEditing = useCallback(() => setEditingScript(null), []);
    const startEditing = useCallback((s: Script) => setEditingScript(s.path), []);

    const allUniqueTags = useMemo(() => {
        const tags = new Set<string>();
        allScripts.forEach(s => s.tags.forEach(t => tags.add(t)));
        return Array.from(tags).sort();
    }, [allScripts]);

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
        if (e.button !== 0) {
            e.preventDefault();
            return;
        }
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
                    tags: pendingDragRef.current.script.tags,
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
        list = list.filter(s => {
            if (filterTag === "Запущенные") {
                if (!s.is_running) return false;
            } else if (filterTag === "Без тегов") {
                if (s.tags.length > 0) return false;
            } else if (filterTag === "Скрытые") {
                if (!s.is_hidden) return false;
            } else if (filterTag === "С тегами") {
                if (s.tags.length === 0) return false;
            } else if (filterTag !== "Все скрипты" && filterTag !== "Дерево" && filterTag !== "Хаб" && filterTag !== "") {
                if (!s.tags.includes(filterTag)) return false;
            } else {
                if (s.is_hidden && !showHidden) return false;
            }
            if (viewMode === "tree") {
                if (treeFilter === "tagged" && s.tags.length === 0) return false;
                if (treeFilter === "untagged" && s.tags.length > 0) return false;
                if (s.is_hidden && !showHidden) return false;
            } else {
                if (s.is_hidden) return false;
            }
            return true;
        });
        return list;
    }, [allScripts, filterTag, viewMode, treeFilter, showHidden]);

    const tree = useMemo(() => {
        const root: TreeNode = { name: "Root", fullName: "Root", scripts: [], children: {} };
        filtered.forEach(script => {
            const pathParts = script.path.split(/[\\\/]/);
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

    const toggleAll = useCallback(() => {
        const nextState = !isAllExpanded;
        const next: Record<string, boolean> = {};
        const traverse = (node: TreeNode) => {
            if (node.name !== "Root") next[node.fullName] = nextState;
            Object.values(node.children).forEach(traverse);
        };
        traverse(tree);
        setExpandedFolders(next);
        setIsAllExpanded(nextState);
    }, [isAllExpanded, tree]);

    return {
        // state
        loading, allScripts, filtered, tree,
        expandedFolders, isAllExpanded,
        editingScript, pendingScripts, removingTags,
        treeFilter, showHidden, allUniqueTags,
        popoverRef, folderRefs,
        // actions
        setTreeFilter, setShowHidden,
        toggleFolder, toggleAll,
        handleToggle, startEditing, stopEditing,
        addTag, removeTag, handleCustomMouseDown,
    };
}
