import React, { useRef, useState, useLayoutEffect, useCallback } from "react";

export interface ToggleOption<T extends string> {
    id: T;
    label?: string;
    icon?: (isActive: boolean) => React.ReactNode;
    title?: string;
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
    const [pill, setPill] = useState({ left: 0, width: 0 });
    const [ready, setReady] = useState(false);

    const measure = useCallback(() => {
        const container = containerRef.current;
        if (!container) return;
        const activeBtn = container.querySelector<HTMLElement>(`[data-toggle-id="${value}"]`);
        if (!activeBtn) return;
        setPill({
            left: activeBtn.offsetLeft,
            width: activeBtn.offsetWidth,
        });
        setReady(true);
    }, [value]);

    useLayoutEffect(() => {
        measure();
    }, [measure]);

    return (
        <div
            ref={containerRef}
            className={`relative flex bg-white/[0.03] border border-white/5 rounded-xl p-1 gap-1 h-[42px] items-center ${className ?? ""}`}
        >
            {ready && (
                <div
                    className="absolute top-1 h-[calc(100%-8px)] rounded-lg bg-white/10 shadow-lg shadow-white/5 transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] pointer-events-none"
                    style={{ left: pill.left, width: pill.width }}
                />
            )}

            {options.map((opt) => {
                const isActive = value === opt.id;
                return (
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
                        title={opt.title}
                    >
                        {opt.icon ? opt.icon(isActive) : opt.label}
                    </button>
                );
            })}
        </div>
    );
}
