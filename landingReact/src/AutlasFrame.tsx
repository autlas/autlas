import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import AutlasApp from "./app/App";
import "./autlas-frame.css";

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

  // Keep the portal glued to the anchor rect.
  useLayoutEffect(() => {
    if (!mounted) return;
    const anchor = anchorRef.current;
    const host = portalRef.current;
    if (!anchor || !host) return;

    const sync = () => {
      const r = anchor.getBoundingClientRect();
      host.style.position = "fixed";
      host.style.top = `${r.top}px`;
      host.style.left = `${r.left}px`;
      host.style.width = `${r.width}px`;
      host.style.height = `${r.height}px`;
      host.style.zIndex = "5";
    };
    sync();

    const ro = new ResizeObserver(sync);
    ro.observe(anchor);
    ro.observe(document.documentElement);
    window.addEventListener("scroll", sync, true);
    window.addEventListener("resize", sync);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", sync, true);
      window.removeEventListener("resize", sync);
    };
  }, [mounted]);

  return (
    <div className="autlas-wrap">
      <span className="autlas-badge">live demo · mock data</span>
      <div ref={anchorRef} className="autlas-frame" aria-hidden="true" />
      {mounted && portalRef.current && createPortal(
        <div className="autlas-viewport">
          <AutlasApp />
        </div>,
        portalRef.current,
      )}
    </div>
  );
}
