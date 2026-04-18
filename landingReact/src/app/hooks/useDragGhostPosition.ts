import { useEffect } from "react";

/**
 * Tracks mouse position and translates the drag ghost element on mousemove.
 * Uses requestAnimationFrame coalescing so the ghost never moves more than
 * once per frame, no matter how fast the cursor flies.
 *
 * Tag drags snap the ghost's X to `offsetX` (stationary X, follows Y only)
 * so the ghost sits flush against a sidebar rail; script drags float freely.
 */
export function useDragGhostPosition(
  ghostRef: React.RefObject<HTMLDivElement | null>,
  tagDragOffsetXRef: React.RefObject<number>,
  tagDragOffsetYRef: React.RefObject<number>,
) {
  useEffect(() => {
    let animationFrameId = 0;
    let latestX = 0;
    let latestY = 0;
    let isDragging = false;

    const updatePosition = () => {
      if (ghostRef.current && isDragging) {
        const type = ghostRef.current.getAttribute("data-drag-type");
        if (type === "tag") {
          ghostRef.current.style.transform = `translate3d(${tagDragOffsetXRef.current}px, ${latestY - tagDragOffsetYRef.current - 1}px, 0) translate(-50%, 0) scale(1)`;
        } else {
          ghostRef.current.style.transform = `translate3d(${latestX}px, ${latestY}px, 0) translate(-50%, -50%) scale(1.05)`;
        }
      }
      animationFrameId = 0;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!ghostRef.current) return;
      if (ghostRef.current.getAttribute("data-dragging") !== "true") { isDragging = false; return; }
      isDragging = true;
      latestX = e.clientX;
      latestY = e.clientY;
      if (!animationFrameId) animationFrameId = requestAnimationFrame(updatePosition);
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [ghostRef, tagDragOffsetXRef, tagDragOffsetYRef]);
}
