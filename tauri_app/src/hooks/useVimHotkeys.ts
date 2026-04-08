import { useEffect, useRef, useCallback, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useTreeStore } from "../store/useTreeStore";
import { Script } from "../api";

type ViewMode = "tree" | "tiles" | "list";

interface VisibleItem {
    path: string;
    type: "script" | "folder";
    data?: any;
}

export interface UseVimHotkeysArgs {
    // Global enable gate — all registered hotkeys honor this together with
    // the internal modal/vim-disabled guards from the store.
    isActive: boolean;

    // View state
    viewMode: ViewMode;
    onViewModeChange: (m: ViewMode) => void;
    columnsCount: number;
    visibleItems: VisibleItem[];

    // Navigation
    moveFocus: (direction: "up" | "down" | "left" | "right", cols?: number) => void;
    scrollPathIntoView: (path: string) => void;

    // Script actions
    handleToggle: (s: Script) => void;
    handleRestart: (s: Script) => void;
    toggleFolder: (path: string) => void;
    startEditing: (s: Script) => void;
    stopEditing: () => void;
    onShowUI: (s: Script) => void;
    onSelectScript?: (s: Script) => void;

    // Panels / detail
    isDetailOpen: boolean | undefined;
    onCloseDetail?: () => void;
    onDetailPinToggle?: () => void;
    editingScript: string | null;

    // Search
    searchInputRef: React.RefObject<HTMLInputElement | null>;
    isSearchActiveRef: React.RefObject<boolean>;

    // Scroll + vim state (shared with the scroll subscriber)
    isInstantScrollRef: React.MutableRefObject<boolean>;
}

/**
 * Centralized vim keybinds for the script tree.
 *
 * ──────────────────── HOTKEY REGISTRY (whole app) ────────────────────
 *
 * IN THIS HOOK (gated by `hk = isActive && !modalOpen && vimEnabled`):
 *   Navigation:   h / j / k / l      — move focus (hjkl or jk modes)
 *                 ArrowLeft/Right/Up/Down — move focus (always 2D)
 *                 gg                 — scroll to top (double-tap g)
 *                 G (Shift+G)        — scroll to bottom
 *   Actions on focused script/folder:
 *                 Enter              — run / toggle / expand folder
 *                 Space              — open detail panel / expand folder
 *                 r                  — restart running script
 *                 t / е              — open tag picker (ru-layout safe)
 *                 f                  — show in explorer
 *                 o                  — open with
 *                 e                  — edit in editor
 *                 i                  — show UI of running script (or `gi`)
 *                 p                  — pin/unpin detail panel (if open)
 *   Search:       gi                 — focus search input (g-chord)
 *                 Ctrl+F             — focus search input
 *   View:         q                  — cycle tree → tiles → list
 *   Help:         ?                  — toggle CheatSheet (raw keydown,
 *                                      works on any layout)
 *   Esc chain (priority, topmost wins, only gated by isActive):
 *     cheatsheet → sort dropdown → tagpicker → search blur → detail → vim exit
 *
 * ELSEWHERE in the codebase (intentionally NOT in this hook):
 *   App-level    Shift+Alt+J / Shift+Alt+K   — next / prev tab
 *                  → src/hooks/useNavigation.ts (called once from App.tsx;
 *                    tab switching doesn't belong to tree context)
 *   Modals       s / j / k / Enter / Space / Esc inside sort dropdown
 *                  → src/components/scripts/ScriptTreeToolbar.tsx
 *                    (local capture-phase keydown tied to dropdown lifecycle;
 *                    sets store.modalOpen so `hk` here disables the tree)
 *   Popovers     arrow nav inside tag/icon pickers
 *                  → src/components/tags/TagPickerPopover.tsx,
 *                    src/components/tags/TagIconPicker.tsx
 *                    (self-contained listeners live only while the popover
 *                    is mounted)
 *
 * When adding a new hotkey:
 *   • Focused-item or global tree action → add here, pass callbacks via args
 *   • New transient modal/popover     → own lifecycle, set `modalOpen` if it
 *     should block tree hotkeys
 *   • App-wide command              → useNavigation or its own app hook
 *
 * Design goals:
 * - single source of truth for all letter / motion hotkeys inside the tree
 * - single gate applied uniformly so individual sites can't forget it
 * - cross-layout safe where it matters (`t,е`, raw keydown for `?`)
 */
export function useVimHotkeys(args: UseVimHotkeysArgs) {
    const {
        isActive,
        viewMode,
        onViewModeChange,
        columnsCount,
        visibleItems,
        moveFocus,
        scrollPathIntoView,
        handleToggle,
        handleRestart,
        toggleFolder,
        startEditing,
        stopEditing,
        onShowUI,
        onSelectScript,
        isDetailOpen,
        onCloseDetail,
        onDetailPinToggle,
        editingScript,
        searchInputRef,
        isSearchActiveRef,
        isInstantScrollRef,
    } = args;

    const { t } = useTranslation();

    // Store selectors
    const modalOpen = useTreeStore(s => s.modalOpen);
    const isCheatSheetOpen = useTreeStore(s => s.cheatsheetOpen);
    const setIsCheatSheetOpen = useTreeStore(s => s.setCheatsheetOpen);
    const setFocusedPath = useTreeStore(s => s.setFocusedPath);
    const setIsVimMode = useTreeStore(s => s.setIsVimMode);

    // Vim-enabled flag (persisted via localStorage, notified via custom event
    // from the settings toggle).
    const vimEnabled = useVimEnabledFlag();

    // The one gate. Every hotkey below uses this and only this.
    const hk = isActive && !modalOpen && vimEnabled;

    // Helpers ----------------------------------------------------------

    const getFocusedItem = useCallback(() => {
        const focused = useTreeStore.getState().focusedPath;
        if (!focused) return null;
        return visibleItems.find(i => i.path === focused) ?? null;
    }, [visibleItems]);

    const focusSearch = useCallback(() => {
        if (searchInputRef.current) {
            searchInputRef.current.focus();
        } else {
            document.querySelector<HTMLButtonElement>('[data-search-collapsed-btn]')?.click();
        }
    }, [searchInputRef]);

    // g/G tap tracking (gg = top, gi = focus search)
    const lastGTimeRef = useRef(0);

    // ─── Motion (hjkl + arrows) ───────────────────────────────────────

    useHotkeys('j', () => {
        const vimNav = localStorage.getItem("ahk_vim_mode_nav") || "hjkl";
        moveFocus('down', vimNav === 'jk' || viewMode === 'tree' ? 1 : columnsCount);
    }, { preventDefault: true, enabled: hk });

    useHotkeys('k', () => {
        const vimNav = localStorage.getItem("ahk_vim_mode_nav") || "hjkl";
        moveFocus('up', vimNav === 'jk' || viewMode === 'tree' ? 1 : columnsCount);
    }, { preventDefault: true, enabled: hk });

    useHotkeys('h', () => {
        const vimNav = localStorage.getItem("ahk_vim_mode_nav") || "hjkl";
        if (vimNav === 'jk' && viewMode !== 'tree') return;
        moveFocus('left', 1);
    }, { preventDefault: true, enabled: hk });

    useHotkeys('l', () => {
        const vimNav = localStorage.getItem("ahk_vim_mode_nav") || "hjkl";
        if (vimNav === 'jk' && viewMode !== 'tree') return;
        moveFocus('right', 1);
    }, { preventDefault: true, enabled: hk });

    // Arrow keys always 2D regardless of vim nav setting.
    useHotkeys('ArrowDown', () => moveFocus('down', viewMode === 'tree' ? 1 : columnsCount),
        { preventDefault: true, enabled: hk });
    useHotkeys('ArrowUp', () => moveFocus('up', viewMode === 'tree' ? 1 : columnsCount),
        { preventDefault: true, enabled: hk });
    useHotkeys('ArrowLeft', () => moveFocus('left', 1), { preventDefault: true, enabled: hk });
    useHotkeys('ArrowRight', () => moveFocus('right', 1), { preventDefault: true, enabled: hk });

    // ─── Primary actions ──────────────────────────────────────────────

    useHotkeys('enter', () => {
        const item = getFocusedItem();
        if (!item) return;
        if (item.type === 'script') handleToggle(item.data);
        else toggleFolder(item.path);
    }, { preventDefault: true, enabled: hk });

    useHotkeys('space', () => {
        const item = getFocusedItem();
        if (!item) return;
        if (item.type === 'script') onSelectScript?.(item.data);
        else toggleFolder(item.path);
    }, { preventDefault: true, enabled: hk });

    useHotkeys('r', () => {
        const item = getFocusedItem();
        if (!item || item.type !== 'script') return;
        if (item.data.is_running) {
            handleRestart(item.data);
        } else {
            toast(t("toast.script_not_running", "Скрипт не запущен — нажмите Enter, чтобы запустить"));
        }
    }, { preventDefault: true, enabled: hk });

    // `t,е` — Cyrillic fallback so the ru layout also opens the tag picker.
    useHotkeys('t,е', () => {
        const focused = useTreeStore.getState().focusedPath;
        if (!focused) return;
        // In hub views focusedPath is "tag::path" (the scoped editingKey);
        // write it directly so the scoped popover opens on the exact card.
        if (focused.includes('::')) {
            useTreeStore.getState().setEditingScript(focused);
            return;
        }
        const item = visibleItems.find(i => i.path === focused);
        if (item && item.type === 'script') startEditing(item.data);
    }, { preventDefault: true, enabled: hk });

    useHotkeys('f', () => {
        const item = getFocusedItem();
        if (!item) return;
        const path = item.type === 'script' ? item.data.path : item.path;
        invoke("open_in_explorer", { path });
    }, { preventDefault: true, enabled: hk });

    useHotkeys('o', () => {
        const item = getFocusedItem();
        if (!item || item.type !== 'script') return;
        invoke("open_with", { path: item.data.path });
    }, { preventDefault: true, enabled: hk });

    useHotkeys('e', () => {
        const item = getFocusedItem();
        if (!item || item.type !== 'script') return;
        invoke("edit_script", { path: item.data.path });
    }, { preventDefault: true, enabled: hk });

    // Pin/unpin the detail panel. Only meaningful while it's open, so we
    // guard on isDetailOpen instead of hiding the key when vim is off —
    // the user may still have the panel open outside navigation.
    useHotkeys('p', () => {
        if (!isDetailOpen || !onDetailPinToggle) return;
        onDetailPinToggle();
    }, { preventDefault: true, enabled: hk });

    // ─── gg / G scroll-to-extreme ─────────────────────────────────────

    useHotkeys('g', () => {
        const now = performance.now();
        const diff = now - lastGTimeRef.current;
        if (diff < 500 && diff > 0) {
            if (visibleItems.length > 0) {
                isInstantScrollRef.current = true;
                const target = visibleItems.find(i => i.type === 'script') || visibleItems[0];
                setIsVimMode(true);
                setFocusedPath(target.path);
                scrollPathIntoView(target.path);
            }
            lastGTimeRef.current = 0;
        } else {
            lastGTimeRef.current = now;
        }
    }, { enabled: hk });

    useHotkeys('shift+g', (e) => {
        e.preventDefault();
        if (visibleItems.length === 0) return;
        isInstantScrollRef.current = true;
        setIsVimMode(true);
        const lastPath = visibleItems[visibleItems.length - 1].path;
        setFocusedPath(lastPath);
        scrollPathIntoView(lastPath);
    }, { enabled: hk });

    // ─── View cycle + search focus ────────────────────────────────────

    useHotkeys('q', () => {
        const order = ["tree", "tiles", "list"] as const;
        const idx = order.indexOf(viewMode);
        onViewModeChange(order[(idx + 1) % order.length]);
    }, { enabled: hk });

    useHotkeys('i', (e) => {
        const now = performance.now();
        const gDiff = now - lastGTimeRef.current;
        // `gi` (within 1s of `g`) — focus search input.
        if (gDiff < 1000) {
            e.preventDefault();
            lastGTimeRef.current = 0;
            focusSearch();
            return;
        }
        // Lone `i` — show UI of focused running script (if it has one).
        const item = getFocusedItem();
        if (item && item.type === 'script' && item.data.is_running && item.data.has_ui) {
            onShowUI(item.data);
        }
    }, { enabled: hk });

    useHotkeys('ctrl+f', (e) => {
        e.preventDefault();
        focusSearch();
    }, { enabled: hk });

    // ─── Esc priority chain ───────────────────────────────────────────
    // Note: NOT gated by `hk` — only by `isActive` — because the user should
    // still be able to close panels / blur search even if vim itself is off.
    useHotkeys('esc', () => {
        if (isCheatSheetOpen) {
            setIsCheatSheetOpen(false);
            return;
        }
        // Sort dropdown handles its own Esc via a local capture listener
        // in ScriptTreeToolbar; we must not fall through while it's open.
        if (modalOpen) return;
        if (editingScript) {
            stopEditing();
            return;
        }
        if (isSearchActiveRef.current) {
            searchInputRef.current?.blur();
            return;
        }
        if (isDetailOpen && onCloseDetail) {
            onCloseDetail();
            return;
        }
        setFocusedPath(null);
        setIsVimMode(false);
    }, { enableOnFormTags: true, enabled: isActive }, [isCheatSheetOpen, modalOpen, editingScript, isDetailOpen]);

    // ─── `?` (CheatSheet toggle) — raw keydown so it works on any layout ──
    useEffect(() => {
        if (!isActive) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            const isQuestionMark =
                e.key === '?' ||
                (e.key === ',' && e.shiftKey && e.code === 'Slash') ||
                (e.key === '7' && e.shiftKey);
            if (!isQuestionMark) return;
            if (document.activeElement === searchInputRef.current) return;
            setIsCheatSheetOpen(!useTreeStore.getState().cheatsheetOpen);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isActive, searchInputRef, setIsCheatSheetOpen]);
}

// Reads the persisted vim-enabled flag and subscribes to its change event.
function useVimEnabledFlag(): boolean {
    const [enabled, setEnabled] = useState<boolean>(() => localStorage.getItem("ahk_vim_enabled") !== "false");
    useEffect(() => {
        const onChange = () => setEnabled(localStorage.getItem("ahk_vim_enabled") !== "false");
        window.addEventListener("ahk-vim-enabled-changed", onChange);
        return () => window.removeEventListener("ahk-vim-enabled-changed", onChange);
    }, []);
    return enabled;
}
