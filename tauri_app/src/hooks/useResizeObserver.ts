import { useEffect, useRef } from "react";

/**
 * Thin wrapper around ResizeObserver.
 * Returns a ref to attach to the element to observe.
 * The callback is stored in a ref so the observer is not recreated on re-render.
 */
export function useResizeObserver<T extends Element>(
    callback: (entry: ResizeObserverEntry) => void
): React.RefObject<T | null> {
    const ref = useRef<T | null>(null);
    const callbackRef = useRef(callback);

    useEffect(() => {
        callbackRef.current = callback;
    }, [callback]);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        const observer = new ResizeObserver(entries => {
            if (entries[0]) callbackRef.current(entries[0]);
        });

        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    return ref;
}
