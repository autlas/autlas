import { useState, useRef, useCallback, useEffect, cloneElement, isValidElement, ReactElement } from "react";
import { createPortal } from "react-dom";
import { useVimEnabled } from "../../hooks/useVimEnabled";

interface TooltipProps {
    text: string;
    children: ReactElement;
    delay?: number;
    side?: "top" | "bottom" | "right";
    shortcut?: string | string[];
}

export default function Tooltip({ text, children, delay = 0, side: preferredSide, shortcut }: TooltipProps) {
    const vimEnabled = useVimEnabled();
    // Hide kbd hints when vim mode is off — the keys won't actually do anything.
    const shortcutKeys = !vimEnabled || shortcut == null ? null : (Array.isArray(shortcut) ? shortcut : [shortcut]);
    const [visible, setVisible] = useState(false);
    const [pos, setPos] = useState<{ x: number; y: number; side: "top" | "bottom" | "right"; arrowY?: number; arrowX: number } | null>(null);
    const triggerRef = useRef<HTMLElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

    const show = useCallback(() => {
        timerRef.current = setTimeout(() => setVisible(true), delay);
    }, [delay]);

    const hide = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        setVisible(false);
        setPos(null);
    }, []);

    useEffect(() => {
        if (!visible || !triggerRef.current) return;

        const compute = () => {
            const trigger = triggerRef.current;
            const tooltip = tooltipRef.current;
            if (!trigger || !tooltip) return;

            const tr = trigger.getBoundingClientRect();
            const tt = tooltip.getBoundingClientRect();
            const GAP = 10;
            const EDGE_PAD = 8;

            if (preferredSide === "right") {
                const x = tr.right + GAP;
                const centerY = tr.top + tr.height / 2;
                let y = centerY - tt.height / 2;
                y = Math.max(EDGE_PAD, Math.min(y, window.innerHeight - tt.height - EDGE_PAD));
                const arrowY = Math.max(8, Math.min(centerY - y, tt.height - 8));
                setPos({ x, y, side: "right", arrowX: 0, arrowY });
                return;
            }

            let side: "top" | "bottom" = "top";
            let y = tr.top - tt.height - GAP;
            if (y < EDGE_PAD) {
                side = "bottom";
                y = tr.bottom + GAP;
            }

            const centerX = tr.left + tr.width / 2;
            let x = centerX - tt.width / 2;
            x = Math.max(EDGE_PAD, Math.min(x, window.innerWidth - tt.width - EDGE_PAD));

            const arrowX = Math.max(8, Math.min(centerX - x, tt.width - 8));

            setPos({ x, y, side, arrowX });
        };

        requestAnimationFrame(compute);
    }, [visible, preferredSide]);

    useEffect(() => {
        return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }, []);

    if (!text || !isValidElement(children)) return <>{children}</>;

    const mergedRef = (node: HTMLElement | null) => {
        (triggerRef as React.MutableRefObject<HTMLElement | null>).current = node;
        const childRef = (children.props as any).ref;
        if (typeof childRef === 'function') childRef(node);
        else if (childRef && typeof childRef === 'object') (childRef as React.MutableRefObject<HTMLElement | null>).current = node;
    };

    const child = cloneElement(children as ReactElement<any>, {
        ref: mergedRef,
        onMouseEnter: (e: MouseEvent) => {
            show();
            (children.props as any).onMouseEnter?.(e);
        },
        onMouseLeave: (e: MouseEvent) => {
            hide();
            (children.props as any).onMouseLeave?.(e);
        },
    });

    return (
        <>
            {child}
            {visible && createPortal(
                <div
                    ref={tooltipRef}
                    className={`fixed z-[100010] pointer-events-none ${pos ? 'opacity-100' : 'opacity-0'}`}
                    style={pos ? {
                        left: pos.x,
                        top: pos.y,
                    } : {
                        left: -9999,
                        top: -9999,
                    }}
                >
                    <div className="relative px-3 py-1.5 rounded-lg bg-black/20 backdrop-blur-md border border-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.5)] flex items-center gap-2" style={{ maxWidth: `calc(100vw - 16px)` }}>
                        <span className="text-xs font-bold text-secondary">{text}</span>
                        {shortcutKeys && shortcutKeys.length > 0 && (
                            <span className="flex items-center gap-1">
                                {shortcutKeys.map((k, i) => (
                                    <kbd key={i} className="px-1.5 py-0.5 rounded-md bg-white/10 border border-white/15 text-[14px] font-bold text-white/70 leading-none">{k}</kbd>
                                ))}
                            </span>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
