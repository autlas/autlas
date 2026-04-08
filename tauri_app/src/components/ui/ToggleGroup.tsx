import React, { useRef, useState, useLayoutEffect } from "react";
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

    function movePill(animate: boolean) {
        const container = containerRef.current;
        const pill = pillRef.current;
        if (!container || !pill) return;
        const activeBtn = container.querySelector<HTMLElement>(`[data-toggle-id="${value}"]`);
        if (!activeBtn || activeBtn.offsetWidth === 0) return;

        if (!animate) {
            pill.style.transition = 'none';
            pill.offsetHeight;
        } else {
            pill.style.transition = '';
        }
        pill.style.left = `${activeBtn.offsetLeft}px`;
        pill.style.width = `${activeBtn.offsetWidth}px`;
        if (!animate) {
            pill.offsetHeight;
            pill.style.transition = '';
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
    }, [value]);

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
                className={`absolute top-1 h-[calc(100%-8px)] rounded-lg bg-white/10 shadow-lg shadow-white/5 transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] pointer-events-none ${ready ? '' : 'opacity-0'}`}
            />

            {options.map((opt) => {
                const isActive = value === opt.id;
                const btn = (
                    <button
                        key={opt.id}
                        data-toggle-id={opt.id}
                        onClick={() => !disabled && onChange(opt.id)}
                        className={`relative z-10 flex-1 h-full rounded-lg transition-colors duration-200 flex items-center justify-center cursor-pointer
                            ${opt.icon ? "px-4" : "text-[10px] font-black tracking-widest uppercase"}
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
