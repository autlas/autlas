import { create } from "zustand";

interface TreeStore {
  // Expand/collapse state
  expandedFolders: Record<string, boolean>;
  setExpandedFolders: (folders: Record<string, boolean>) => void;
  toggleFolder: (path: string) => void;
  setFolderExpanded: (path: string, expanded: boolean) => void;

  // Focus
  focusedPath: string | null;
  setFocusedPath: (path: string | null) => void;

  // Vim mode
  isVimMode: boolean;
  setIsVimMode: (v: boolean) => void;

  // Pending scripts (run/kill/restart in progress)
  pendingScripts: Record<string, "run" | "kill" | "restart">;
  setPendingScript: (path: string, type: "run" | "kill" | "restart") => void;
  clearPendingScript: (path: string) => void;
  clearPendingScriptByNormPath: (normPath: string) => void;

  // Editing
  editingScript: string | null;
  setEditingScript: (path: string | null) => void;

  // Dragging
  isDragging: boolean;
  draggedScriptPath: string | null;
  setDragging: (isDragging: boolean, path?: string | null) => void;

  // Context menu
  contextMenu: { x: number; y: number; type: string; data: any } | null;
  setContextMenu: (menu: { x: number; y: number; type: string; data: any } | null) => void;

  // Show hidden
  showHidden: "none" | "all" | "only";
  setShowHidden: (v: "none" | "all" | "only") => void;

  // Selected script (detail panel)
  selectedPath: string | null;
  setSelectedPath: (path: string | null) => void;

  // Detail panel pinned
  detailPinned: boolean;
  setDetailPinned: (v: boolean) => void;
  toggleDetailPinned: () => void;

  // Folder animation durations
  folderDurations: Record<string, number>;
  setFolderDuration: (path: string, duration: number) => void;
  clearFolderDuration: (path: string) => void;

  // Removing tags animation
  removingTags: Set<string>;
  addRemovingTag: (key: string) => void;
  clearRemovingTag: (key: string) => void;

  // Show file size
  showFileSize: boolean;
  setShowFileSize: (v: boolean) => void;
  toggleShowFileSize: () => void;

  // Sidebar collapsed
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
  toggleSidebarCollapsed: () => void;

  // Sidebar width
  sidebarWidth: number;
  setSidebarWidth: (v: number) => void;

  // Tag icons
  tagIcons: Record<string, string>;
  setTagIcons: (icons: Record<string, string>) => void;
  setTagIcon: (tag: string, icon: string) => void;
  removeTagIcon: (tag: string) => void;

  // Icon cache (API-fetched SVG paths)
  iconCache: Record<string, [string, string]>;
  setIconCache: (cache: Record<string, [string, string]>) => void;
  addToIconCache: (name: string, paths: [string, string]) => void;
}

export const useTreeStore = create<TreeStore>((set) => ({
  // Expand/collapse
  expandedFolders: {},
  setExpandedFolders: (folders) => set({ expandedFolders: folders }),
  toggleFolder: (path) => set((s) => ({
    expandedFolders: { ...s.expandedFolders, [path]: s.expandedFolders[path] === false }
  })),
  setFolderExpanded: (path, expanded) => set((s) => ({
    expandedFolders: { ...s.expandedFolders, [path]: expanded }
  })),

  // Focus
  focusedPath: null,
  setFocusedPath: (path) => set({ focusedPath: path }),

  // Vim
  isVimMode: false,
  setIsVimMode: (v) => set({ isVimMode: v }),

  // Pending
  pendingScripts: {},
  setPendingScript: (path, type) => set((s) => ({
    pendingScripts: { ...s.pendingScripts, [path]: type }
  })),
  clearPendingScript: (path) => set((s) => {
    const next = { ...s.pendingScripts };
    delete next[path];
    return { pendingScripts: next };
  }),
  clearPendingScriptByNormPath: (normPath) => set((s) => {
    const key = Object.keys(s.pendingScripts).find(k => k.toLowerCase() === normPath);
    if (!key) return s;
    const next = { ...s.pendingScripts };
    delete next[key];
    return { pendingScripts: next };
  }),

  // Editing
  editingScript: null,
  setEditingScript: (path) => set({ editingScript: path }),

  // Dragging
  isDragging: false,
  draggedScriptPath: null,
  setDragging: (isDragging, path = null) => set({ isDragging, draggedScriptPath: path }),

  // Context menu
  contextMenu: null,
  setContextMenu: (menu) => set({ contextMenu: menu }),

  // Show hidden
  showHidden: "none",
  setShowHidden: (v) => set({ showHidden: v }),

  // Selected script
  selectedPath: null,
  setSelectedPath: (path) => set({ selectedPath: path }),

  // Detail pinned
  detailPinned: localStorage.getItem("ahk_detail_pinned") === "true",
  setDetailPinned: (v) => { localStorage.setItem("ahk_detail_pinned", String(v)); set({ detailPinned: v }); },
  toggleDetailPinned: () => set((s) => {
    const v = !s.detailPinned;
    localStorage.setItem("ahk_detail_pinned", String(v));
    return { detailPinned: v };
  }),

  // Folder durations
  folderDurations: {},
  setFolderDuration: (path, duration) => set((s) => ({
    folderDurations: { ...s.folderDurations, [path]: duration }
  })),
  clearFolderDuration: (path) => set((s) => {
    const next = { ...s.folderDurations };
    delete next[path];
    return { folderDurations: next };
  }),

  // Show file size
  showFileSize: localStorage.getItem("ahk_show_file_size") === "true",
  setShowFileSize: (v) => { localStorage.setItem("ahk_show_file_size", String(v)); set({ showFileSize: v }); },
  toggleShowFileSize: () => set((s) => {
    const v = !s.showFileSize;
    localStorage.setItem("ahk_show_file_size", String(v));
    return { showFileSize: v };
  }),

  // Sidebar collapsed
  sidebarCollapsed: localStorage.getItem("ahk_sidebar_collapsed") === "true",
  setSidebarCollapsed: (v) => { localStorage.setItem("ahk_sidebar_collapsed", String(v)); set({ sidebarCollapsed: v }); },
  toggleSidebarCollapsed: () => set((s) => {
    const v = !s.sidebarCollapsed;
    localStorage.setItem("ahk_sidebar_collapsed", String(v));
    return { sidebarCollapsed: v };
  }),

  // Sidebar width
  sidebarWidth: parseInt(localStorage.getItem("ahk_sidebar_width") ?? "288"),
  setSidebarWidth: (v) => { localStorage.setItem("ahk_sidebar_width", String(v)); set({ sidebarWidth: v }); },

  // Tag icons
  tagIcons: {},
  setTagIcons: (icons) => set({ tagIcons: icons }),
  setTagIcon: (tag, icon) => set((s) => ({ tagIcons: { ...s.tagIcons, [tag]: icon } })),
  removeTagIcon: (tag) => set((s) => {
    const next = { ...s.tagIcons };
    delete next[tag];
    return { tagIcons: next };
  }),

  // Icon cache
  iconCache: {},
  setIconCache: (cache) => set({ iconCache: cache }),
  addToIconCache: (name, paths) => set((s) => ({ iconCache: { ...s.iconCache, [name]: paths } })),

  // Removing tags
  removingTags: new Set(),
  addRemovingTag: (key) => set((s) => ({
    removingTags: new Set(s.removingTags).add(key)
  })),
  clearRemovingTag: (key) => set((s) => {
    const next = new Set(s.removingTags);
    next.delete(key);
    return { removingTags: next };
  }),
}));
