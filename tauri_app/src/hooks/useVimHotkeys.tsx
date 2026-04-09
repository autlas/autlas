import { useEffect, useRef, useCallback } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { useTreeStore } from "../store/useTreeStore";
import { useVimEnabled } from "./useVimEnabled";
import { Script } from "../api";
import { appToast } from "../components/ui/AppToast";

// ─── DEBUG LOGGING ────────────────────────────────────────────────────
// Prefixed with [vim] so users can filter the browser console easily.
// Toggle via `localStorage.setItem('ahk_vim_debug', 'false')` to silence.
const vlog = (...args: any[]) => {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('ahk_vim_debug') === 'false') return;
    // eslint-disable-next-line no-console
    console.log('[vim]', ...args);
};

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

    // Scroll container of THIS instance — used by spatial navigation in
    // tile/list views to scope DOM queries.
    containerRef: React.RefObject<HTMLDivElement | null>;

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
        containerRef,
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
    const vimEnabled = useVimEnabled();

    // The one gate. Every hotkey below uses this and only this.
    const hk = isActive && !modalOpen && vimEnabled;

    // Log gate changes (useful to see "why did my j stop working")
    const prevGateRef = useRef<string>('');
    useEffect(() => {
        const sig = `hk=${hk} (isActive=${isActive} modalOpen=${modalOpen} vimEnabled=${vimEnabled})`;
        if (sig !== prevGateRef.current) {
            vlog('gate:', sig);
            prevGateRef.current = sig;
        }
    }, [hk, isActive, modalOpen, vimEnabled]);

    // Log store-level state transitions once per instance (only when active).
    useEffect(() => {
        if (!isActive) return;
        vlog('mount: useVimHotkeys active', { viewMode, visibleItems: visibleItems.length });
        return () => vlog('unmount: useVimHotkeys (isActive changed or component unmounted)');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isActive]);

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

    // Spatial navigation for tile/list views (and hub mode in particular).
    // The legacy linear `moveFocus` doesn't understand groups of varying
    // lengths or actual visual columns, so it "spills over" into wrong
    // columns. We compute the next focus by reading DOM rects directly:
    //   - down/up: among elements vertically further in the direction,
    //              pick the one whose horizontal center is closest to the
    //              current center (preserves visual column).
    //   - left/right: same idea but flipped axes (preserves row).
    //   - if no candidate exists in the direction → wrap to the visually
    //              first / last element in document order.
    // Returns true if a navigation happened (or fresh focus was set).
    const moveFocusSpatial = useCallback((direction: 'up' | 'down' | 'left' | 'right'): boolean => {
        const container = containerRef.current;
        if (!container) return false;

        const all = Array.from(container.querySelectorAll<HTMLElement>('[id^="script-"]'))
            .filter(el => {
                const r = el.getBoundingClientRect();
                return r.width > 0 && r.height > 0;
            });
        if (all.length === 0) return false;

        setIsVimMode(true);
        const currentPath = useTreeStore.getState().focusedPath;
        const currentEl = currentPath ? all.find(el => el.id === `script-${currentPath}`) : null;

        // Visual order (top→bottom, left→right) for wrap and "no focus" init.
        const visualSorted = () => all.slice().sort((a, b) => {
            const ra = a.getBoundingClientRect();
            const rb = b.getBoundingClientRect();
            if (Math.abs(ra.top - rb.top) > 4) return ra.top - rb.top;
            return ra.left - rb.left;
        });

        // No current focus → first navigable in visual order.
        if (!currentEl) {
            const first = visualSorted()[0];
            if (first) {
                const navKey = first.id.slice('script-'.length);
                vlog('spatial: no current focus → first', navKey);
                setFocusedPath(navKey);
            }
            return true;
        }

        const cur = currentEl.getBoundingClientRect();
        const cx = cur.left + cur.width / 2;
        const cy = cur.top + cur.height / 2;

        const candidates: { el: HTMLElement; dx: number; dy: number }[] = [];
        for (const el of all) {
            if (el === currentEl) continue;
            const r = el.getBoundingClientRect();
            const ex = r.left + r.width / 2;
            const ey = r.top + r.height / 2;
            const dx = ex - cx;
            const dy = ey - cy;
            const okDir =
                (direction === 'down'  && dy >  4) ||
                (direction === 'up'    && dy < -4) ||
                (direction === 'right' && dx >  4) ||
                (direction === 'left'  && dx < -4);
            if (okDir) candidates.push({ el, dx, dy });
        }

        if (candidates.length === 0) {
            const sorted = visualSorted();
            let target: HTMLElement | undefined;
            if (direction === 'right' || direction === 'left') {
                // Group sorted into rows by top (4px tolerance) and jump to
                // first of next row / last of prev row, wrapping document-wide.
                const rows: HTMLElement[][] = [];
                for (const el of sorted) {
                    const r = el.getBoundingClientRect();
                    const last = rows[rows.length - 1];
                    if (last && Math.abs(last[0].getBoundingClientRect().top - r.top) <= 4) last.push(el);
                    else rows.push([el]);
                }
                const row = rows.find(r => r.includes(currentEl));
                if (row && row.length > 1) {
                    target = direction === 'right' ? row[0] : row[row.length - 1];
                }
            } else {
                target = (direction === 'down') ? sorted[0] : sorted[sorted.length - 1];
            }
            if (target && target !== currentEl) {
                const navKey = target.id.slice('script-'.length);
                vlog('spatial:', direction, '→ WRAP to', navKey);
                setFocusedPath(navKey);
            } else {
                vlog('spatial:', direction, '→ no candidate, no wrap target');
            }
            return true;
        }

        // Score: for vertical motion penalize horizontal drift heavily so we
        // stay in the same column; for horizontal motion penalize vertical drift.
        candidates.sort((a, b) => {
            if (direction === 'down' || direction === 'up') {
                return (Math.abs(a.dx) * 3 + Math.abs(a.dy)) - (Math.abs(b.dx) * 3 + Math.abs(b.dy));
            } else {
                return (Math.abs(a.dy) * 3 + Math.abs(a.dx)) - (Math.abs(b.dy) * 3 + Math.abs(b.dx));
            }
        });
        const best = candidates[0].el;
        const navKey = best.id.slice('script-'.length);
        vlog('spatial:', direction, '→', navKey, '(', candidates.length, 'candidates)');
        setFocusedPath(navKey);
        return true;
    }, [containerRef, setFocusedPath, setIsVimMode]);

    // g/G tap tracking (gg = top, gi = focus search)
    const lastGTimeRef = useRef(0);

    // ─── Motion (hjkl + arrows) ───────────────────────────────────────

    // Logs prev/next focus index and DOM rect so we can verify visual columns
    const logMove = (key: string, dir: string, cols: number) => {
        const prev = useTreeStore.getState().focusedPath;
        const prevIdx = visibleItems.findIndex(i => i.path === prev);
        // moveFocus runs synchronously and updates the store before we log
        // the "after" state in a microtask.
        Promise.resolve().then(() => {
            const next = useTreeStore.getState().focusedPath;
            const nextIdx = visibleItems.findIndex(i => i.path === next);
            const nextItem = visibleItems[nextIdx];
            let rect: { left: number; top: number; col?: number } | null = null;
            if (next) {
                const safe = next.replace(/[\\:/."]/g, m => '\\' + m);
                let el: HTMLElement | null = null;
                try {
                    el = document.querySelector<HTMLElement>(`[id="script-${next}"]`);
                } catch { /* selector escape failed */ }
                if (el) {
                    const r = el.getBoundingClientRect();
                    rect = { left: Math.round(r.left), top: Math.round(r.top) };
                }
                void safe;
            }
            vlog(`nav: ${key} (${dir}, cols=${cols}) idx ${prevIdx}→${nextIdx} of ${visibleItems.length}`, {
                prevPath: prev,
                nextPath: next,
                nextType: nextItem?.type,
                rect,
                viewMode,
                columnsCount,
            });
        });
    };

    // Picks the right navigation algorithm. Tree view stays on the legacy
    // linear `moveFocus` (correct for a single-column hierarchical list).
    // Tile/list (and hub) use spatial nav so groups + visual columns work.
    const navigate = useCallback((dir: 'up' | 'down' | 'left' | 'right') => {
        if (viewMode === 'tree') {
            moveFocus(dir, 1);
        } else {
            moveFocusSpatial(dir);
        }
    }, [viewMode, moveFocus, moveFocusSpatial]);

    useHotkeys('j', () => {
        vlog('key: j viewMode=' + viewMode);
        navigate('down');
        logMove('j', 'down', columnsCount);
    }, { preventDefault: true, enabled: hk });

    useHotkeys('k', () => {
        vlog('key: k viewMode=' + viewMode);
        navigate('up');
        logMove('k', 'up', columnsCount);
    }, { preventDefault: true, enabled: hk });

    useHotkeys('h', () => {
        const vimNav = localStorage.getItem("ahk_vim_mode_nav") || "hjkl";
        if (vimNav === 'jk' && viewMode !== 'tree') {
            vlog('key: h → IGNORED (jk-mode in grid view)');
            return;
        }
        vlog('key: h viewMode=' + viewMode);
        navigate('left');
        logMove('h', 'left', 1);
    }, { preventDefault: true, enabled: hk });

    useHotkeys('l', () => {
        const vimNav = localStorage.getItem("ahk_vim_mode_nav") || "hjkl";
        if (vimNav === 'jk' && viewMode !== 'tree') {
            vlog('key: l → IGNORED (jk-mode in grid view)');
            return;
        }
        vlog('key: l viewMode=' + viewMode);
        navigate('right');
        logMove('l', 'right', 1);
    }, { preventDefault: true, enabled: hk });

    // Arrow keys always 2D regardless of vim nav setting.
    useHotkeys('ArrowDown',  () => { vlog('key: ArrowDown');  navigate('down');  }, { preventDefault: true, enabled: hk });
    useHotkeys('ArrowUp',    () => { vlog('key: ArrowUp');    navigate('up');    }, { preventDefault: true, enabled: hk });
    useHotkeys('ArrowLeft',  () => { vlog('key: ArrowLeft');  navigate('left');  }, { preventDefault: true, enabled: hk });
    useHotkeys('ArrowRight', () => { vlog('key: ArrowRight'); navigate('right'); }, { preventDefault: true, enabled: hk });

    // ─── Primary actions ──────────────────────────────────────────────

    useHotkeys('enter', () => {
        const item = getFocusedItem();
        if (!item) { vlog('key: Enter → IGNORED (no focused item)'); return; }
        if (item.type === 'script') {
            vlog('key: Enter → handleToggle', item.data.filename, 'running=' + item.data.is_running);
            handleToggle(item.data);
        } else {
            vlog('key: Enter → toggleFolder', item.path);
            toggleFolder(item.path);
        }
    }, { preventDefault: true, enabled: hk });

    useHotkeys('space', () => {
        const item = getFocusedItem();
        if (!item) { vlog('key: Space → IGNORED (no focused item)'); return; }
        if (item.type === 'script') {
            vlog('key: Space → onSelectScript (open detail)', item.data.filename);
            onSelectScript?.(item.data);
        } else {
            vlog('key: Space → toggleFolder', item.path);
            toggleFolder(item.path);
        }
    }, { preventDefault: true, enabled: hk });

    useHotkeys('r', () => {
        const item = getFocusedItem();
        if (!item || item.type !== 'script') { vlog('key: r → IGNORED (not a script)'); return; }
        if (item.data.is_running) {
            vlog('key: r → handleRestart', item.data.filename);
            handleRestart(item.data);
        } else {
            vlog('key: r → TOAST (not running)', item.data.filename);
            appToast.warning(t("toast.script_not_running", "Скрипт не запущен — нажмите Enter, чтобы запустить"));
        }
    }, { preventDefault: true, enabled: hk });

    // `t,е` — Cyrillic fallback so the ru layout also opens the tag picker.
    useHotkeys('t,е', () => {
        const focused = useTreeStore.getState().focusedPath;
        if (!focused) { vlog('key: t → IGNORED (no focused path)'); return; }
        if (focused.includes('::')) {
            vlog('key: t → setEditingScript(scoped hub key)', focused);
            useTreeStore.getState().setEditingScript(focused);
            return;
        }
        const item = visibleItems.find(i => i.path === focused);
        if (item && item.type === 'script') {
            vlog('key: t → startEditing', item.data.filename);
            startEditing(item.data);
        } else {
            vlog('key: t → IGNORED (focused is a folder)');
        }
    }, { preventDefault: true, enabled: hk });

    useHotkeys('m,ь', async () => {
        const item = getFocusedItem();
        if (!item || item.type !== 'script') { vlog('key: m → IGNORED (not a script)'); return; }
        const next = !item.data.is_hub;
        vlog('key: m → set_script_hub', item.data.filename, '→', next);
        window.dispatchEvent(new CustomEvent('ahk-hub-changed-local', { detail: { id: item.data.id, hub: next } }));
        await invoke("set_script_hub", { id: item.data.id, hub: next });
        appToast.success(
            next
                ? t("toast.added_to_hub", "Добавлено в хаб")
                : t("toast.removed_from_hub", "Удалено из хаба")
        );
    }, { preventDefault: true, enabled: hk });

    useHotkeys('c', () => {
        const item = getFocusedItem();
        if (!item) { vlog('key: c → IGNORED (no focused item)'); return; }
        const path = item.type === 'script' ? item.data.path : item.path;
        vlog('key: c → copy path', path);
        navigator.clipboard.writeText(path);
        appToast.success(t("toast.path_copied", "Путь скопирован"));
    }, { preventDefault: true, enabled: hk });

    useHotkeys('f', () => {
        const item = getFocusedItem();
        if (!item) { vlog('key: f → IGNORED (no focused item)'); return; }
        const path = item.type === 'script' ? item.data.path : item.path;
        vlog('key: f → open_in_explorer', path);
        invoke("open_in_explorer", { path });
    }, { preventDefault: true, enabled: hk });

    useHotkeys('o', () => {
        const item = getFocusedItem();
        if (!item || item.type !== 'script') { vlog('key: o → IGNORED (not a script)'); return; }
        vlog('key: o → open_with', item.data.path);
        invoke("open_with", { path: item.data.path });
    }, { preventDefault: true, enabled: hk });

    useHotkeys('e', () => {
        const item = getFocusedItem();
        if (!item || item.type !== 'script') { vlog('key: e → IGNORED (not a script)'); return; }
        vlog('key: e → edit_script', item.data.path);
        invoke("edit_script", { path: item.data.path });
    }, { preventDefault: true, enabled: hk });

    // Pin/unpin the detail panel. Only meaningful while it's open, so we
    // guard on isDetailOpen instead of hiding the key when vim is off —
    // the user may still have the panel open outside navigation.
    useHotkeys('p', () => {
        if (!isDetailOpen || !onDetailPinToggle) {
            vlog('key: p → IGNORED (detail panel not open)');
            return;
        }
        vlog('key: p → onDetailPinToggle');
        onDetailPinToggle();
    }, { preventDefault: true, enabled: hk });

    // ─── gg / G scroll-to-extreme ─────────────────────────────────────

    useHotkeys('g', () => {
        const now = performance.now();
        const diff = now - lastGTimeRef.current;
        if (diff < 500 && diff > 0) {
            if (visibleItems.length > 0) {
                const target = visibleItems.find(i => i.type === 'script') || visibleItems[0];
                vlog('key: gg (double-g,', Math.round(diff) + 'ms) → scroll to top', target.path);
                isInstantScrollRef.current = true;
                setIsVimMode(true);
                setFocusedPath(target.path);
                scrollPathIntoView(target.path);
            }
            lastGTimeRef.current = 0;
        } else {
            vlog('key: g (first tap, arming chord)');
            lastGTimeRef.current = now;
        }
    }, { enabled: hk });

    useHotkeys('shift+g', (e) => {
        e.preventDefault();
        if (visibleItems.length === 0) { vlog('key: G → IGNORED (empty)'); return; }
        const lastPath = visibleItems[visibleItems.length - 1].path;
        vlog('key: G → scroll to bottom', lastPath);
        isInstantScrollRef.current = true;
        setIsVimMode(true);
        setFocusedPath(lastPath);
        scrollPathIntoView(lastPath);
    }, { enabled: hk });

    // ─── View cycle + search focus ────────────────────────────────────

    useHotkeys('q', () => {
        const order = ["tree", "tiles", "list"] as const;
        const idx = order.indexOf(viewMode);
        const next = order[(idx + 1) % order.length];
        vlog('key: q → cycle view', viewMode, '→', next);
        onViewModeChange(next);
    }, { enabled: hk });

    useHotkeys('i', (e) => {
        const now = performance.now();
        const gDiff = now - lastGTimeRef.current;
        // `gi` (within 1s of `g`) — focus search input.
        if (gDiff < 1000) {
            e.preventDefault();
            vlog('key: gi (g-chord,', Math.round(gDiff) + 'ms) → focus search');
            lastGTimeRef.current = 0;
            focusSearch();
            return;
        }
        // Lone `i` — show UI of focused running script (if it has one).
        const item = getFocusedItem();
        if (!item || item.type !== 'script') {
            vlog('key: i → IGNORED (no focused script)');
            return;
        }
        if (!item.data.is_running) {
            vlog('key: i → TOAST (not running)');
            appToast.warning(t("toast.script_not_running", "Скрипт не запущен — нажмите Enter, чтобы запустить"));
            return;
        }
        if (!item.data.has_ui) {
            vlog('key: i → TOAST (no UI)');
            appToast.warning(t("toast.script_has_no_ui", "У скрипта нет интерфейса"));
            return;
        }
        vlog('key: i → onShowUI', item.data.filename);
        onShowUI(item.data);
    }, { enabled: hk });

    // ─── Ctrl tap → open context menu on focused item ────────────────
    // Detected via raw keyup so Ctrl-as-modifier (Ctrl+F etc.) doesn't fire
    // it. Any other key pressed while Ctrl is held marks the press dirty.
    useEffect(() => {
        if (!hk) return;
        let downAt = 0;
        let polluted = false;
        const onDown = (e: KeyboardEvent) => {
            if (e.key === 'Control') {
                if (downAt === 0) { downAt = performance.now(); polluted = false; }
            } else if (downAt > 0) {
                polluted = true;
            }
        };
        const onUp = (e: KeyboardEvent) => {
            if (e.key !== 'Control') return;
            const dt = performance.now() - downAt;
            const clean = !polluted && downAt > 0 && dt < 500;
            downAt = 0; polluted = false;
            if (!clean) return;
            const item = getFocusedItem();
            if (!item) { vlog('key: Ctrl (tap) → IGNORED (no focus)'); return; }
            const elId = item.type === 'folder' ? `folder-${item.path}` : `script-${item.path}`;
            const el = document.getElementById(elId);
            const r = el?.getBoundingClientRect();
            const x = r ? r.left + 20 : window.innerWidth / 2;
            const y = r ? r.bottom - 5 : window.innerHeight / 2;
            vlog('key: Ctrl (tap) → open context menu', item.type, item.path);
            window.dispatchEvent(new CustomEvent('ahk-open-context-menu', {
                detail: { x, y, type: item.type, data: item.data, path: item.path }
            }));
        };
        window.addEventListener('keydown', onDown, true);
        window.addEventListener('keyup', onUp, true);
        return () => {
            window.removeEventListener('keydown', onDown, true);
            window.removeEventListener('keyup', onUp, true);
        };
    }, [hk, getFocusedItem]);

    // Standard "find" shortcut — works even when vim is disabled.
    useHotkeys('ctrl+f', (e) => {
        e.preventDefault();
        vlog('key: Ctrl+F → focus search');
        focusSearch();
    }, { enabled: isActive });

    // ─── Esc priority chain ───────────────────────────────────────────
    // Note: NOT gated by `hk` — only by `isActive` — because the user should
    // still be able to close panels / blur search even if vim itself is off.
    useHotkeys('esc', () => {
        if (isCheatSheetOpen) {
            vlog('key: Esc → close CheatSheet (priority 1)');
            setIsCheatSheetOpen(false);
            return;
        }
        // Sort dropdown handles its own Esc via a local capture listener
        // in ScriptTreeToolbar; we must not fall through while it's open.
        if (modalOpen) {
            vlog('key: Esc → FALL-THROUGH (sort dropdown, handled in toolbar)');
            return;
        }
        if (editingScript) {
            vlog('key: Esc → stopEditing (tag picker, priority 3)');
            stopEditing();
            return;
        }
        if (isSearchActiveRef.current) {
            vlog('key: Esc → blur search (priority 4)');
            searchInputRef.current?.blur();
            return;
        }
        if (isDetailOpen && onCloseDetail) {
            vlog('key: Esc → close detail panel (priority 5)');
            onCloseDetail();
            return;
        }
        vlog('key: Esc → exit vim mode + clear focus (priority 6)');
        setFocusedPath(null);
        setIsVimMode(false);
    }, { enableOnFormTags: true, enabled: isActive }, [isCheatSheetOpen, modalOpen, editingScript, isDetailOpen]);

    // ─── `?` (CheatSheet toggle) — raw keydown so it works on any layout ──
    useEffect(() => {
        if (!isActive || !vimEnabled) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            const isQuestionMark =
                e.key === '?' ||
                (e.key === ',' && e.shiftKey && e.code === 'Slash') ||
                (e.key === '7' && e.shiftKey);
            if (!isQuestionMark) return;
            // Don't toggle cheatsheet when the user is typing in any input
            // (search field, tag picker, icon picker, rename, etc.).
            const ae = document.activeElement as HTMLElement | null;
            const isEditable = !!ae && (
                ae.tagName === 'INPUT' ||
                ae.tagName === 'TEXTAREA' ||
                ae.isContentEditable
            );
            if (isEditable) {
                vlog('key: ? → IGNORED (typing in', ae?.tagName.toLowerCase(), ')');
                return;
            }
            const next = !useTreeStore.getState().cheatsheetOpen;
            vlog('key: ? → toggle CheatSheet', next ? 'OPEN' : 'CLOSE');
            setIsCheatSheetOpen(next);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isActive, vimEnabled, searchInputRef, setIsCheatSheetOpen]);
}

