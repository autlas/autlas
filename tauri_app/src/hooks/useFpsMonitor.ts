import { useEffect } from "react";
import Stats from "stats.js";

/**
 * Mounts a stats.js FPS/MS/MB overlay in the top-left corner.
 * Only active when `ahk_mock_scripts` is set in localStorage — a dev-only
 * feature used alongside fake data generation for performance testing.
 *
 * Click the panel to cycle panels (FPS → MS → MB) — built into stats.js.
 */
export function useFpsMonitor() {
  useEffect(() => {
    const mockCount = parseInt(localStorage.getItem("ahk_mock_scripts") || "0");
    if (mockCount <= 0) return;
    const stats = new Stats();
    stats.showPanel(0); // 0: fps, 1: ms, 2: mb
    stats.dom.style.cssText = "position:fixed;top:0;left:0;z-index:99999;opacity:0.85;";
    document.body.appendChild(stats.dom);
    let raf: number;
    const loop = () => { stats.end(); stats.begin(); raf = requestAnimationFrame(loop); };
    stats.begin();
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); stats.dom.remove(); };
  }, []);
}
