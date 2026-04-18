import { useCallback, useEffect, useRef, useState, Dispatch, SetStateAction, MouseEvent as ReactMouseEvent } from "react";
import { safeSetItem } from "../utils/safeStorage";
import { DETAIL_PANEL_MIN_WIDTH, TREE_MIN_WIDTH } from "../constants/layout";

export interface UsePanelResizeOptions {
  min?: number;
  max?: number;
}

export interface UsePanelResizeResult {
  width: number;
  setWidth: Dispatch<SetStateAction<number>>;
  handleProps: { onMouseDown: (e: ReactMouseEvent) => void };
  isResizing: boolean;
}

export function usePanelResize(
  storageKey: string,
  defaultWidth: number,
  options?: UsePanelResizeOptions
): UsePanelResizeResult {
  const min = options?.min ?? DETAIL_PANEL_MIN_WIDTH;
  const [width, setWidth] = useState<number>(() => {
    const saved = localStorage.getItem(storageKey);
    return saved ? parseInt(saved) : defaultWidth;
  });
  const [isResizing, setIsResizing] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  const onMouseDown = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = width;
    let currentWidth = startWidth;
    const target = e.currentTarget as HTMLElement;
    const parentWidth = target.parentElement?.parentElement?.clientWidth ?? 1200;
    const maxWidth = options?.max ?? (parentWidth - TREE_MIN_WIDTH);

    const onMouseMove = (ev: globalThis.MouseEvent) => {
      currentWidth = Math.min(maxWidth, Math.max(min, startWidth + (startX - ev.clientX)));
      setWidth(currentWidth);
    };
    const onMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      safeSetItem(storageKey, String(currentWidth));
      cleanupRef.current = null;
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    cleanupRef.current = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [width, storageKey, min, options?.max]);

  useEffect(() => {
    return () => {
      if (cleanupRef.current) cleanupRef.current();
    };
  }, []);

  return { width, setWidth, handleProps: { onMouseDown }, isResizing };
}
