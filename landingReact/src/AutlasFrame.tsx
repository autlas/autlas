import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import AutlasApp from "./app/App";
import "./autlas-frame.css";

/**
 * Tilt tuning — mouse far from the frame = strong tilt, cursor on/near
 * the frame = no tilt. Smoothed on rAF.
 *
 * Growth rate = TILT_MAX_DEG / TILT_RANGE_PX (deg per px away from the
 * frame edge). TILT_CAP_DEG hard-limits the final angle so the tile
 * doesn't hit that limit even if the mouse is very far away.
 */
const TILT_MAX_DEG = 8;
const TILT_RANGE_PX = 900;
const TILT_CAP_DEG = 4;
const TILT_EASE = 0.12;

/**
 * Render the real autlas app through a React portal into `document.body`
 * so the embedded app lives OUTSIDE `.landing-root`. The upside:
 *   - useTheme() writes CSS vars to `document.documentElement`, and the
 *     portaled app inherits them directly.
 *   - Landing styles (scoped to .landing-root) never leak in, and the
 *     landing's own frozen token overrides don't leak the other way.
 *
 * The anchor div stays in landing DOM at natural layout size; the portal
 * is position: fixed and tracks the anchor via ResizeObserver.
 */
export default function AutlasFrame() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);

  // Create the portal host once, under <body>.
  useEffect(() => {
    const host = document.createElement("div");
    host.className = "autlas-portal";
    document.body.appendChild(host);
    portalRef.current = host;
    setMounted(true);
    return () => {
      document.body.removeChild(host);
      portalRef.current = null;
    };
  }, []);

  // Parallax tilt: mouse far from the frame → strong tilt, on the
  // frame → no tilt. Runs entirely on rAF and writes to CSS custom
  // properties so the wrap + portal can inherit them.
  useEffect(() => {
    const wrap = wrapRef.current;
    const host = portalRef.current;
    if (!wrap || !host) return;

    let mouseX = -9999, mouseY = -9999;
    let curTX = 0, curTY = 0;
    let targetTX = 0, targetTY = 0;
    let hasMoved = false;
    let raf = 0;

    const onMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      hasMoved = true;
      schedule();
    };

    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(tick);
    };

    const tick = () => {
      raf = 0;
      const anchor = anchorRef.current;
      if (!anchor) return;

      if (hasMoved) {
        const r = anchor.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const dx = mouseX - cx;
        const dy = mouseY - cy;

        const outX = Math.max(0, Math.abs(dx) - r.width / 2);
        const outY = Math.max(0, Math.abs(dy) - r.height / 2);
        const outside = Math.hypot(outX, outY);
        const amp = Math.min(outside / TILT_RANGE_PX, 1);

        // Direction: the frame tips toward the mouse — right mouse
        // pushes the right edge forward (rotateY negative). Growth rate
        // is unchanged; the angle is just capped at TILT_CAP_DEG.
        const hyp = Math.hypot(dx, dy) || 1;
        const cap = (v: number) => Math.max(-TILT_CAP_DEG, Math.min(TILT_CAP_DEG, v));
        targetTY = cap(-(dx / hyp) * TILT_MAX_DEG * amp);
        targetTX = cap((dy / hyp) * TILT_MAX_DEG * amp);
      }

      curTX += (targetTX - curTX) * TILT_EASE;
      curTY += (targetTY - curTY) * TILT_EASE;

      wrap.style.setProperty("--tilt-x", `${curTX.toFixed(2)}deg`);
      wrap.style.setProperty("--tilt-y", `${curTY.toFixed(2)}deg`);
      host.style.setProperty("--tilt-x", `${curTX.toFixed(2)}deg`);
      host.style.setProperty("--tilt-y", `${curTY.toFixed(2)}deg`);

      if (Math.abs(targetTX - curTX) > 0.01 || Math.abs(targetTY - curTY) > 0.01) {
        schedule();
      }
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mouseleave", () => { targetTX = 0; targetTY = 0; schedule(); });
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [mounted]);

  // Keep the portal glued to the anchor rect.
  useLayoutEffect(() => {
    if (!mounted) return;
    const anchor = anchorRef.current;
    const host = portalRef.current;
    if (!anchor || !host) return;

    // Absolute positioning in document coordinates — the browser scrolls
    // the portal together with the page, so no scroll listener is
    // needed and there's no compositor-vs-JS lag.
    const sync = () => {
      const r = anchor.getBoundingClientRect();
      host.style.position = "absolute";
      host.style.top = `${r.top + window.scrollY}px`;
      host.style.left = `${r.left + window.scrollX}px`;
      host.style.width = `${r.width}px`;
      host.style.height = `${r.height}px`;
      host.style.zIndex = "1";
    };
    sync();

    const ro = new ResizeObserver(sync);
    ro.observe(anchor);
    ro.observe(document.documentElement);
    window.addEventListener("resize", sync);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, [mounted]);

  return (
    <div ref={wrapRef} className="autlas-wrap">
      <div ref={anchorRef} className="autlas-frame" aria-hidden="true" />
      {mounted && portalRef.current && createPortal(
        <>
          <span className="autlas-badge">live demo · mock data</span>
          <div className="autlas-portal-frame">
            <div className="autlas-viewport">
              <AutlasApp />
            </div>
          </div>
        </>,
        portalRef.current,
      )}
    </div>
  );
}
