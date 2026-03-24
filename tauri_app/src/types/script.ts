import { Script } from "../api";
import React from "react";

export interface TreeNode {
    name: string;
    fullName: string;
    scripts: Script[];
    children: Record<string, TreeNode>;
}

export interface ScriptTreeProps {
    filterTag: string;
    onTagsLoaded: (tags: string[]) => void;
    viewMode: "tree" | "hub";
    onCustomDragStart: (script: { path: string, filename: string, tags: string[], x: number, y: number }) => void;
    isDragging: boolean;
    draggedScriptPath: string | null;
    animationsEnabled: boolean;
    onScriptContextMenu: (e: React.MouseEvent, script: Script) => void;
}

export interface TagPickerProps {
    script: Script;
    allUniqueTags: string[];
    popoverRef: React.RefObject<HTMLDivElement | null>;
    onAdd: (script: Script, tag: string) => void;
    onClose: () => void;
    variant: "tree" | "hub";
}

export interface ScriptRowProps {
    s: Script;
    isDragging: boolean;
    draggedScriptPath: string | null;
    isEditing: boolean;
    isPending: boolean;
    removingTagKeys: string[];
    allUniqueTags: string[];
    popoverRef: React.RefObject<HTMLDivElement | null>;
    onMouseDown: (e: React.MouseEvent, s: Script) => void;
    onDoubleClick: (s: Script) => void;
    onToggle: (s: Script) => void;
    onStartEditing: (s: Script) => void;
    onAddTag: (s: Script, tag: string) => void;
    onRemoveTag: (s: Script, tag: string) => void;
    onCloseEditing: () => void;
    onScriptContextMenu: (e: React.MouseEvent, script: Script) => void;
}

export interface HubScriptCardProps {
    s: Script;
    isDragging: boolean;
    draggedScriptPath: string | null;
    editingScript: string | null;
    pendingScripts: Set<string>;
    removingTags: Set<string>;
    allUniqueTags: string[];
    popoverRef: React.RefObject<HTMLDivElement | null>;
    onMouseDown: (e: React.MouseEvent, s: Script) => void;
    onToggle: (s: Script, force?: boolean) => void;
    onStartEditing: (s: Script) => void;
    onAddTag: (s: Script, tag: string) => void;
    onRemoveTag: (s: Script, tag: string) => void;
    onCloseEditing: () => void;
    onScriptContextMenu: (e: React.MouseEvent, s: Script) => void;
}
