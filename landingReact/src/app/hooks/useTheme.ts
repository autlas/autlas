import { useState, useEffect } from "react";
import { safeSetItem } from "../utils/safeStorage";

function updatePalette(val: number) {
  const base = Math.floor((31 * val) / 100);
  const side = Math.floor((37 * val) / 100);
  const tagActiveHover = Math.min(255, side + 16);
  const tagActive = Math.min(255, side + 12);
  const tagHover = Math.min(255, side + 6);
  const tagDrag = Math.min(255, side + 8);
  document.documentElement.style.setProperty("--bg-primary", `rgb(${base}, ${base}, ${base})`);
  document.documentElement.style.setProperty("--bg-secondary", `rgb(${side}, ${side}, ${side})`);
  document.documentElement.style.setProperty("--bg-tag", `transparent`);
  document.documentElement.style.setProperty("--bg-tag-active", `rgb(${tagActive}, ${tagActive}, ${tagActive})`);
  document.documentElement.style.setProperty("--bg-tag-active-hover", `rgb(${tagActiveHover}, ${tagActiveHover}, ${tagActiveHover})`);
  document.documentElement.style.setProperty("--bg-tag-hover", `rgb(${tagHover}, ${tagHover}, ${tagHover})`);
  document.documentElement.style.setProperty("--bg-tag-drag", `rgb(${tagDrag}, ${tagDrag}, ${tagDrag})`);
  const surfaceOpacity = val < 10 ? 0 : 0.03;
  document.documentElement.style.setProperty("--bg-tertiary", surfaceOpacity === 0 ? 'transparent' : `rgba(255, 255, 255, ${surfaceOpacity})`);
  document.documentElement.style.setProperty("--bg-tertiary-hover", `rgba(255, 255, 255, ${val < 10 ? 0.02 : 0.06})`);
  document.documentElement.style.setProperty("--border-color", val < 10 ? "rgba(255, 255, 255, 0.06)" : "rgba(255, 255, 255, 0.05)");
  document.documentElement.style.setProperty("--accent-indigo", "#6366f1");
}

export function useTheme() {
  const [brightness, setBrightness] = useState(() => parseInt(localStorage.getItem("app-brightness") || "10"));
  const [textContrast, setTextContrast] = useState(() => parseFloat(localStorage.getItem("text-contrast") || "1.3"));
  const [fontScale, setFontScale] = useState(() => parseFloat(localStorage.getItem("font-scale") || "1.0"));
  const [vimModeNav, setVimModeNav] = useState<"hjkl" | "jk">(() => (localStorage.getItem("ahk_vim_mode_nav") as "hjkl" | "jk") || "hjkl");

  useEffect(() => {
    updatePalette(brightness);
    safeSetItem("app-brightness", brightness.toString());
  }, [brightness]);

  useEffect(() => {
    document.documentElement.style.setProperty("--contrast-factor", textContrast.toFixed(2));
    safeSetItem("text-contrast", textContrast.toString());
  }, [textContrast]);

  useEffect(() => {
    document.documentElement.style.setProperty("--font-scale", fontScale.toFixed(2));
    safeSetItem("font-scale", fontScale.toString());
  }, [fontScale]);

  return {
    brightness, setBrightness,
    textContrast, setTextContrast,
    fontScale, setFontScale,
    vimModeNav, setVimModeNav,
  };
}
