import { useCallback, useEffect } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { useTreeStore } from "../store/useTreeStore";
import {
  DETAIL_PANEL_MIN_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_COLLAPSED_WIDTH,
  TREE_MIN_WIDTH,
} from "../constants/layout";

export interface LayoutManager {
  /**
   * Grows the application window outward to fit the current layout without
   * squeezing the tree below TREE_MIN_WIDTH. Called when the sidebar expands
   * or the detail panel opens. `assume*` options let callers pre-compute
   * the required width before the store reflects an in-flight change.
   */
  growWindowToFit: (opts?: { assumeSidebarExpanded?: boolean; assumeDetailOpen?: boolean }) => Promise<void>;
}

/**
 * Keeps the main tree column at ≥ TREE_MIN_WIDTH by distributing a
 * window-resize deficit proportionally between the sidebar and detail
 * panel. When both hit their minimums, collapses the sidebar; if that's
 * still not enough, closes the detail panel.
 *
 * Also grows the window outward when the sidebar expands so the new
 * layout fits without any squeeze at all.
 *
 * @param selectedPathRef  Ref to currently-open detail path (so resize can
 *                         close it as last resort without prop updates).
 * @param setSelectedPathRef Ref to the detail setter — used to close the
 *                           panel when we can't fit it anymore.
 */
export function useWindowLayoutManager(
  selectedPathRef: React.RefObject<string | null>,
  setSelectedPathRef: React.RefObject<((p: string | null) => void) | null>,
): LayoutManager {
  // ─── Window resize handler ───────────────────────────────
  useEffect(() => {
    const onResize = () => {
      const total = window.innerWidth;
      const state = useTreeStore.getState();
      const detailOpen = !!selectedPathRef.current;
      const collapsed = state.sidebarCollapsed;
      let sidebar = collapsed ? SIDEBAR_COLLAPSED_WIDTH : state.sidebarWidth;
      let detail = detailOpen ? state.detailPanelWidth : 0;
      const tree = total - sidebar - detail;
      if (tree >= TREE_MIN_WIDTH) return; // tree absorbs the shrink

      let deficit = TREE_MIN_WIDTH - tree;
      const sidebarFloor = collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_MIN_WIDTH;
      const sidebarHead = sidebar - sidebarFloor;
      const detailHead = detailOpen ? detail - DETAIL_PANEL_MIN_WIDTH : 0;
      const totalHead = sidebarHead + detailHead;

      if (totalHead >= deficit) {
        // Distribute proportionally so both sides hit minimum simultaneously.
        const sCut = totalHead === 0 ? 0 : deficit * (sidebarHead / totalHead);
        const dCut = deficit - sCut;
        if (!collapsed && sCut > 0) state.setSidebarWidth(Math.max(sidebarFloor, sidebar - sCut));
        if (detailOpen && dCut > 0) state.setDetailPanelWidth(Math.max(DETAIL_PANEL_MIN_WIDTH, detail - dCut));
        return;
      }

      // Headroom exhausted: drop both to their minimums first.
      if (!collapsed) state.setSidebarWidth(SIDEBAR_MIN_WIDTH);
      if (detailOpen) state.setDetailPanelWidth(DETAIL_PANEL_MIN_WIDTH);
      sidebar = collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_MIN_WIDTH;
      detail = detailOpen ? DETAIL_PANEL_MIN_WIDTH : 0;
      deficit = TREE_MIN_WIDTH - (total - sidebar - detail);
      if (deficit <= 0) return;

      // Collapse sidebar (frees SIDEBAR_MIN - SIDEBAR_COLLAPSED).
      if (!collapsed) {
        state.setSidebarCollapsed(true);
        sidebar = SIDEBAR_COLLAPSED_WIDTH;
        deficit = TREE_MIN_WIDTH - (total - sidebar - detail);
        if (deficit <= 0) return;
      }

      // Last resort: close the detail panel.
      if (detailOpen) setSelectedPathRef.current?.(null);
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Grow-window-to-fit helper ──────────────────────────
  const growWindowToFit = useCallback(async (opts?: { assumeSidebarExpanded?: boolean; assumeDetailOpen?: boolean }) => {
    const state = useTreeStore.getState();
    const expanded = opts?.assumeSidebarExpanded ?? !state.sidebarCollapsed;
    const sidebar = expanded ? state.sidebarWidth : SIDEBAR_COLLAPSED_WIDTH;
    const detailOpen = opts?.assumeDetailOpen ?? !!selectedPathRef.current;
    const detail = detailOpen ? state.detailPanelWidth : 0;
    const required = sidebar + TREE_MIN_WIDTH + detail;
    if (window.innerWidth >= required) return;
    try {
      const win = getCurrentWebviewWindow();
      await win.setSize(new LogicalSize(required, window.innerHeight));
    } catch (e) {
      console.error("[layout] grow window failed:", e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Auto-grow when sidebar expands ────────────────────
  const sidebarCollapsed = useTreeStore(s => s.sidebarCollapsed);
  useEffect(() => {
    if (!sidebarCollapsed) growWindowToFit();
  }, [sidebarCollapsed, growWindowToFit]);

  return { growWindowToFit };
}
