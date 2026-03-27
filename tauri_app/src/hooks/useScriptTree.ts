import { useState, useEffect, useMemo, useRef, useCallback, startTransition } from "react";
import React from "react";
import { useTranslation } from "react-i18next";
import { getScripts, Script, runScript, killScript } from "../api";
import { invoke } from "@tauri-apps/api/core";
import { TreeNode } from "../types/script";

const smoothScrollTo = (container: HTMLElement, target: number, duration: number) => {
    const start = container.scrollTop;
    const change = target - start;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const t = progress * (2 - progress); // easeOutQuad
        container.scrollTop = start + change * t;
        if (progress < 1) {
            requestAnimationFrame(animate);
        }
    };
    requestAnimationFrame(animate);
};

interface UseScriptTreeOptions {
    filterTag: string;
    onTagsLoaded: (tags: string[]) => void;
    onCustomDragStart: (script: { path: string, filename: string, tags: string[], x: number, y: number }) => void;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
}

export function useScriptTree({ filterTag, onTagsLoaded, onCustomDragStart, searchQuery, setSearchQuery }: UseScriptTreeOptions) {
    const { t } = useTranslation();
    const [allScripts, setAllScripts] = useState<Script[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
    const [editingScript, setEditingScript] = useState<string | null>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const [showHidden, setShowHidden] = useState(false);
    const [pendingScripts, setPendingScripts] = useState<Set<string>>(new Set());
    const [removingTags, setRemovingTags] = useState<Set<string>>(new Set());
    const [slowFolders, setSlowFolders] = useState<Set<string>>(new Set());

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
            startTransition(() => {
                setAllScripts(prev => {
                    if (prev.length !== data.length) return data;

                    const prevMap = new Map(prev.map(s => [s.path, s]));
                    let anyChanged = false;

                    const merged = data.map(d => {
                        const p = prevMap.get(d.path);
                        if (!p) return d;
                        if (p.is_running === d.is_running && p.is_hidden === d.is_hidden) return p;
                        anyChanged = true;
                        return { ...d, tags: p.tags };
                    });

                    return anyChanged ? merged : prev;
                });
            });
        } catch (e) {
            // silence
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const systemTagNames = ["hub", "fav", "favourites"];
        const filteredScripts = allScripts.map(s => ({
            ...s,
            tags: s.tags.filter(t => !systemTagNames.includes(t.toLowerCase()))
        }));

        const tagsKey = filteredScripts.flatMap(s => s.tags).sort().join(',');
        if (tagsKey !== lastTagsKeyRef.current) {
            lastTagsKeyRef.current = tagsKey;
            const tags = new Set<string>();
            filteredScripts.forEach(s => s.tags.forEach(t => tags.add(t)));
            onTagsLoaded(Array.from(tags).sort());
        }
    }, [allScripts, onTagsLoaded]);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 3000);

        let unlisten: (() => void) | null = null;
        import('@tauri-apps/api/event').then(({ listen }) => {
            listen<{ path: string; tags: string[] }>('script-tags-changed', (event) => {
                const { path, tags } = event.payload;
                setAllScripts(prev => prev.map(s =>
                    s.path === path ? { ...s, tags } : s
                ));
            }).then(fn => { unlisten = fn; });
        });

        return () => {
            clearInterval(interval);
            if (unlisten) unlisten();
        };
    }, []);

    const toggleFolder = useCallback((path: string) => {
        let isSlow = false;
        const header = folderRefs.current.get(path);
        if (header) {
            const container = header.closest('.overflow-y-auto');
            if (container instanceof HTMLElement) {
                const rect = header.getBoundingClientRect();
                const containerRect = container.getBoundingClientRect();
                if (rect.top < containerRect.top) {
                    isSlow = true;
                }
            }
        }

        if (isSlow) {
            setSlowFolders(prev => new Set(prev).add(path));
            setTimeout(() => {
                setSlowFolders(prev => {
                    const next = new Set(prev);
                    next.delete(path);
                    return next;
                });
            }, 600);
        }

        setExpandedFolders(prev => {
            const isCurrentlyExpanded = prev[path] !== false;
            return { ...prev, [path]: !isCurrentlyExpanded };
        });

        requestAnimationFrame(() => {
            const h = folderRefs.current.get(path);
            if (h) {
                const container = h.closest('.overflow-y-auto');
                if (container instanceof HTMLElement) {
                    const rect = h.getBoundingClientRect();
                    const containerRect = container.getBoundingClientRect();
                    if (rect.top < containerRect.top) {
                        const target = container.scrollTop + (rect.top - containerRect.top);
                        smoothScrollTo(container, target, isSlow ? 500 : 150);
                    }
                }
            }
        });
    }, []);

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
    }, [pendingScripts, stopBurst]);

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
        let list = [...allScripts];
        if (filterTag === "hub") {
            return list.filter(s => s.is_running || s.tags.some(t => t.toLowerCase() === "hub" || t.toLowerCase() === "fav" || t.toLowerCase() === "favourites"));
        }

        list = list.filter(s => {
            if (filterTag === "running") {
                if (!s.is_running) return false;
            } else if (filterTag === "no_tags") {
                if (s.tags.length > 0) return false;
            } else if (filterTag === "hidden") {
                if (!s.is_hidden) return false;
            } else if (filterTag === "tags") {
                if (s.tags.length === 0) return false;
            } else if (filterTag !== "all" && filterTag !== "all_scripts" && filterTag !== "tree" && filterTag !== "hub" && filterTag !== "") {
                if (!s.tags.includes(filterTag)) return false;
            }

            if (!showHidden && s.is_hidden) return false;

            const rawQuery = searchQuery.trim().toLowerCase();
            if (rawQuery) {
                if (rawQuery.startsWith("file:")) {
                    const q = rawQuery.replace("file:", "").trim();
                    if (q) {
                        const matchesName = s.filename.toLowerCase().includes(q);
                        if (!matchesName) return false;
                    }
                } else if (rawQuery.startsWith("path:")) {
                    const q = rawQuery.replace("path:", "").trim();
                    if (q) {
                        const folderPath = s.path.toLowerCase().replace(s.filename.toLowerCase(), "");
                        if (!folderPath.includes(q)) return false;
                    }
                } else {
                    const matchesName = s.filename.toLowerCase().includes(rawQuery);
                    const matchesPath = s.path.toLowerCase().includes(rawQuery);
                    if (!matchesName && !matchesPath) return false;
                }
            }

            return true;
        });
        return list.sort((a, b) => a.filename.localeCompare(b.filename));
    }, [allScripts, filterTag, showHidden, searchQuery]);

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

        const compact = (node: TreeNode): TreeNode => {
            const childKeys = Object.keys(node.children);
            for (const key of childKeys) {
                node.children[key] = compact(node.children[key]);
            }
            if (node.name !== "Root" && childKeys.length === 1 && node.scripts.length === 0) {
                const child = node.children[childKeys[0]];
                return {
                    ...child,
                    name: `${node.name}|${child.name}`
                };
            }
            return node;
        };

        return compact(root);
    }, [filtered]);

    const groupedHub = useMemo(() => {
        if (filterTag !== "hub") return null;
        const systemTags = ["hub", "fav", "favourites"];
        const groups: Record<string, Script[]> = {};
        const scriptsWithoutTags: Script[] = [];
        filtered.forEach(s => {
            const userTags = s.tags.filter(t => !systemTags.includes(t.toLowerCase()));
            if (userTags.length === 0) {
                scriptsWithoutTags.push(s);
            } else {
                userTags.forEach(tag => {
                    if (!groups[tag]) groups[tag] = [];
                    groups[tag].push(s);
                });
            }
        });
        const sortedTags = Object.keys(groups).sort((a, b) => a.localeCompare(b));
        const result: { tag: string; scripts: Script[] }[] = sortedTags.map(tag => ({
            tag,
            scripts: groups[tag].sort((a, b) => a.filename.localeCompare(b.filename))
        }));
        if (scriptsWithoutTags.length > 0) {
            result.push({
                tag: t("hub.general", "General"),
                scripts: scriptsWithoutTags.sort((a, b) => a.filename.localeCompare(b.filename))
            });
        }
        return result;
    }, [filtered, filterTag]);

    const allFolderPaths = useMemo(() => {
        const paths: string[] = [];
        const traverse = (node: TreeNode) => {
            if (node.name !== "Root") paths.push(node.fullName);
            Object.values(node.children).forEach(traverse);
        };
        traverse(tree);
        return paths;
    }, [tree]);

    const isAllExpanded = useMemo(() => {
        if (allFolderPaths.length === 0) return true;
        return allFolderPaths.every(path => expandedFolders[path] !== false);
    }, [allFolderPaths, expandedFolders]);

    useEffect(() => {
        if (searchQuery.trim().length > 0) {
            const next: Record<string, boolean> = {};
            const traverse = (node: TreeNode) => {
                if (node.name !== "Root") next[node.fullName] = true;
                Object.values(node.children).forEach(traverse);
            };
            traverse(tree);
            setExpandedFolders(next);
        }
    }, [searchQuery, tree]);

    const toggleAll = useCallback(() => {
        const nextState = !isAllExpanded;
        const next: Record<string, boolean> = {};
        allFolderPaths.forEach(path => {
            next[path] = nextState;
        });
        setExpandedFolders(next);
    }, [isAllExpanded, allFolderPaths]);

    const setFolderExpansionRecursive = useCallback((node: TreeNode, expanded: boolean) => {
        setExpandedFolders(prev => {
            const next = { ...prev };
            const traverse = (n: TreeNode) => {
                if (n.name !== "Root") next[n.fullName] = expanded;
                Object.values(n.children).forEach(traverse);
            };
            traverse(node);
            return next;
        });
    }, []);

    return {
        loading, allScripts, filtered, tree, groupedHub,
        expandedFolders, isAllExpanded, slowFolders,
        editingScript, pendingScripts, removingTags,
        showHidden, allUniqueTags, searchQuery,
        popoverRef, folderRefs,
        setShowHidden, setSearchQuery,
        toggleFolder, toggleAll, setFolderExpansionRecursive,
        handleToggle, startEditing, stopEditing,
        addTag, removeTag, handleCustomMouseDown,
    };
}
