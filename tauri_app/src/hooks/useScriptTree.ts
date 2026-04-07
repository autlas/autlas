import { useEffect, useRef, useCallback } from "react";
import React from "react";
import { Script } from "../api";
import { useTreeStore } from "../store/useTreeStore";
import { useScriptData, __resetCachedScripts } from "./useScriptData";
import { useScriptFilter } from "./useScriptFilter";
import { useScriptActions } from "./useScriptActions";
import { useScriptKeyboard } from "./useScriptKeyboard";

export { __resetCachedScripts };

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
    onCustomDragStart: (script: { id: string, path: string, filename: string, tags: string[], x: number, y: number }) => void;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    onRunningCountChange?: (count: number) => void;
    refreshKey?: number;
    onScanComplete?: (timestamp: number) => void;
    viewMode: "tree" | "tiles" | "list";
    sortBy: "name" | "size" | "created" | "modified" | "last_run";
}

export function useScriptTree({ filterTag, onTagsLoaded, onCustomDragStart, searchQuery, setSearchQuery, onRunningCountChange, refreshKey, onScanComplete, viewMode, sortBy }: UseScriptTreeOptions) {
    const editingScript = useTreeStore(s => s.editingScript);
    const popoverRef = useRef<HTMLDivElement>(null);

    const folderRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    const pendingDragRef = useRef<{ script: Script, x: number, y: number } | null>(null);
    const dragTimerRef = useRef<number | null>(null);

    // ----- Data: fetching, listeners, allScripts state -----
    const data = useScriptData({ onTagsLoaded, onRunningCountChange, refreshKey, onScanComplete });
    const { allScripts, setAllScripts, loading, isFetching, error, burstIntervalsRef, toggleHiddenByPath } = data;

    // ----- Filtering: filtered list, tree, groupedHub, allUniqueTags -----
    const { filtered, tree, groupedHub, allUniqueTags } = useScriptFilter({
        allScripts, filterTag, searchQuery, sortBy
    });

    // ----- Actions: tag ops, run/kill/restart, edit state -----
    const actions = useScriptActions({ setAllScripts, burstIntervalsRef });

    // ----- Keyboard / navigation: visibleItems, moveFocus, expansion -----
    const keyboard = useScriptKeyboard({
        tree, filtered, groupedHub, filterTag, viewMode, searchQuery
    });

    // Click outside to close edit popover (kept here because it owns popoverRef)
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (editingScript && popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
                useTreeStore.getState().setEditingScript(null);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [editingScript]);

    // toggleFolder: scroll-aware folder expansion (uses folderRefs ref)
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

    // Custom drag handling (kept in main hook — uses pendingDragRef + onCustomDragStart prop)
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
                    id: pendingDragRef.current.script.id,
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

    return {
        loading, isFetching, error, allScripts, filtered, tree, groupedHub,
        isAllExpanded: keyboard.isAllExpanded, allUniqueTags, searchQuery,
        popoverRef, folderRefs,
        setSearchQuery,
        toggleFolder,
        toggleAll: keyboard.toggleAll,
        setFolderExpansionRecursive: keyboard.setFolderExpansionRecursive,
        handleToggle: actions.handleToggle,
        handleRestart: actions.handleRestart,
        startEditing: actions.startEditing,
        stopEditing: actions.stopEditing,
        addTag: actions.addTag,
        removeTag: actions.removeTag,
        handleCustomMouseDown,
        visibleItems: keyboard.visibleItems,
        moveFocus: keyboard.moveFocus,
        setTagIcon: actions.setTagIcon,
        removeTagIcon: actions.removeTagIcon,
        deleteTagFromAll: actions.deleteTagFromAll,
        renameTag: actions.renameTag,
        toggleHiddenByPath
    };
}
