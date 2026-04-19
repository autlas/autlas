import React from "react";
import { createPortal } from "react-dom";
import { TagDotIcon, TagIconSvg } from "../ui/Icons";
import { useTreeStore } from "../../store/useTreeStore";

interface DragGhostProps {
  ghostRef: React.RefObject<HTMLDivElement | null>;
  draggedScript: { path: string; filename: string; tags: string[] } | null;
  draggedTag: string | null;
  activeTab: string;
  dragGhostSize: { w: number; h: number };
}

export default function DragGhost({ ghostRef, draggedScript, draggedTag, activeTab, dragGhostSize }: DragGhostProps) {
  // Collapsed sidebar tag tiles are square (~48×48). The default ghost shape
  // (wide pill for expanded mode) would render them as rectangles, which the
  // user rightly flagged as off. Detect square source and mirror it.
  const isSquareSource = draggedTag && Math.abs(dragGhostSize.w - dragGhostSize.h) < 4;
  // Portal to <body> so the ghost's viewport coordinates aren't warped
  // by the transformed .autlas-portal ancestor (same reason as ContextMenu).
  return createPortal(
    <div
      ref={ghostRef}
      data-dragging="false"
      data-drag-type={draggedTag ? "tag" : draggedScript ? "script" : "none"}
      className={`drag-ghost-container fixed z-[99999] flex items-center ${isSquareSource ? 'justify-center' : 'justify-between'} ${draggedScript || draggedTag ? "opacity-100" : "opacity-0 hidden"}
        ${draggedTag
          ? (draggedTag === activeTab
            ? "rounded-2xl shadow-xl text-white/80 font-bold overflow-hidden"
            : "rounded-2xl shadow-2xl text-secondary font-bold overflow-hidden"
          )
          : (draggedScript ? "bg-black/20 backdrop-blur-md border border-white/10 shadow-2xl rounded-2xl px-6 py-3 text-white font-bold whitespace-nowrap space-x-3" : "")
        }
      `}
      style={{
        left: 0,
        top: 0,
        // For square source the ghost grows by the same small +2 delta on
        // both axes (matching the original rect-mode vertical delta), so the
        // cursor stays near the visual center and the icon doesn't jump.
        width: draggedTag ? `${dragGhostSize.w + (isSquareSource ? 2 : 12)}px` : "auto",
        height: draggedTag ? `${(isSquareSource ? dragGhostSize.w : dragGhostSize.h) + 2}px` : "auto",
        paddingLeft: draggedTag ? (isSquareSource ? "0" : "19px") : undefined,
        paddingRight: draggedTag ? (isSquareSource ? "0" : "19px") : undefined,
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
        <>
          <span className="flex-shrink-0">
            {useTreeStore.getState().tagIcons[draggedTag]
              ? <TagIconSvg name={useTreeStore.getState().tagIcons[draggedTag]} size={22} weight={draggedTag === activeTab ? "fill" : "bold"} />
              : <TagDotIcon size={22} weight={draggedTag === activeTab ? "fill" : "bold"} />
            }
          </span>
          {!isSquareSource && (
            <span className="text-sm font-bold truncate flex-1 ml-3">{draggedTag}</span>
          )}
        </>
      )}
    </div>,
    document.body,
  );
}
