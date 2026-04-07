import { useEffect, useRef } from "react";

/**
 * Подписывается на ResizeObserver указанного элемента.
 * Передавай элемент напрямую (не ref), чтобы хук пересоздавал observer
 * когда элемент монтируется/размонтируется (например при условном рендере).
 * Callback хранится в ref — пересоздание observer не требуется при изменении callback.
 */
export function useResizeObserver(
    element: Element | null,
    callback: (entry: ResizeObserverEntry) => void
): void {
    const callbackRef = useRef(callback);
    callbackRef.current = callback;

    useEffect(() => {
        if (!element) return;
        const observer = new ResizeObserver(entries => {
            if (entries[0]) callbackRef.current(entries[0]);
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, [element]);
}
