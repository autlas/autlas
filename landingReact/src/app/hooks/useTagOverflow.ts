import { useLayoutEffect, useRef, useState, useCallback } from "react";
import { useResizeObserver } from "./useResizeObserver";

const DEFAULT_COUNTER_WIDTH = 42;
const DEFAULT_TAG_CLASS = "text-xs font-bold px-3 h-7 rounded-lg mr-2 leading-none flex items-center bg-[var(--bg-tertiary)] border border-white/5";

/**
 * Measures how many tags fit inside the given container and how many overflow.
 * Creates a hidden measurement element inside the container to read tag widths.
 * Reacts to tag list changes and container resize.
 */
export function useTagOverflow(
    tags: string[],
    containerRef: React.RefObject<HTMLElement | null>,
    options?: { tagClass?: string; counterWidth?: number },
): { visibleCount: number; hiddenCount: number; isMeasured: boolean } {
    const TAG_CLASS = options?.tagClass ?? DEFAULT_TAG_CLASS;
    const COUNTER_WIDTH = options?.counterWidth ?? DEFAULT_COUNTER_WIDTH;
    const [visibleCount, setVisibleCount] = useState(tags.length);
    const [isMeasured, setIsMeasured] = useState(false);
    const tagWidthsRef = useRef<number[]>([]);
    const tagsLength = tags.length;

    const recalc = useCallback(() => {
        const container = containerRef.current;
        if (!container) return;
        const containerWidth = container.offsetWidth;
        if (containerWidth < 30) return;
        const widths = tagWidthsRef.current;
        const available = containerWidth;

        if (widths.length === 0 || widths.length < tagsLength) return;

        let totalWidth = 0;
        let count = 0;
        for (let i = 0; i < widths.length; i++) {
            const isLast = i === widths.length - 1;
            const reqSpace = totalWidth + widths[i] + (isLast ? 0 : COUNTER_WIDTH);
            if (reqSpace > available) break;
            totalWidth += widths[i];
            count++;
        }
        if (count === 0 && widths.length > 0) count = 1;
        setVisibleCount(count);
        setIsMeasured(true);
    }, [tagsLength, containerRef]);

    // Track the current container element so effects re-run when it mounts/unmounts.
    const [containerEl, setContainerEl] = useState<HTMLElement | null>(null);
    useLayoutEffect(() => {
        if (containerRef.current !== containerEl) {
            setContainerEl(containerRef.current);
        }
    });

    // Persistent hidden measuring element attached to the container.
    const measureElRef = useRef<HTMLDivElement | null>(null);

    // Measure tag widths whenever the tag list or container changes.
    const tagsKey = tags.join("\u0001");
    useLayoutEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        let measureEl = measureElRef.current;
        if (!measureEl || measureEl.parentNode !== container) {
            measureEl = document.createElement("div");
            measureEl.className = "absolute opacity-0 pointer-events-none flex whitespace-nowrap -z-50";
            container.appendChild(measureEl);
            measureElRef.current = measureEl;
        }

        measureEl.innerHTML = "";
        for (const tag of tags) {
            const span = document.createElement("span");
            span.className = TAG_CLASS;
            span.textContent = tag;
            measureEl.appendChild(span);
        }

        const children = Array.from(measureEl.children) as HTMLElement[];
        tagWidthsRef.current = children.map(c => c.offsetWidth + 8);

        recalc();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tagsKey, containerEl]);

    // Observe container resize — recalculate visible count when width changes.
    useResizeObserver(containerEl, () => {
        requestAnimationFrame(recalc);
    });

    return {
        visibleCount,
        hiddenCount: Math.max(0, tags.length - visibleCount),
        isMeasured,
    };
}
