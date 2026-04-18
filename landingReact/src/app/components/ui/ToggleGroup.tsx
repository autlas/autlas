import React, { useRef, useState, useLayoutEffect, useEffect } from "react";
import Tooltip from "./Tooltip";

export interface ToggleOption<T extends string> {
    id: T;
    label?: string;
    icon?: (isActive: boolean) => React.ReactNode;
    title?: string;
    shortcut?: string | string[];
}

interface ToggleGroupProps<T extends string> {
    options: ToggleOption<T>[];
    value: T;
    onChange: (value: T) => void;
    disabled?: boolean;
    className?: string;
}

export default function ToggleGroup<T extends string>({
    options, value, onChange, disabled, className,
}: ToggleGroupProps<T>) {
    const containerRef = useRef<HTMLDivElement>(null);
    const pillRef = useRef<HTMLDivElement>(null);
    const [ready, setReady] = useState(false);
    const isFirstRender = useRef(true);
    const wasHidden = useRef(false);

    // Optimistic local value: lets the pill (and active styling) flip on the
    // very next paint when the parent's `value` is driven by a deferred
    // (concurrent) state update — otherwise the toggle would lag behind the
    // expensive view-mode swap downstream.
    const [optimisticValue, setOptimisticValue] = useState(value);
    useEffect(() => { setOptimisticValue(value); }, [value]);
    const activeValue = optimisticValue;
    // Mirror activeValue into a ref so callbacks captured in long-lived
    // effects (e.g. the IntersectionObserver below, which is set up once)
    // always read the current value instead of a stale closure — that was
    // the source of the "pill on one button, white text on another" bug.
    const activeValueRef = useRef(activeValue);
    activeValueRef.current = activeValue;

    // Base width the pill is sized to in CSS. We then apply
    // transform: translate3d(left, 0, 0) scaleX(width / PILL_BASE_WIDTH).
    // Both translate and scale are composited on the GPU, so the animation
    // stays smooth even when the main thread is busy re-rendering the tree.
    const PILL_BASE_WIDTH = 100;
    const PILL_TRANSITION = "transform 300ms cubic-bezier(0.4,0,0.2,1)";

    function movePill(animate: boolean) {
        const container = containerRef.current;
        const pill = pillRef.current;
        if (!container || !pill) return;
        const activeBtn = container.querySelector<HTMLElement>(`[data-toggle-id="${activeValueRef.current}"]`);
        if (!activeBtn || activeBtn.offsetWidth === 0) return;

        if (!animate) {
            pill.style.transition = "none";
            pill.offsetHeight;
        } else {
            pill.style.transition = PILL_TRANSITION;
        }
        const scale = activeBtn.offsetWidth / PILL_BASE_WIDTH;
        pill.style.transform = `translate3d(${activeBtn.offsetLeft}px, 0, 0) scaleX(${scale})`;
        if (!animate) {
            pill.offsetHeight;
            pill.style.transition = PILL_TRANSITION;
        }
        setReady(true);
    }

    // On value change: first render = no animation, subsequent = animate
    useLayoutEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            movePill(false);
        } else if (wasHidden.current) {
            wasHidden.current = false;
            movePill(false);
        } else {
            movePill(true);
        }
    }, [activeValue]);

    // Track visibility for display:none cached tabs
    useLayoutEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        let prevVisible = true;
        const observer = new IntersectionObserver((entries) => {
            const visible = entries[0]?.isIntersecting ?? false;
            if (visible && !prevVisible) {
                // Was hidden, now visible — restore position without animation
                wasHidden.current = true;
                movePill(false);
            }
            prevVisible = visible;
        });
        observer.observe(container);
        return () => observer.disconnect();
    }, []);

    return (
        <div
            ref={containerRef}
            className={`relative flex bg-[var(--bg-tertiary)] border border-white/5 rounded-xl p-1 gap-1 h-[42px] items-center ${className ?? ""}`}
        >
            <div
                ref={pillRef}
                className={`absolute top-1 left-0 h-[calc(100%-8px)] rounded-lg bg-white/10 shadow-lg shadow-white/5 pointer-events-none ${ready ? '' : 'opacity-0'}`}
                style={{
                    width: `${PILL_BASE_WIDTH}px`,
                    transformOrigin: 'left center',
                    willChange: 'transform',
                    transition: 'transform 300ms cubic-bezier(0.4,0,0.2,1)',
                }}
            />

            {options.map((opt) => {
                const isActive = activeValue === opt.id;
                const btn = (
                    <button
                        key={opt.id}
                        data-toggle-id={opt.id}
                        onClick={(e) => {
                            if (disabled) return;
                            // Imperatively flip the pill on the next paint so
                            // the click feels instant even when the parent's
                            // state update kicks off a heavy downstream
                            // re-render. Button/icon classes are driven by
                            // React's own render — setting them imperatively
                            // would leave inline styles that win over className
                            // on subsequent clicks (pre-existing bug: icon
                            // opacity stayed stuck after mouse-switching).
                            const pill = pillRef.current;
                            const btnEl = e.currentTarget as HTMLElement;
                            if (pill && btnEl) {
                                pill.style.transition = 'transform 300ms cubic-bezier(0.4,0,0.2,1)';
                                const scale = btnEl.offsetWidth / PILL_BASE_WIDTH;
                                pill.style.transform = `translate3d(${btnEl.offsetLeft}px, 0, 0) scaleX(${scale})`;
                            }
                            setOptimisticValue(opt.id);
                            onChange(opt.id);
                        }}
                        className={`relative z-10 flex-1 h-full rounded-lg transition-colors duration-200 flex items-center justify-center cursor-pointer focus:outline-none focus-visible:outline-none
                            ${opt.icon ? "px-4" : "text-2xs font-black tracking-widest uppercase"}
                            ${isActive
                                ? "text-white"
                                : `${opt.icon ? "" : "text-tertiary"} hover:text-white hover:bg-white/5`}
                            ${disabled ? "opacity-20 pointer-events-none" : ""}`}
                    >
                        {opt.icon ? opt.icon(isActive) : opt.label}
                    </button>
                );
                return opt.title ? <Tooltip key={opt.id} text={opt.title} shortcut={opt.shortcut}>{btn}</Tooltip> : btn;
            })}
        </div>
    );
}
