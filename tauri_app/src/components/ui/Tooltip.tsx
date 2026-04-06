import { useState, useRef, useCallback, useEffect, cloneElement, isValidElement, ReactElement } from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
    text: string;
    children: ReactElement;
    delay?: number;
}

export default function Tooltip({ text, children, delay = 0 }: TooltipProps) {
    const [visible, setVisible] = useState(false);
    const [pos, setPos] = useState<{ x: number; y: number; side: "top" | "bottom"; arrowX: number } | null>(null);
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
    }, [visible]);

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
                    className={`fixed z-[100010] pointer-events-none transition-opacity duration-150 ${pos ? 'opacity-100' : 'opacity-0'}`}
                    style={pos ? {
                        left: pos.x,
                        top: pos.y,
                    } : {
                        left: -9999,
                        top: -9999,
                    }}
                >
                    <div className="relative px-3 py-1.5 rounded-lg bg-[#1a1a1c]/95 backdrop-blur-xl border border-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.5)]" style={{ maxWidth: `calc(100vw - 16px)` }}>
                        <span className="text-xs font-bold text-secondary">{text}</span>
                        <div
                            className="absolute w-0 h-0"
                            style={{
                                left: pos ? pos.arrowX - 10 : "50%",
                                ...(pos?.side === "top"
                                    ? { bottom: -10, borderLeft: "10px solid transparent", borderRight: "10px solid transparent", borderTop: "10px solid #303032" }
                                    : { top: -10, borderLeft: "10px solid transparent", borderRight: "10px solid transparent", borderBottom: "10px solid #303032" }
                                ),
                            }}
                        />
                        <div
                            className="absolute w-0 h-0"
                            style={{
                                left: pos ? pos.arrowX - 8 : "50%",
                                ...(pos?.side === "top"
                                    ? { bottom: -8, borderLeft: "8px solid transparent", borderRight: "8px solid transparent", borderTop: "8px solid rgba(26,26,28,0.95)" }
                                    : { top: -8, borderLeft: "8px solid transparent", borderRight: "8px solid transparent", borderBottom: "8px solid rgba(26,26,28,0.95)" }
                                ),
                            }}
                        />
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
