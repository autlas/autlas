import React from "react";
import Tooltip from "./Tooltip";

const colorMap = {
    indigo: "hover:bg-indigo-500/10 hover:text-indigo-400 hover:border-indigo-500/20",
    red: "hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/20",
    yellow: "hover:bg-yellow-500/10 hover:text-yellow-500 hover:border-yellow-500/20",
    green: "hover:bg-green-500/10 hover:text-green-500 hover:border-green-500/20",
} as const;

const colorMapWide = {
    indigo: "hover:bg-indigo-500/10 hover:text-indigo-400 hover:border-indigo-500/30",
    red: "hover:bg-red-500/15 hover:text-red-500 hover:border-red-500/30",
    yellow: "hover:bg-yellow-500/10 hover:text-yellow-500 hover:border-yellow-500/30",
    green: "hover:bg-green-600/15 hover:text-green-500 hover:border-green-500/30",
} as const;

interface ActionButtonProps {
    color: keyof typeof colorMap;
    variant?: "compact" | "wide";
    onClick: (e: React.MouseEvent) => void;
    title?: string;
    shortcut?: string | string[];
    className?: string;
    children: React.ReactNode;
    animateIn?: boolean;
    animationDelay?: number;
}

export default function ActionButton({ color, variant = "compact", onClick, title, shortcut, className, children, animateIn, animationDelay = 0 }: ActionButtonProps) {
    const sizeClass = variant === "compact"
        ? "w-7 h-7 flex-shrink-0 rounded-lg"
        : "flex-1 h-[42px] rounded-2xl";
    const hoverClass = variant === "compact" ? colorMap[color] : colorMapWide[color];

    const btn = (
        <button
            onClick={(e) => { e.stopPropagation(); onClick(e); }}
            onMouseDown={(e) => e.stopPropagation()}
            className={`${sizeClass} flex items-center justify-center bg-white/5 text-[#71717a] border border-white/5 ${hoverClass} transition-all cursor-pointer pointer-events-auto ${animateIn ? 'animate-action-in' : ''} ${className ?? ""}`}
            style={animateIn ? { animationDelay: `${animationDelay}ms` } : undefined}
        >
            {children}
        </button>
    );

    if (title) return <Tooltip text={title} shortcut={shortcut}>{btn}</Tooltip>;
    return btn;
}
