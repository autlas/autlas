import { useEffect, useRef } from "react";

/**
 * Web Animations API-based spin for a refresh icon.
 * Starts infinite rotation when `isRefreshing` is true. When it flips to
 * false, continues rotation to the next 180° multiple with a springy easing.
 */
export function useRefreshAnimation(
  iconRef: React.RefObject<HTMLDivElement | null>,
  isRefreshing: boolean,
) {
  const activeAnimRef = useRef<Animation | null>(null);

  useEffect(() => {
    const icon = iconRef.current;
    if (!icon) return;

    if (isRefreshing) {
      if (activeAnimRef.current) activeAnimRef.current.cancel();
      activeAnimRef.current = icon.animate(
        [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }],
        { duration: 800, iterations: Infinity, easing: "linear" },
      );
    } else {
      if (activeAnimRef.current && activeAnimRef.current.playState !== "idle") {
        const style = window.getComputedStyle(icon);
        const matrix = new DOMMatrix(style.transform);
        const currentAngle = Math.round(Math.atan2(matrix.b, matrix.a) * (180 / Math.PI));
        activeAnimRef.current.cancel();
        activeAnimRef.current = null;

        const startDeg = currentAngle < 0 ? currentAngle + 360 : currentAngle;
        let targetDeg = startDeg + 360;
        targetDeg = Math.ceil(targetDeg / 180) * 180;

        icon.animate(
          [{ transform: `rotate(${startDeg}deg)` }, { transform: `rotate(${targetDeg}deg)` }],
          { duration: 800, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)", fill: "forwards" },
        ).onfinish = () => { icon.style.transform = `rotate(${targetDeg % 360}deg)`; };
      }
    }
  }, [isRefreshing, iconRef]);
}
