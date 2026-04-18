import { Script } from "../api";
import React from "react";

export interface TreeNode {
    name: string;
    fullName: string;
    is_hidden?: boolean;
    scripts: Script[];
    children: Record<string, TreeNode>;
}

export interface ScriptTreeProps {
    filterTag: string;
    onTagsLoaded: (tags: string[]) => void;
    viewMode: "tree" | "tiles" | "list";
    onViewModeChange: (mode: "tree" | "tiles" | "list") => void;
    onCustomDragStart: (script: { id: string, path: string, filename: string, tags: string[], x: number, y: number }) => void;
    isDragging: boolean;
    draggedScriptPath: string | null;
    onScriptContextMenu: (e: React.MouseEvent, script: Script) => void;
    onFolderContextMenu: (e: React.MouseEvent, folderData: { name: string, fullName: string, is_hidden: boolean, onExpandAll: () => void }) => void;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    onLoadingChange?: (loading: boolean) => void;
    onRunningCountChange?: (count: number) => void;
    contextMenu: { x: number, y: number, type: string, data: any } | null;
    onShowUI: (s: Script) => void;
    onRestart?: (s: Script) => void;
    refreshKey?: number;
    onScanComplete?: (timestamp: number, count?: number, durationMs?: number) => void;
    isPathsEmpty?: boolean;
    onAddPath?: () => void;
    onRemovePath?: (path: string) => void;
    scanPaths?: string[];
    onRefresh?: () => void;
    isRefreshing?: boolean;
    onOpenSettings?: () => void;
    onSelectScript?: (s: Script) => void;
    onExposeActions?: (actions: { toggle: (s: Script) => void; restart: (s: Script) => void; pendingScripts: Record<string, "run" | "kill" | "restart">; allScripts: Script[]; setTagIcon: (tag: string, iconName: string) => void; removeTagIcon: (tag: string) => void; deleteTagFromAll: (tag: string) => void; renameTag: (oldTag: string, newTag: string) => Promise<void>; toggleHiddenByPath: (path: string) => void }) => void;
    isDetailOpen?: boolean;
    onCloseDetail?: () => void;
    onDetailPinToggle?: () => void;
    isActive?: boolean;
}

export interface TagPickerProps {
    script: Script;
    allUniqueTags: string[];
    popoverRef: React.RefObject<HTMLDivElement | null>;
    onAdd: (script: Script, tag: string) => void;
    onClose: () => void;
    variant: "tree" | "hub";
    anchorRef?: React.RefObject<HTMLElement | null>;
}

export interface ScriptRowProps {
    s: Script;
    isDragging: boolean;
    draggedScriptPath: string | null;
    isEditing: boolean;
    isPending: boolean;
    pendingType?: "run" | "kill" | "restart" | null;
    isContextMenuOpen: boolean;
    removingTagKeys: string[];
    allUniqueTags: string[];
    popoverRef: React.RefObject<HTMLDivElement | null>;
    visibilityMode: 'none' | 'all' | 'only';
    onMouseDown: (e: React.MouseEvent, s: Script) => void;
    onDoubleClick: (s: Script) => void;
    onToggle: (s: Script) => void;
    onStartEditing: (s: Script) => void;
    onAddTag: (s: Script, tag: string) => void;
    onRemoveTag: (s: Script, tag: string) => void;
    onCloseEditing: () => void;
    onScriptContextMenu: (e: React.MouseEvent, script: Script) => void;
    onShowUI: (s: Script) => void;
    onRestart: (s: Script) => void;
    setFocusedPath: (path: string | null) => void;
    onSelectScript?: (s: Script) => void;
    /** Уникальный ключ для focused-state и DOM id. По умолчанию `s.path`.
     *  В Hub режиме скрипт может встречаться в нескольких группах — нужен scope. */
    focusKey?: string;
}

export interface HubScriptCardProps {
    s: Script;
    isDragging: boolean;
    draggedScriptPath: string | null;
    editingScript: string | null;
    isContextMenuOpen: boolean;
    pendingScripts: Record<string, "run" | "kill" | "restart">;
    removingTags: Set<string>;
    allUniqueTags: string[];
    popoverRef: React.RefObject<HTMLDivElement | null>;
    visibilityMode: 'none' | 'all' | 'only';
    onMouseDown: (e: React.MouseEvent, s: Script) => void;
    onToggle: (s: Script, force?: boolean) => void;
    onStartEditing: (s: Script) => void;
    onAddTag: (s: Script, tag: string) => void;
    onRemoveTag: (s: Script, tag: string) => void;
    onCloseEditing: () => void;
    onScriptContextMenu: (e: React.MouseEvent, s: Script) => void;
    onShowUI: (s: Script) => void;
    onRestart: (s: Script) => void;
    setFocusedPath: (path: string | null) => void;
    onSelectScript?: (s: Script) => void;
    focusKey?: string;
}
