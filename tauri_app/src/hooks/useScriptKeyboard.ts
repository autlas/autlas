import { useMemo, useEffect, useCallback, startTransition } from "react";
import { Script } from "../api";
import { TreeNode } from "../types/script";
import { useTreeStore } from "../store/useTreeStore";

interface UseScriptKeyboardOptions {
    tree: TreeNode;
    filtered: Script[];
    groupedHub: { tag: string; scripts: Script[] }[] | null;
    filterTag: string;
    viewMode: "tree" | "tiles" | "list";
    searchQuery: string;
}

export function useScriptKeyboard({ tree, filtered, groupedHub, filterTag, viewMode, searchQuery }: UseScriptKeyboardOptions) {
    const expandedFolders = useTreeStore(s => s.expandedFolders);

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
        if (searchQuery.trim().length === 0) return;
        const next: Record<string, boolean> = {};
        const traverse = (node: TreeNode) => {
            if (node.name !== "Root") next[node.fullName] = true;
            Object.values(node.children).forEach(traverse);
        };
        traverse(tree);
        // Idempotency guard: skip the store write if all paths are already expanded.
        // Without this guard, if any downstream code recomputes `tree` identity in
        // response to expandedFolders changing, we end up in an infinite render loop.
        const current = useTreeStore.getState().expandedFolders;
        const allEqual = Object.keys(next).every(p => current[p] === true);
        if (!allEqual) {
            useTreeStore.getState().setExpandedFolders({ ...current, ...next });
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
                    Object.values(node.children)
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .forEach(traverse);

                    node.scripts.forEach(s => {
                        items.push({ path: s.path, type: 'script', data: s });
                    });
                }
            };
            traverse(tree);
        } else if (filterTag === "hub" && groupedHub) {
            // Скрипт может появиться в нескольких группах — scope-им навигационный
            // ключ через "groupTag::path", чтобы каждая карточка имела уникальный
            // фокус и vim-навигация ходила по дублям корректно.
            groupedHub.forEach(group => {
                items.push({ path: `tag-${group.tag}`, type: 'folder', data: group.tag });
                group.scripts.forEach(s => {
                    items.push({ path: `${group.tag}::${s.path}`, type: 'script', data: s });
                });
            });
        } else {
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

    return { isAllExpanded, toggleAll, setFolderExpansionRecursive, visibleItems, moveFocus };
}
