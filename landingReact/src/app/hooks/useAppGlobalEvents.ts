import { useEffect } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useTreeStore } from "../store/useTreeStore";

/**
 * Exit vim mode on the first mouse move after entering it. Captures the
 * listener (useCapture=true, {once}) so a single movement is enough.
 */
export function useVimMouseExit() {
  const isVimMode = useTreeStore(s => s.isVimMode);
  useEffect(() => {
    if (localStorage.getItem("ahk_vim_debug") !== "false") {
      console.log("[vim-mode]", isVimMode ? "ENTER (cursor hidden)" : "EXIT");
    }
    document.body.classList.toggle("vim-cursor-hidden", isVimMode);
    if (!isVimMode) return;
    const onMove = () => {
      if (localStorage.getItem("ahk_vim_debug") !== "false") {
        console.log("[vim-mode] mousemove → exit");
      }
      useTreeStore.getState().setIsVimMode(false);
    };
    window.addEventListener("mousemove", onMove, { capture: true, once: true });
    return () => window.removeEventListener("mousemove", onMove, { capture: true } as any);
  }, [isVimMode]);
}

/**
 * Global cheatsheet controls:
 *  - Listens for the `ahk-open-cheatsheet` custom event (dispatched from
 *    Settings button, sidebar, etc.) and opens the sheet.
 *  - Captures Esc globally to close it (captured BEFORE regular handlers
 *    so the sheet wins over other modals).
 */
export function useCheatsheetKeybind() {
  const setCheatsheetOpen = useTreeStore(s => s.setCheatsheetOpen);
  useEffect(() => {
    const debug = localStorage.getItem("ahk_vim_debug") !== "false";
    const onOpen = () => {
      if (debug) console.log("[cheatsheet] open (via ahk-open-cheatsheet event)");
      setCheatsheetOpen(true);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && useTreeStore.getState().cheatsheetOpen) {
        if (debug) console.log("[cheatsheet] global Esc → close");
        e.stopPropagation();
        setCheatsheetOpen(false);
      }
    };
    window.addEventListener("ahk-open-cheatsheet", onOpen);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("ahk-open-cheatsheet", onOpen);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [setCheatsheetOpen]);
}

/**
 * Ctrl+Shift+I opens the Tauri devtools window (in dev builds — a no-op
 * in release since devtools is compiled out).
 */
export function useDevtoolsShortcut() {
  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "i") {
        const win = getCurrentWebviewWindow();
        if ("openDevtools" in win) (win as any).openDevtools();
        else if ("toggleDevtools" in win) (win as any).toggleDevtools();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}

/**
 * Closes the app-level context menu on any global interaction that didn't
 * originate from React's own handlers (React sets `_reactProcessed` on
 * events it already handled — we only close if nobody claimed the event).
 */
export function useContextMenuCloseOnOutside(onClose: () => void) {
  useEffect(() => {
    const onClick = () => onClose();
    const onScroll = () => onClose();
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      if (!(e as any)._reactProcessed && !e.defaultPrevented) onClose();
    };

    window.addEventListener("click", onClick);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("contextmenu", onContextMenu);
    return () => {
      window.removeEventListener("click", onClick);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("contextmenu", onContextMenu);
    };
  }, [onClose]);
}
