import { useState, useEffect, useMemo, useRef, useCallback, startTransition } from "react";
import React from "react";
import { useTranslation } from "react-i18next";
import { getScripts, Script, runScript, killScript } from "../api";
import { invoke } from "@tauri-apps/api/core";
import { TreeNode } from "../types/script";
import { useTreeStore } from "../store/useTreeStore";

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

let _cachedScripts: Script[] = [];

interface UseScriptTreeOptions {
    filterTag: string;
    onTagsLoaded: (tags: string[]) => void;
    onCustomDragStart: (script: { path: string, filename: string, tags: string[], x: number, y: number }) => void;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    onRunningCountChange?: (count: number) => void;
    refreshKey?: number;
    onScanComplete?: (timestamp: number) => void;
    viewMode: "tree" | "tiles" | "list";
    sortBy: "name" | "size";
}

export function useScriptTree({ filterTag, onTagsLoaded, onCustomDragStart, searchQuery, setSearchQuery, onRunningCountChange, refreshKey, onScanComplete, viewMode, sortBy }: UseScriptTreeOptions) {
    const { t } = useTranslation();
    const [allScripts, setAllScripts] = useState<Script[]>(_cachedScripts);
    const [loading, setLoading] = useState(_cachedScripts.length === 0);
    const [isFetching, setIsFetching] = useState(false);
    const expandedFolders = useTreeStore(s => s.expandedFolders);
    const editingScript = useTreeStore(s => s.editingScript);
    const popoverRef = useRef<HTMLDivElement>(null);
    const showHidden = useTreeStore(s => s.showHidden);
    const pendingScripts = useTreeStore(s => s.pendingScripts);
    const removingTags = useTreeStore(s => s.removingTags);

    const pendingDragRef = useRef<{ script: Script, x: number, y: number } | null>(null);
    const dragTimerRef = useRef<number | null>(null);
    const folderRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    const lastTagsKeyRef = useRef<string>('');
    const storeSetTagIcons = useTreeStore(s => s.setTagIcons);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (editingScript && popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
                useTreeStore.getState().setEditingScript(null);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [editingScript]);

    const fetchData = async (forceScan = false) => {
        setIsFetching(true);
        try {
            const t0 = performance.now();
            const data = await getScripts(forceScan);
            console.log(`[Scan] ${forceScan ? 'Full scan' : 'Cache load'}: ${data.length} scripts in ${(performance.now() - t0).toFixed(0)}ms`);
            _cachedScripts = data;
            if (forceScan && onScanComplete) {
                onScanComplete(Date.now());
            }
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
        } catch (e) {
            // silence
        } finally {
            setLoading(false);
            setIsFetching(false);
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

    }, [allScripts, onTagsLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

    const onRunningCountChangeRef = useRef(onRunningCountChange);
    onRunningCountChangeRef.current = onRunningCountChange;

    useEffect(() => {
        onRunningCountChangeRef.current?.(allScripts.filter(s => s.is_running).length);
    }, [allScripts]);

    useEffect(() => {
        invoke<Record<string, string>>("get_tag_icons").then(storeSetTagIcons).catch(() => {});
    }, [storeSetTagIcons]);

    const setTagIcon = useCallback(async (tag: string, iconName: string) => {
        useTreeStore.getState().setTagIcon(tag, iconName);
        try {
            await invoke("save_tag_icon", { tag, icon: iconName });
        } catch (e) {
            console.error(e);
        }
    }, []);

    const removeTagIcon = useCallback(async (tag: string) => {
        useTreeStore.getState().removeTagIcon(tag);
        try {
            await invoke("save_tag_icon", { tag, icon: "" });
        } catch (e) {
            console.error(e);
        }
    }, []);

    useEffect(() => {
        fetchData();

        let unlisten: (() => void) | null = null;
        let unlistenStatus: (() => void) | null = null;

        import('@tauri-apps/api/event').then(({ listen }) => {
            listen<{ path: string; tags: string[] }>('script-tags-changed', (event) => {
                const { path, tags } = event.payload;
                setAllScripts(prev => prev.map(s =>
                    s.path === path ? { ...s, tags } : s
                ));
            }).then(fn => { unlisten = fn; });

            listen<{ path: string; is_running: boolean; has_ui: boolean }>('script-status-changed', (event) => {
                const { path, is_running, has_ui } = event.payload;
                const pathLower = path.toLowerCase();
                startTransition(() => {
                    setAllScripts(prev => {
                        const target = prev.find(s => s.path.toLowerCase() === pathLower);
                        if (!target) return prev;
                        const newHasUi = is_running ? has_ui : false;
                        if (target.is_running === is_running && target.has_ui === newHasUi) {
                            return prev;
                        }
                        return prev.map(s =>
                            s.path.toLowerCase() === pathLower
                                ? { ...s, is_running, has_ui: newHasUi }
                                : s
                        );
                    });
                });
                {
                    const store = useTreeStore.getState();
                    const key = Object.keys(store.pendingScripts).find(k => k.toLowerCase() === pathLower);
                    if (key) {
                        const pending = store.pendingScripts[key];
                        const shouldClear =
                            (pending === "run" && is_running) ||
                            (pending === "kill" && !is_running) ||
                            (pending === "restart" && is_running);
                        if (shouldClear) store.clearPendingScript(key);
                    }
                }
            }).then(fn => { unlistenStatus = fn; });
        });

        return () => {
            if (unlisten) unlisten();
            if (unlistenStatus) unlistenStatus();
        };
    }, []);

    // Re-scan when refreshKey changes (scan paths updated or manual refresh)
    const prevRefreshKey = useRef(refreshKey);
    useEffect(() => {
        if (refreshKey !== undefined && refreshKey !== prevRefreshKey.current) {
            prevRefreshKey.current = refreshKey;
            fetchData(true);
        }
    }, [refreshKey]);

    const toggleFolder = useCallback((path: string) => {
        let collapseDuration = 150;
        let scrollDuration = 150;
        const header = folderRefs.current.get(path);

        if (header) {
            const container = header.closest('.overflow-y-auto');
            if (container instanceof HTMLElement) {
                const rect = header.getBoundingClientRect();
                const containerRect = container.getBoundingClientRect();
                if (rect.top < containerRect.top) {
                    const distance = containerRect.top - rect.top;
                    const screens = distance / containerRect.height;
                    collapseDuration = Math.min(1000, 300 + screens * 300);
                    scrollDuration = collapseDuration * 0.3;
                }
            }
        }

        if (collapseDuration > 150) {
            useTreeStore.getState().setFolderDuration(path, collapseDuration);
            setTimeout(() => {
                useTreeStore.getState().clearFolderDuration(path);
            }, collapseDuration + 100);
        }

        useTreeStore.getState().toggleFolder(path);

        if (collapseDuration > 150) {
            requestAnimationFrame(() => {
                const h = folderRefs.current.get(path);
                if (h) {
                    const container = h.closest('.overflow-y-auto');
                    if (container instanceof HTMLElement) {
                        const rect = h.getBoundingClientRect();
                        const containerRect = container.getBoundingClientRect();
                        if (rect.top < containerRect.top) {
                            const target = container.scrollTop + (rect.top - containerRect.top);
                            smoothScrollTo(container, target, scrollDuration);
                        }
                    }
                }
            });
        }
    }, []);

    const clearPending = useCallback((path: string) => {
        useTreeStore.getState().clearPendingScript(path);
    }, []);

    const startBurst = useCallback((path: string, expectedRunning: boolean) => {
        let attempts = 0;
        const id = setInterval(async () => {
            attempts++;
            try {
                const status = await invoke<{ is_running: boolean; has_ui: boolean }>("get_script_status", { path });
                if (status.is_running === expectedRunning) {
                    clearInterval(id);
                    clearPending(path);
                    setAllScripts(prev => prev.map(s =>
                        s.path === path
                            ? { ...s, is_running: status.is_running, has_ui: status.is_running ? status.has_ui : false }
                            : s
                    ));
                } else if (attempts >= 33) {
                    clearInterval(id);
                    clearPending(path);
                }
            } catch {
                clearInterval(id);
                clearPending(path);
            }
        }, 300);
    }, [clearPending]);

    const handleToggle = useCallback(async (script: Script, force?: boolean) => {
        if (pendingScripts[script.path]) return;
        const type = script.is_running ? "kill" : "run";
        useTreeStore.getState().setPendingScript(script.path, type);
        try {
            if (script.is_running && !force) {
                await killScript(script.path);
            } else {
                await runScript(script.path);
            }
            startBurst(script.path, !script.is_running);
        } catch (e) {
            console.error(e);
            clearPending(script.path);
        }
    }, [pendingScripts, startBurst, clearPending]);

    const handleRestart = useCallback(async (script: Script) => {
        if (pendingScripts[script.path]) return;
        useTreeStore.getState().setPendingScript(script.path, "restart");
        try {
            await invoke("restart_script", { path: script.path });
            startBurst(script.path, true);
        } catch (e) {
            console.error(e);
            clearPending(script.path);
        }
    }, [pendingScripts, startBurst, clearPending]);

    const stopEditing = useCallback(() => useTreeStore.getState().setEditingScript(null), []);
    const startEditing = useCallback((s: Script) => useTreeStore.getState().setEditingScript(s.path), []);

    const allUniqueTags = useMemo(() => {
        const tags = new Set<string>();
        allScripts.forEach(s => s.tags.forEach(t => tags.add(t)));
        return Array.from(tags).sort();
    }, [allScripts]);

    const addTag = useCallback(async (script: Script, newTag: string) => {
        const trimmed = newTag.trim();
        if (!trimmed) return;
        if (script.tags.includes(trimmed)) {
            useTreeStore.getState().setEditingScript(null);
            return;
        }
        const updatedTags = [...script.tags, trimmed];
        setAllScripts(prev => prev.map(s => s.path === script.path ? { ...s, tags: updatedTags } : s));
        useTreeStore.getState().setEditingScript(null);
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
        useTreeStore.getState().addRemovingTag(tagId);
        await new Promise(r => setTimeout(r, 90));
        const newTags = script.tags.filter(t => t !== tagToRemove);
        setAllScripts(prev => prev.map(s => s.path === script.path ? { ...s, tags: newTags } : s));
        useTreeStore.getState().clearRemovingTag(tagId);
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
        const rawQuery = searchQuery.trim().toLowerCase();
        const hubTags = new Set(["hub", "fav", "favourites"]);

        const applySearch = (list: Script[]) => {
            if (!rawQuery) return list;
            if (rawQuery.startsWith("file:")) {
                const q = rawQuery.slice(5).trim();
                return q ? list.filter(s => s.filename.toLowerCase().includes(q)) : list;
            }
            if (rawQuery.startsWith("path:")) {
                const q = rawQuery.slice(5).trim();
                return q ? list.filter(s => s.path.toLowerCase().replace(s.filename.toLowerCase(), "").includes(q)) : list;
            }
            return list.filter(s => s.filename.toLowerCase().includes(rawQuery) || s.path.toLowerCase().includes(rawQuery));
        };

        const sortList = (list: Script[]) => {
            if (sortBy === "size") return list.sort((a, b) => b.size - a.size);
            return list.sort((a, b) => a.filename.localeCompare(b.filename));
        };

        if (filterTag === "hub") {
            return applySearch(allScripts.filter(s => s.is_running || s.tags.some(t => hubTags.has(t.toLowerCase()))));
        }

        let list = allScripts.filter(s => {
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

            if (showHidden === 'none' && s.is_hidden) return false;
            if (showHidden === 'only' && !s.is_hidden) return false;

            return true;
        });

        return sortList(applySearch(list));
    }, [allScripts, filterTag, showHidden, searchQuery, sortBy]);

    const prevTreeRef = useRef<TreeNode | null>(null);

    const tree = useMemo(() => {
        const scriptSort = sortBy === "size"
            ? (a: Script, b: Script) => b.size - a.size
            : (a: Script, b: Script) => a.filename.localeCompare(b.filename);

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
            node.scripts.sort(scriptSort);
            const childKeys = Object.keys(node.children);
            for (const key of childKeys) {
                node.children[key] = compact(node.children[key]);
            }

            // Calculate is_hidden: true if all scripts and all children are is_hidden
            const scriptsHidden = node.scripts.length > 0 && node.scripts.every(s => s.is_hidden);
            const childrenHidden = childKeys.length > 0 && Object.values(node.children).every(c => c.is_hidden);

            if (node.scripts.length > 0 && childKeys.length > 0) {
                node.is_hidden = scriptsHidden && childrenHidden;
            } else if (node.scripts.length > 0) {
                node.is_hidden = scriptsHidden;
            } else if (childKeys.length > 0) {
                node.is_hidden = childrenHidden;
            } else {
                node.is_hidden = false;
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

        const newTree = compact(root);

        // Stabilize node references: reuse previous node objects where structure is identical
        // This makes React.memo in TreeNodeRenderer skip re-renders for unchanged subtrees
        const prev = prevTreeRef.current;
        if (prev) {
            const stabilize = (newNode: TreeNode, oldNode: TreeNode): TreeNode => {
                // Check if scripts are identical (same paths in same order)
                let scriptsMatch = newNode.scripts.length === oldNode.scripts.length &&
                    newNode.scripts.every((s, i) => {
                        const o = oldNode.scripts[i];
                        return s.path === o.path && s.is_running === o.is_running && s.has_ui === o.has_ui &&
                            s.tags.length === o.tags.length && s.tags.every((t, j) => t === o.tags[j]) &&
                            s.is_hidden === o.is_hidden && s.size === o.size;
                    });

                // Stabilize children recursively
                const newChildKeys = Object.keys(newNode.children);
                const oldChildKeys = Object.keys(oldNode.children);
                let childrenMatch = newChildKeys.length === oldChildKeys.length;

                if (childrenMatch) {
                    for (const key of newChildKeys) {
                        if (oldNode.children[key]) {
                            newNode.children[key] = stabilize(newNode.children[key], oldNode.children[key]);
                            if (newNode.children[key] !== oldNode.children[key]) childrenMatch = false;
                        } else {
                            childrenMatch = false;
                        }
                    }
                }

                // If everything matches, reuse old node reference entirely
                if (scriptsMatch && childrenMatch && newNode.name === oldNode.name &&
                    newNode.is_hidden === oldNode.is_hidden) {
                    return oldNode;
                }
                return newNode;
            };
            const stabilized = stabilize(newTree, prev);
            prevTreeRef.current = stabilized;
            return stabilized;
        }

        prevTreeRef.current = newTree;
        return newTree;
    }, [filtered, showHidden, sortBy]);

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
            scripts: groups[tag].sort(sortBy === "size" ? (a, b) => b.size - a.size : (a, b) => a.filename.localeCompare(b.filename))
        }));
        if (scriptsWithoutTags.length > 0) {
            result.push({
                tag: t("hub.other", "other"),
                scripts: scriptsWithoutTags.sort(sortBy === "size" ? (a, b) => b.size - a.size : (a, b) => a.filename.localeCompare(b.filename))
            });
        }
        return result;
    }, [filtered, filterTag, sortBy]);

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
            useTreeStore.getState().setExpandedFolders(next);
        }
    }, [searchQuery, tree]);

    const toggleAll = useCallback(() => {
        const nextState = !isAllExpanded;
        const next: Record<string, boolean> = {};
        allFolderPaths.forEach(path => {
            next[path] = nextState;
        });
        startTransition(() => {
            useTreeStore.getState().setExpandedFolders(next);
        });
    }, [isAllExpanded, allFolderPaths]);

    const setFolderExpansionRecursive = useCallback((node: TreeNode, expanded: boolean) => {
        startTransition(() => {
            const prev = useTreeStore.getState().expandedFolders;
            const next = { ...prev };
            const traverse = (n: TreeNode) => {
                if (n.name !== "Root") next[n.fullName] = expanded;
                Object.values(n.children).forEach(traverse);
            };
            traverse(node);
            useTreeStore.getState().setExpandedFolders(next);
        });
    }, []);

    const visibleItems = useMemo(() => {
        const items: { path: string, type: 'folder' | 'script', data?: any }[] = [];

        if (viewMode === "tree") {
            const traverse = (node: TreeNode) => {
                if (node.name !== "Root") {
                    items.push({ path: node.fullName, type: 'folder', data: node });
                }
                const isExpanded = node.name === "Root" || expandedFolders[node.fullName] !== false;
                if (isExpanded) {
                    // First traverse children folders to match ScriptTree.tsx rendering order
                    Object.values(node.children)
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .forEach(traverse);

                    // Then add scripts in current folder (already sorted in tree build)
                    node.scripts.forEach(s => {
                            items.push({ path: s.path, type: 'script', data: s });
                        });
                }
            };
            traverse(tree);
        } else if (filterTag === "hub" && groupedHub) {
            groupedHub.forEach(group => {
                // Add the tag header as a navigation marker (will be skipped by Vim focus logic)
                items.push({ path: `tag-${group.tag}`, type: 'folder', data: group.tag });

                group.scripts.forEach(s => {
                    items.push({ path: s.path, type: 'script', data: s });
                });
            });
        } else {
            // list or tiles view for local scripts: use the flat sorted filtered list
            filtered.forEach(s => {
                items.push({ path: s.path, type: 'script', data: s });
            });
        }
        return items;
    }, [tree, expandedFolders, groupedHub, filterTag, viewMode, filtered]);

    const moveFocus = useCallback((direction: 'up' | 'down' | 'left' | 'right', cols: number = 1) => {
        useTreeStore.getState().setIsVimMode(true);
        const prev = useTreeStore.getState().focusedPath;
        if (visibleItems.length === 0) { useTreeStore.getState().setFocusedPath(null); return; }

        const isNavigable = (item: { path: string, type: 'folder' | 'script' }) =>
            item.type === 'script' || (item.type === 'folder' && !item.path.startsWith('tag-'));
        const getInitial = () => visibleItems.find(isNavigable)?.path ?? null;

        if (!prev) { useTreeStore.getState().setFocusedPath(getInitial()); return; }
        const idx = visibleItems.findIndex(item => item.path === prev);
        if (idx === -1) { useTreeStore.getState().setFocusedPath(getInitial()); return; }

        let nextIdx = idx;
        const len = visibleItems.length;

        if (direction === 'down') {
            const step = (cols > 1) ? cols : 1;
            const startFrom = (idx + step) % len;
            for (let i = 0; i < len; i++) { const ci = (startFrom + i) % len; if (isNavigable(visibleItems[ci]) && (ci !== idx || len <= 1)) { nextIdx = ci; break; } }
        } else if (direction === 'up') {
            const step = (cols > 1) ? cols : 1;
            const startFrom = (idx - step + len) % len;
            for (let i = 0; i < len; i++) { const ci = (startFrom - i + len) % len; if (isNavigable(visibleItems[ci]) && (ci !== idx || len <= 1)) { nextIdx = ci; break; } }
        } else if (direction === 'right') {
            const startFrom = (idx + 1) % len;
            for (let i = 0; i < len; i++) { const ci = (startFrom + i) % len; if (isNavigable(visibleItems[ci]) && (ci !== idx || len <= 1)) { nextIdx = ci; break; } }
        } else if (direction === 'left') {
            const startFrom = (idx - 1 + len) % len;
            for (let i = 0; i < len; i++) { const ci = (startFrom - i + len) % len; if (isNavigable(visibleItems[ci]) && (ci !== idx || len <= 1)) { nextIdx = ci; break; } }
        }

        useTreeStore.getState().setFocusedPath(visibleItems[nextIdx].path);
    }, [visibleItems]);

    return {
        loading, isFetching, allScripts, filtered, tree, groupedHub,
        isAllExpanded, allUniqueTags, searchQuery,
        popoverRef, folderRefs,
        setSearchQuery,
        toggleFolder, toggleAll, setFolderExpansionRecursive,
        handleToggle, handleRestart, startEditing, stopEditing,
        addTag, removeTag, handleCustomMouseDown,
        visibleItems, moveFocus,
        setTagIcon, removeTagIcon
    };
}
