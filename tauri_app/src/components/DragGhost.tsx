import React from "react";

interface DragGhostProps {
  ghostRef: React.RefObject<HTMLDivElement | null>;
  draggedScript: { path: string; filename: string; tags: string[] } | null;
  draggedTag: string | null;
  activeTab: string;
  dragGhostSize: { w: number; h: number };
}

export default function DragGhost({ ghostRef, draggedScript, draggedTag, activeTab, dragGhostSize }: DragGhostProps) {
  return (
    <div
      ref={ghostRef}
      data-dragging="false"
      data-drag-type={draggedTag ? "tag" : draggedScript ? "script" : "none"}
      className={`drag-ghost-container fixed z-[99999] flex items-center justify-between ${draggedScript || draggedTag ? "opacity-100" : "opacity-0 hidden"}
        ${draggedTag
          ? (draggedTag === activeTab
            ? "w-[240px] px-6 h-12 rounded-2xl shadow-xl text-indigo-400 font-bold"
            : "w-[240px] px-6 h-12 rounded-2xl shadow-2xl text-secondary font-bold"
          )
          : (draggedScript ? "bg-white/10 border border-white/20 shadow-2xl backdrop-blur-xl rounded-2xl px-6 py-3 text-white font-bold whitespace-nowrap space-x-3" : "")
        }
      `}
      style={{
        left: 0,
        top: 0,
        width: draggedTag ? `${dragGhostSize.w + 12}px` : "auto",
        height: draggedTag ? `${dragGhostSize.h + 2}px` : "auto",
        paddingLeft: draggedTag ? "30px" : undefined,
        paddingRight: draggedTag ? "30px" : undefined,
        willChange: "transform, opacity",
        backgroundColor: draggedTag
          ? (draggedTag === activeTab ? "var(--bg-tag-active-hover)" : "var(--bg-tag-drag)")
          : "transparent",
        viewTransitionName: "drag-ghost",
      } as React.CSSProperties}
    >
      {draggedScript && (
        <>
          <div className="w-2 h-2 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]"></div>
          <span className="text-xs font-semibold text-white tracking-wide">{draggedScript.filename}</span>
        </>
      )}
      {draggedTag && (
        <span className="text-sm font-bold truncate flex-1">{draggedTag}</span>
      )}
    </div>
  );
}
