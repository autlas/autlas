import { create } from "zustand";
import { safeSetItem } from "../utils/safeStorage";
import { DETAIL_PANEL_DEFAULT_WIDTH } from "../constants/layout";

type DraggedScript = { id: string; path: string; filename: string; tags: string[] } | null;

interface TreeStore {
  // Drag state (ephemeral)
  draggedScript: DraggedScript;
  setDraggedScript: (s: DraggedScript) => void;
  draggedTag: string | null;
  setDraggedTag: (t: string | null) => void;
  dragOverTag: string | null;
  setDragOverTag: (t: string | null) => void;
  clearDragState: () => void;

  // Tag editing UI state (ephemeral)
  isCreatingTagFor: DraggedScript;
  setIsCreatingTagFor: (s: DraggedScript) => void;
  isRenamingTag: string | null;
  setIsRenamingTag: (t: string | null) => void;
  editTagName: string;
  setEditTagName: (v: string) => void;
  newTagName: string;
  setNewTagName: (v: string) => void;
  activeTabPressed: string | null;
  setActiveTabPressed: (t: string | null) => void;

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

  // Modal menus that should suppress global vim hotkeys
  modalOpen: boolean;
  setModalOpen: (v: boolean) => void;
  cheatsheetOpen: boolean;
  setCheatsheetOpen: (v: boolean) => void;

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

  // Sort mode (for display in cards)
  sortBy: "name" | "size" | "created" | "modified" | "last_run";
  setSortBy: (v: "name" | "size" | "created" | "modified" | "last_run") => void;

  // Sidebar collapsed
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
  toggleSidebarCollapsed: () => void;

  // Sidebar width
  sidebarWidth: number;
  setSidebarWidth: (v: number) => void;

  // Detail panel width
  detailPanelWidth: number;
  setDetailPanelWidth: (v: number) => void;

  // Layout resize-in-progress flag (suppresses sidebar width transition while
  // either the sidebar OR the detail panel is being dragged).
  isLayoutResizing: boolean;
  setIsLayoutResizing: (v: boolean) => void;

  // Tag icons
  tagIcons: Record<string, string>;
  setTagIcons: (icons: Record<string, string>) => void;
  setTagIcon: (tag: string, icon: string) => void;
  removeTagIcon: (tag: string) => void;

  // Icon cache (API-fetched SVG paths)
  iconCache: Record<string, [string, string]>;
  setIconCache: (cache: Record<string, [string, string]>) => void;
  addToIconCache: (name: string, paths: [string, string]) => void;

  // Icon picker
  iconPickerTag: string | null;
  setIconPickerTag: (tag: string | null) => void;

  // Fuse search engine config
  fuseThreshold: number;          // 0..1, fuzzy strictness
  fuseMinMatchLen: number;        // min contiguous match length
  fuseFindAllMatches: boolean;    // find every match in the field, not just the first
  fuseSearchPath: boolean;        // also do literal substring search on directory portion
  setFuseThreshold: (v: number) => void;
  setFuseMinMatchLen: (v: number) => void;
  setFuseFindAllMatches: (v: boolean) => void;
  setFuseSearchPath: (v: boolean) => void;

  // Virtualization toggle
  virtualization: boolean;
  setVirtualization: (v: boolean) => void;
}

export const useTreeStore = create<TreeStore>((set) => ({
  // Drag state
  draggedScript: null,
  setDraggedScript: (s) => set({ draggedScript: s }),
  draggedTag: null,
  setDraggedTag: (t) => set({ draggedTag: t }),
  dragOverTag: null,
  setDragOverTag: (t) => set({ dragOverTag: t }),
  clearDragState: () => set({ draggedScript: null, draggedTag: null, dragOverTag: null }),

  // Tag editing UI state
  isCreatingTagFor: null,
  setIsCreatingTagFor: (s) => set({ isCreatingTagFor: s }),
  isRenamingTag: null,
  setIsRenamingTag: (t) => set({ isRenamingTag: t }),
  editTagName: "",
  setEditTagName: (v) => set({ editTagName: v }),
  newTagName: "",
  setNewTagName: (v) => set({ newTagName: v }),
  activeTabPressed: null,
  setActiveTabPressed: (t) => set({ activeTabPressed: t }),

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
  modalOpen: false,
  setModalOpen: (v) => set({ modalOpen: v }),
  cheatsheetOpen: false,
  setCheatsheetOpen: (v) => set({ cheatsheetOpen: v }),

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
  setDetailPinned: (v) => { safeSetItem("ahk_detail_pinned", String(v)); set({ detailPinned: v }); },
  toggleDetailPinned: () => set((s) => {
    const v = !s.detailPinned;
    safeSetItem("ahk_detail_pinned", String(v));
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
  setShowFileSize: (v) => { safeSetItem("ahk_show_file_size", String(v)); set({ showFileSize: v }); },
  toggleShowFileSize: () => set((s) => {
    const v = !s.showFileSize;
    safeSetItem("ahk_show_file_size", String(v));
    return { showFileSize: v };
  }),

  // Sort mode
  sortBy: "name",
  setSortBy: (v) => set({ sortBy: v }),

  // Sidebar collapsed
  sidebarCollapsed: localStorage.getItem("ahk_sidebar_collapsed") === "true",
  setSidebarCollapsed: (v) => { safeSetItem("ahk_sidebar_collapsed", String(v)); set({ sidebarCollapsed: v }); },
  toggleSidebarCollapsed: () => set((s) => {
    const v = !s.sidebarCollapsed;
    safeSetItem("ahk_sidebar_collapsed", String(v));
    return { sidebarCollapsed: v };
  }),

  // Sidebar width
  sidebarWidth: parseInt(localStorage.getItem("ahk_sidebar_width") ?? "288"),
  setSidebarWidth: (v) => { safeSetItem("ahk_sidebar_width", String(v)); set({ sidebarWidth: v }); },
  detailPanelWidth: parseInt(localStorage.getItem("ahk_detail_panel_width") ?? String(DETAIL_PANEL_DEFAULT_WIDTH)),
  setDetailPanelWidth: (v) => { safeSetItem("ahk_detail_panel_width", String(v)); set({ detailPanelWidth: v }); },
  isLayoutResizing: false,
  setIsLayoutResizing: (v) => set({ isLayoutResizing: v }),

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

  // Icon picker
  iconPickerTag: null,
  setIconPickerTag: (tag) => set({ iconPickerTag: tag }),

  fuseThreshold: typeof localStorage !== "undefined" ? Number(localStorage.getItem("ahk_fuse_threshold") ?? 0.4) : 0.4,
  fuseMinMatchLen: typeof localStorage !== "undefined" ? Number(localStorage.getItem("ahk_fuse_min_match") ?? 2) : 2,
  fuseFindAllMatches: typeof localStorage !== "undefined" ? localStorage.getItem("ahk_fuse_find_all") !== "false" : true,
  fuseSearchPath: typeof localStorage !== "undefined" ? localStorage.getItem("ahk_fuse_search_path") !== "false" : true,
  setFuseThreshold: (v) => { try { localStorage.setItem("ahk_fuse_threshold", String(v)); } catch {} set({ fuseThreshold: v }); },
  setFuseMinMatchLen: (v) => { try { localStorage.setItem("ahk_fuse_min_match", String(v)); } catch {} set({ fuseMinMatchLen: v }); },
  setFuseFindAllMatches: (v) => { try { localStorage.setItem("ahk_fuse_find_all", String(v)); } catch {} set({ fuseFindAllMatches: v }); },
  setFuseSearchPath: (v) => { try { localStorage.setItem("ahk_fuse_search_path", String(v)); } catch {} set({ fuseSearchPath: v }); },

  // Virtualization
  virtualization: localStorage.getItem("ahk_virtualization") === "true",
  setVirtualization: (v) => { safeSetItem("ahk_virtualization", String(v)); set({ virtualization: v }); },

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
