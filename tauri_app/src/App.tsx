import React, { useState, useEffect, useRef, useCallback } from "react";
import ScriptTree from "./components/ScriptTree";
import ContextMenu from "./components/ContextMenu";
import SettingsPanel from "./components/SettingsPanel";
import DragGhost from "./components/DragGhost";
import { useTheme } from "./hooks/useTheme";
import { useScanPaths } from "./hooks/useScanPaths";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useTranslation } from "react-i18next";
import "./App.css";
import { useHotkeys } from "react-hotkeys-hook";

const MemoizedScriptTree = React.memo(ScriptTree);

function App() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem("ahk_active_tab") || "hub");
  const [userTags, setUserTags] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<"tree" | "hub" | "settings">(() => {
    const tab = localStorage.getItem("ahk_active_tab") || "hub";
    if (tab === "settings") return "settings";
    if (tab === "hub") return "hub";
    return "tree";
  });

  const [draggedScript, setDraggedScript] = useState<{ path: string; filename: string; tags: string[] } | null>(null);
  const [dragOverTag, setDragOverTag] = useState<string | null>(null);
  const [isCreatingTagFor, setIsCreatingTagFor] = useState<{ path: string; filename: string; tags: string[] } | null>(null);
  const [newTagName, setNewTagName] = useState("");
  const [draggedTag, setDraggedTag] = useState<string | null>(null);
  const [isRenamingTag, setIsRenamingTag] = useState<string | null>(null);
  const [editTagName, setEditTagName] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [debugMomentum, setDebugMomentum] = useState(0);
  const refreshIconRef = useRef<HTMLDivElement>(null);
  const settingsIconRef = useRef<HTMLDivElement>(null);
  const activeAnimRef = useRef<Animation | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [displayMode, setDisplayMode] = useState<"tree" | "tiles" | "list">(() => {
    const isHub = (localStorage.getItem("ahk_active_tab") || "hub") === "hub";
    const key = isHub ? "ahk_hub_display_mode" : "ahk_tree_display_mode";
    return (localStorage.getItem(key) as "tree" | "tiles" | "list") || (isHub ? "tiles" : "tree");
  });
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; type: "script" | "tag" | "folder" | "general"; data: any } | null>(null);
  const [activeTabPressed, setActiveTabPressed] = useState<string | null>(null);
  const [runningCount, setRunningCount] = useState(0);
  const [lastScanTimestamp, setLastScanTimestamp] = useState<number>(() => {
    const saved = localStorage.getItem("ahk_last_scan_timestamp");
    if (saved) {
      console.log("[App] Initializing lastScanTimestamp from localStorage:", new Date(parseInt(saved)).toLocaleTimeString());
      return parseInt(saved);
    }
    const now = Date.now();
    console.log("[App] No saved timestamp. Initializing as just now:", new Date(now).toLocaleTimeString());
    localStorage.setItem("ahk_last_scan_timestamp", now.toString());
    return now;
  });
  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  const [isHoveringRefresh, setIsHoveringRefresh] = useState(false);

  const { brightness, setBrightness, textContrast, setTextContrast, fontScale, setFontScale, animationsEnabled, toggleAnimations, vimModeNav, setVimModeNav } = useTheme();
  const { scanPaths, handleAddScanPath, handleRemoveScanPath } = useScanPaths(() => setRefreshKey(p => p + 1));

  // --- Kinetic Tuning States (easter egg - values finalized) ---
  const [motionDecay] = useState(() => parseFloat(localStorage.getItem("motion-decay") || "4.0"));
  const [motionImpulse] = useState(() => parseFloat(localStorage.getItem("motion-impulse") || "1.5"));
  const [motionImpulseInitial] = useState(() => parseFloat(localStorage.getItem("motion-impulse-initial") || "2.5"));
  const [motionSpeedBase] = useState(() => parseFloat(localStorage.getItem("motion-speed-base") || "0.14"));
  const [motionSpeedScale] = useState(() => parseFloat(localStorage.getItem("motion-speed-scale") || "0.23"));
  const [motionScaleFactor] = useState(() => parseFloat(localStorage.getItem("motion-scale-factor") || "0.14"));
  const [motionScaleDeadzone] = useState(() => parseFloat(localStorage.getItem("motion-scale-deadzone") || "1.5"));
  const [motionImpulseMax] = useState(() => parseFloat(localStorage.getItem("motion-impulse-max") || "100.0"));

  const motionDecayRef = useRef(motionDecay);
  const motionImpulseRef = useRef(motionImpulse);
  const motionImpulseInitialRef = useRef(motionImpulseInitial);
  const motionSpeedBaseRef = useRef(motionSpeedBase);
  const motionSpeedScaleRef = useRef(motionSpeedScale);
  const motionScaleFactorRef = useRef(motionScaleFactor);
  const motionScaleDeadzoneRef = useRef(motionScaleDeadzone);
  const motionImpulseMaxRef = useRef(motionImpulseMax);

  const momentumRef = useRef(0);
  const settingsRotationRef = useRef(0);

  const debugLabelRef = useRef<HTMLSpanElement>(null);
  const debugBarRef = useRef<HTMLDivElement>(null);
  const settleTargetRef = useRef<number | null>(null);
  const pendingImpulseRef = useRef(0);

  const ghostRef = useRef<HTMLDivElement>(null);
  const [dragGhostSize, setDragGhostSize] = useState({ w: 0, h: 0 });

  const handleScanComplete = useCallback((timestamp: number) => {
    console.log("[App] MANUAL SCAN COMPLETE. Updating timestamp:", new Date(timestamp).toLocaleTimeString());
    setLastScanTimestamp(timestamp);
    localStorage.setItem("ahk_last_scan_timestamp", timestamp.toString());
  }, []);

  // ─── SIDEBAR NAVIGATION HOTKEYS ──────────────────────────────────
  const TABS = ["hub", "all", "no_tags", ...userTags, "settings"];
  useHotkeys("shift+alt+j", (e) => {
    e.preventDefault();
    const currentIndex = TABS.indexOf(activeTab);
    handleTabClick(TABS[(currentIndex + 1) % TABS.length]);
  }, { enableOnFormTags: true });

  useHotkeys("shift+alt+k", (e) => {
    e.preventDefault();
    const currentIndex = TABS.indexOf(activeTab);
    handleTabClick(TABS[(currentIndex - 1 + TABS.length) % TABS.length]);
  }, { enableOnFormTags: true });

  const handleLoadingChange = useCallback((loading: boolean) => {
    setIsRefreshing(loading);
  }, []);

  const formatLastScan = (ts: number, now: number) => {
    const diff = Math.floor((now - ts) / 1000);
    const agoText = t("sidebar.ago", "ago");
    const justNowText = t("sidebar.just_now", "Just now");

    if (diff < 5) return <span className="font-normal opacity-80 lowercase">{justNowText}</span>;

    let timeText = "";
    if (diff < 3600) {
      const m = Math.floor(diff / 60);
      const s = diff % 60;
      timeText = `${m}m ${s}s`;
    } else if (diff < 172800) {
      timeText = `${Math.floor(diff / 3600)}h`;
    } else {
      timeText = `${Math.floor(diff / 86400)}d`;
    }

    return (
      <>
        <span className="font-bold">{timeText}</span>
        <span className="font-normal opacity-80 lowercase ml-1.5">{agoText}</span>
      </>
    );
  };

  // Drag ghost mouse tracking
  useEffect(() => {
    let animationFrameId: number;
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
  }, []);

  // Global listeners: click-out context menu, devtools shortcut
  useEffect(() => {
    const handleGlobalClick = () => setContextMenu(null);
    const handleGlobalScroll = () => setContextMenu(null);
    const handleGlobalContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      if (!(e as any)._reactProcessed && !e.defaultPrevented) setContextMenu(null);
    };
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "i") {
        const win = getCurrentWebviewWindow();
        if ("openDevtools" in win) (win as any).openDevtools();
        else if ("toggleDevtools" in win) (win as any).toggleDevtools();
      }
    };

    window.addEventListener("click", handleGlobalClick);
    window.addEventListener("scroll", handleGlobalScroll, true);
    window.addEventListener("contextmenu", handleGlobalContextMenu);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("click", handleGlobalClick);
      window.removeEventListener("scroll", handleGlobalScroll, true);
      window.removeEventListener("contextmenu", handleGlobalContextMenu);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Physics loop: settings gear animation
  useEffect(() => {
    let animFrame: number;
    let lastTime = performance.now();
    let lastFPSTime = performance.now();

    const measureFPS = () => {
      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.1);

      if (pendingImpulseRef.current > 0) {
        const injectAmount = Math.min(pendingImpulseRef.current, (pendingImpulseRef.current * 10) * dt);
        momentumRef.current = Math.min(motionImpulseMaxRef.current, momentumRef.current + injectAmount);
        pendingImpulseRef.current -= injectAmount;
      }

      const expLoss = momentumRef.current * (motionDecayRef.current * 0.5) * dt;
      const friction = 0.05 * dt;
      momentumRef.current = Math.max(0, momentumRef.current - expLoss - friction);

      if (debugLabelRef.current) debugLabelRef.current.innerText = momentumRef.current.toFixed(1);
      if (debugBarRef.current) {
        const pct = Math.min(100, (momentumRef.current / motionImpulseMaxRef.current) * 100);
        debugBarRef.current.style.width = `${pct}%`;
      }

      const isVisible = momentumRef.current > 0 || (settleTargetRef.current !== null && Math.abs(settingsRotationRef.current - settleTargetRef.current) > 0.1);
      if (isVisible && debugMomentum <= 0) setDebugMomentum(1);
      else if (!isVisible && debugMomentum > 0) setDebugMomentum(0);

      if (settingsIconRef.current) {
        const energy = momentumRef.current;
        const velocity = energy > 0.001 ? (motionSpeedBaseRef.current + energy * motionSpeedScaleRef.current) : 0;

        if (velocity > 0) {
          settingsRotationRef.current += velocity * 360 * dt;
          const effectiveEnergy = Math.max(0, energy - motionScaleDeadzoneRef.current);
          const scale = 1 + (effectiveEnergy * motionScaleFactorRef.current);
          const brightness = 1 + (energy * 0.05);
          settingsIconRef.current.style.transform = `rotate(${settingsRotationRef.current}deg) scale(${scale})`;
          settingsIconRef.current.style.filter = `brightness(${brightness})`;
        }

        if (energy > 0 && debugMomentum <= 0) setDebugMomentum(1);
        else if (energy <= 0 && debugMomentum > 0) setDebugMomentum(0);
      }

      if (now - lastFPSTime >= 1000) lastFPSTime = now;
      lastTime = now;
      animFrame = requestAnimationFrame(measureFPS);
    };

    animFrame = requestAnimationFrame(measureFPS);
    return () => cancelAnimationFrame(animFrame);
  }, []);

  // Current time ticker (for "last scan" display)
  useEffect(() => {
    const ticker = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(ticker);
  }, []);

  // Refresh icon animation (Web Animations API)
  useEffect(() => {
    const icon = refreshIconRef.current;
    if (!icon) return;

    if (isRefreshing) {
      if (activeAnimRef.current) activeAnimRef.current.cancel();
      activeAnimRef.current = icon.animate(
        [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }],
        { duration: 800, iterations: Infinity, easing: "linear" }
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
          { duration: 800, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)", fill: "forwards" }
        ).onfinish = () => { icon.style.transform = `rotate(${targetDeg % 360}deg)`; };
      }
    }
  }, [isRefreshing]);

  const pendingTagDragRef = useRef<{ tag: string; x: number; y: number } | null>(null);
  const tagDragOffsetYRef = useRef<number>(0);
  const tagDragOffsetXRef = useRef<number>(0);

  const handleTabClick = (tab: string) => {
    setActiveTab(tab);
    localStorage.setItem("ahk_active_tab", tab);

    if (tab === "hub") {
      setViewMode("hub");
      setDisplayMode((localStorage.getItem("ahk_hub_display_mode") as any) || "tiles");
    } else if (tab === "settings") {
      setViewMode("settings");
      const kick = (momentumRef.current + pendingImpulseRef.current) <= 0.05 ? motionImpulseInitialRef.current : motionImpulseRef.current;
      pendingImpulseRef.current += kick;
    } else {
      setViewMode("tree");
      setDisplayMode((localStorage.getItem("ahk_tree_display_mode") as any) || "tree");
    }
  };

  const toggleDisplayMode = (mode: "tree" | "tiles" | "list") => {
    setDisplayMode(mode);
    const key = activeTab === "hub" ? "ahk_hub_display_mode" : "ahk_tree_display_mode";
    localStorage.setItem(key, mode);
  };

  const handleCustomDrop = async (path: string, tag: string) => {
    setDragOverTag(null);
    if (path && tag) {
      try {
        await invoke("add_script_tag", { path, tag: tag === "hub" ? "hub" : tag });
      } catch (err) {
        console.warn("[App] FAIL: Backend refused custom engine update", err);
      }
    }
  };

  const startCustomDrag = useCallback((script: { path: string; filename: string; tags: string[]; x: number; y: number }) => {
    setDraggedScript({ path: script.path, filename: script.filename, tags: script.tags });
    if (ghostRef.current) {
      ghostRef.current.setAttribute("data-dragging", "true");
      ghostRef.current.style.transform = `translate3d(${script.x}px, ${script.y}px, 0) translate(-50%, -50%) scale(1.05)`;
    }
  }, []);

  const handleTagsLoaded = useCallback((tags: string[]) => {
    invoke<string[]>("get_tag_order").then(order => {
      const merged = [...order];
      tags.forEach(t => { if (!merged.includes(t)) merged.push(t); });
      setUserTags(merged.filter(t => tags.includes(t)));
    });
  }, []);

  const handleShowUI = useCallback(async (s: any) => {
    console.log("[frontend] Requesting UI for script:", s.path);
    try {
      const result = await invoke("show_script_ui", { path: s.path });
      console.log("[frontend] show_script_ui result:", result);
    } catch (err) {
      console.error("[frontend] Failed to show UI:", err);
    }
  }, []);

  const handleGlobalMouseUp = useCallback(async () => {
    if (draggedScript) {
      if (dragOverTag === "new-tag") {
        setIsCreatingTagFor(draggedScript);
        setNewTagName("");
      } else if (dragOverTag) {
        await handleCustomDrop(draggedScript.path, dragOverTag);
      }
      if (ghostRef.current) ghostRef.current.setAttribute("data-dragging", "false");
      setDraggedScript(null);
      setDragOverTag(null);
    }

    if (draggedTag) {
      setDraggedTag(null);
      invoke("save_tag_order", { order: userTags });
      if (ghostRef.current) ghostRef.current.setAttribute("data-dragging", "false");
    }

    pendingTagDragRef.current = null;
    setActiveTabPressed(null);
  }, [draggedScript, dragOverTag, draggedTag, userTags]);

  useEffect(() => {
    const handleWindowMouseUp = () => {
      if (draggedScript || draggedTag || pendingTagDragRef.current) handleGlobalMouseUp();
    };
    window.addEventListener("mouseup", handleWindowMouseUp);
    return () => window.removeEventListener("mouseup", handleWindowMouseUp);
  }, [draggedScript, draggedTag, handleGlobalMouseUp]);

  const navItemClass = (tab: string, isTag: boolean = false) => `
    px-6 h-11 rounded-2xl cursor-pointer text-sm font-bold transition-all border-b-2 flex items-center justify-between relative z-50
    will-change-transform select-none long-press-shrink ${activeTabPressed === tab ? "active-left" : ""}
    ${draggedTag === tab
      ? "opacity-0 invisible pointer-events-none"
      : (draggedScript && isTag && draggedScript.tags.includes(tab))
        ? "text-white/10 border-transparent opacity-30 shadow-none blur-[1px]"
        : (draggedScript && isTag)
          ? `text-indigo-400 border-indigo-500/20 tag-pulse-target ${dragOverTag === tab ? "tag-drop-hover" : ""}`
          : activeTab === tab
            ? "text-indigo-400 border-indigo-500 shadow-lg tag-active"
            : draggedScript
              ? "text-white/10 border-transparent opacity-30 shadow-none blur-[1px]"
              : "text-tertiary border-transparent hover:text-secondary tag-hover"}
  `;

  return (
    <div
      className={`flex h-screen w-full transition-colors duration-300 font-inter overflow-hidden ${draggedScript ? "select-none cursor-grabbing drag-active" : ""}`}
      style={{ backgroundColor: "var(--bg-primary)" }}
      onMouseUp={handleGlobalMouseUp}
      onMouseLeave={() => {
        if (draggedScript) {
          if (ghostRef.current) ghostRef.current.setAttribute("data-dragging", "false");
          setDraggedScript(null);
        }
      }}
    >
      {/* Sidebar */}
      <div
        className="w-72 flex flex-col pt-6 pb-2 border-r overflow-y-auto custom-scrollbar transition-colors duration-300 relative z-[100]"
        style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-color)", paddingLeft: "16px", paddingRight: "0" }}
      >
        <div className="flex flex-col space-y-10 flex-1 pr-[6px]">
          {/* Group 1: Hub */}
          <ul className="space-y-1.5">
            {[{ id: "hub", label: t("sidebar.hub", "Hub") }].map((tab) => (
              <li
                key={tab.id}
                onMouseEnter={() => { if (draggedScript && !draggedScript.tags.includes("hub")) setDragOverTag(tab.id); }}
                onMouseLeave={() => { if (draggedScript && dragOverTag === tab.id) setDragOverTag(null); }}
                className={`px-6 h-[62px] rounded-2xl cursor-pointer text-sm font-bold border-b-2 transition-all flex items-center justify-between
                  ${draggedScript
                    ? (draggedScript.tags.includes("hub")
                      ? "opacity-20 blur-[1px] border-transparent"
                      : `text-indigo-400 border-indigo-500/20 tag-pulse-target ${dragOverTag === tab.id ? "tag-drop-hover" : ""}`)
                    : (activeTab === tab.id && viewMode !== "settings"
                      ? "bg-gradient-to-r from-indigo-500 to-purple-500 border-indigo-400 shadow-xl shadow-indigo-900/40 text-white"
                      : "text-tertiary border-transparent hover:text-secondary tag-hover")
                  }`}
                style={{
                  backgroundColor: (activeTab === tab.id && viewMode !== "settings") ? "transparent"
                    : (draggedScript && dragOverTag === tab.id) ? undefined
                    : "var(--bg-tag)",
                }}
                onClick={() => !draggedScript && handleTabClick(tab.id)}
              >
                <div className="flex items-center space-x-4 pointer-events-none">
                  <span className="text-lg tracking-tight">{tab.label}</span>
                </div>
                {activeTab !== "hub" && (
                  <div className={`flex items-center justify-center rounded-full bg-indigo-400 transition-all duration-500 ${runningCount > 0 ? "w-5 h-5 shadow-[0_0_12px_rgba(99,102,241,0.6)]" : "w-2 h-2 animate-pulse shadow-[0_0_8px_rgba(79,70,229,0.5)]"}`}>
                    {runningCount > 0 && <span className="text-[15px] font-bold leading-none mt-[1px]" style={{ color: "var(--bg-secondary)" }}>{runningCount}</span>}
                  </div>
                )}
              </li>
            ))}
          </ul>

          <div className="h-[1px] bg-white/5 mx-2" />

          {/* Group 2: Global Filters */}
          <ul className="space-y-1.5">
            {[
              { id: "all", label: t("sidebar.all", "All") },
              { id: "no_tags", label: t("sidebar.no_tags", "Untagged") },
            ].map((tab) => (
              <li
                key={tab.id}
                className={`px-6 h-11 rounded-2xl cursor-pointer text-sm font-bold transition-all border-b-2 flex items-center justify-between ${draggedScript && tab.id !== dragOverTag ? "opacity-20 blur-[1px]" : ""
                  } ${activeTab === tab.id && viewMode !== "settings"
                    ? "text-indigo-400 border-indigo-500 shadow-lg tag-active"
                    : "text-tertiary border-transparent hover:text-secondary tag-hover"
                  }`}
                style={{ backgroundColor: activeTab === tab.id && viewMode !== "settings" ? "var(--bg-tag-active)" : "var(--bg-tag)" }}
                onClick={() => !draggedScript && handleTabClick(tab.id)}
              >
                <div className="flex items-center space-x-4 pointer-events-none">
                  <span>{tab.label}</span>
                </div>
              </li>
            ))}
          </ul>

          <div className="h-[1px] bg-white/5 mx-2" />

          {/* Group 3: Tags */}
          <div className="flex flex-col space-y-4">
            <div
              className={`px-6 flex items-center justify-between group cursor-pointer ${activeTab === "tags" ? "text-indigo-400" : "text-tertiary"}`}
              onClick={() => handleTabClick("tags")}
            >
              <span className={`text-[14px] font-bold uppercase tracking-[0.1em] group-hover:opacity-100 ${activeTab === "tags" ? "opacity-80" : "opacity-50"} transition-opacity`}>{t("sidebar.tags", "TAGS")}</span>
            </div>

            <ul className="flex flex-col space-y-1.5 px-0 w-full">
              {userTags.map((tag) => (
                <li
                  key={tag}
                  onMouseDown={(e) => {
                    if (e.button === 2) {
                      e.preventDefault();
                      if (!draggedScript) setContextMenu({ x: e.clientX, y: e.clientY, type: "tag", data: tag });
                      return;
                    }
                    if (e.button !== 0) { e.preventDefault(); return; }
                    setActiveTabPressed(tag);
                    if (!isRenamingTag) {
                      const tagToDrag = tag;
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setDragGhostSize({ w: rect.width, h: rect.height });
                      const startX = e.clientX;
                      const startY = e.clientY;
                      tagDragOffsetYRef.current = startY - rect.top;
                      tagDragOffsetXRef.current = rect.left + rect.width / 2;
                      pendingTagDragRef.current = { tag: tagToDrag, x: startX, y: startY };

                      const dragTimer = setTimeout(() => {
                        if (pendingTagDragRef.current && pendingTagDragRef.current.tag === tagToDrag) {
                          setDraggedTag(tagToDrag);
                          if (ghostRef.current) {
                            ghostRef.current.setAttribute("data-dragging", "true");
                            ghostRef.current.style.transform = `translate3d(${tagDragOffsetXRef.current}px, ${startY - tagDragOffsetYRef.current - 1}px, 0) translate(-50%, 0) scale(1)`;
                          }
                        }
                      }, 300);

                      const handleInitialMouseMove = (moveEv: MouseEvent) => {
                        if (!pendingTagDragRef.current) return;
                        const dx = moveEv.clientX - pendingTagDragRef.current.x;
                        const dy = moveEv.clientY - pendingTagDragRef.current.y;
                        if (Math.sqrt(dx * dx + dy * dy) > 5) {
                          clearTimeout(dragTimer);
                          setDraggedTag(pendingTagDragRef.current.tag);
                          if (ghostRef.current) {
                            ghostRef.current.setAttribute("data-dragging", "true");
                            ghostRef.current.style.transform = `translate3d(${tagDragOffsetXRef.current}px, ${moveEv.clientY - tagDragOffsetYRef.current - 1}px, 0) translate(-50%, 0) scale(1)`;
                          }
                          cleanup();
                        }
                      };
                      const handleInitialMouseUp = () => cleanup();
                      const cleanup = () => {
                        clearTimeout(dragTimer);
                        pendingTagDragRef.current = null;
                        window.removeEventListener("mousemove", handleInitialMouseMove);
                        window.removeEventListener("mouseup", handleInitialMouseUp);
                      };
                      window.addEventListener("mousemove", handleInitialMouseMove);
                      window.addEventListener("mouseup", handleInitialMouseUp);
                    }
                  }}
                  onMouseEnter={() => {
                    if (draggedTag && draggedTag !== tag) {
                      const newOrder = [...userTags];
                      const dragIdx = newOrder.indexOf(draggedTag);
                      const hoverIdx = newOrder.indexOf(tag);
                      if (dragIdx !== -1 && hoverIdx !== -1) {
                        newOrder.splice(dragIdx, 1);
                        newOrder.splice(hoverIdx, 0, draggedTag);
                        // @ts-ignore
                        if (document.startViewTransition) {
                          // @ts-ignore
                          document.startViewTransition(() => setUserTags(newOrder));
                        } else {
                          setUserTags(newOrder);
                        }
                      }
                    } else if (draggedScript) {
                      setDragOverTag(tag);
                    }
                  }}
                  onMouseLeave={() => {
                    setActiveTabPressed(null);
                    draggedScript && dragOverTag === tag && setDragOverTag(null);
                  }}
                  className={navItemClass(tag, true)}
                  style={{
                    backgroundColor: (dragOverTag === tag || (draggedScript && !draggedScript.tags.includes(tag)))
                      ? undefined
                      : (activeTab === tag ? "var(--bg-tag-active)" : "var(--bg-tag)"),
                    // @ts-ignore
                    viewTransitionName: `tag-${tag.replace(/\s+/g, "-")}`,
                  }}
                  onClick={() => { if (!draggedScript) handleTabClick(tag); }}
                >
                  {isRenamingTag === tag ? (
                    <input
                      autoFocus
                      className="bg-transparent border-none outline-none text-sm font-bold w-full text-white"
                      value={editTagName}
                      onChange={(e) => setEditTagName(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={() => setIsRenamingTag(null)}
                      onKeyDown={async (e) => {
                        if (e.key === "Enter" && editTagName.trim() && editTagName !== tag) {
                          const newName = editTagName.trim();
                          await invoke("rename_tag", { oldTag: tag, newTag: newName });
                          const newOrder = userTags.map(t => t === tag ? newName : t);
                          setUserTags(newOrder);
                          await invoke("save_tag_order", { order: newOrder });
                          if (activeTab === tag) setActiveTab(newName);
                          setIsRenamingTag(null);
                          setRefreshKey(prev => prev + 1);
                        } else if (e.key === "Escape") {
                          setIsRenamingTag(null);
                        }
                      }}
                    />
                  ) : (
                    <span className="relative z-50 pointer-events-none truncate flex-1 font-bold">{tag}</span>
                  )}
                </li>
              ))}
              {draggedScript && (
                <li
                  className={navItemClass("new-tag", true)}
                  onMouseEnter={() => setDragOverTag("new-tag")}
                  onMouseLeave={() => dragOverTag === "new-tag" && setDragOverTag(null)}
                >
                  <span className="flex items-center justify-center w-full pointer-events-none">
                    <span className="text-xl font-light">+</span>
                  </span>
                </li>
              )}
              {isCreatingTagFor && (
                <li className={navItemClass("", true)}>
                  <input
                    autoFocus
                    type="text"
                    className="w-full bg-transparent border-none outline-none text-sm font-bold text-white placeholder:text-white/20"
                    placeholder={t("search.tag_name")}
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    onBlur={() => setIsCreatingTagFor(null)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newTagName.trim()) {
                        handleCustomDrop(isCreatingTagFor.path, newTagName.trim());
                        setIsCreatingTagFor(null);
                      } else if (e.key === "Escape") {
                        setIsCreatingTagFor(null);
                      }
                    }}
                  />
                </li>
              )}
            </ul>
          </div>
        </div>

        <div className="flex items-center space-x-3 w-full pr-[10px] mt-10">
          <button
            onClick={() => handleTabClick("settings")}
            className={`flex-1 h-12 rounded-xl flex items-center justify-center transition-all border-b-2 group cursor-pointer ${draggedScript ? "opacity-20 blur-[1px]" : ""
              } ${viewMode === "settings"
                ? "text-indigo-400 border-indigo-500 shadow-lg tag-active bg-white/5"
                : "text-tertiary border-transparent hover:text-secondary tag-hover"
              }`}
            title={t("sidebar.settings", "Settings")}
            style={viewMode === "settings" ? { backgroundColor: "var(--bg-tag-active)" } : {}}
          >
            <div ref={settingsIconRef} className="flex items-center justify-center will-change-transform">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                className={viewMode === "settings" ? "stroke-white" : "stroke-current"}
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
              </svg>
            </div>
          </button>

          <button
            onClick={() => { setRefreshKey(p => p + 1); setIsRefreshing(true); }}
            onMouseEnter={() => setIsHoveringRefresh(true)}
            onMouseLeave={() => setIsHoveringRefresh(false)}
            className={`flex-1 h-12 rounded-xl flex items-center justify-center transition-all border group cursor-pointer ${draggedScript ? "opacity-20 blur-[1px]" : ""
              } text-tertiary border-transparent hover:text-secondary tag-hover active:scale-95`}
            title={t("sidebar.refresh", "Refresh List")}
          >
            <div className="transition-transform duration-500 group-hover:-rotate-45">
              <div ref={refreshIconRef} className="flex items-center justify-center will-change-transform">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                </svg>
              </div>
            </div>
          </button>
        </div>
        <div className={`pr-[14px] flex justify-end h-4 transition-all duration-300 ${isHoveringRefresh ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"}`}>
          <span className="text-[12px] uppercase tracking-[0.1em] text-quaternary select-none flex items-center whitespace-nowrap">
            {isRefreshing ? (
              <span className="font-bold">{t("sidebar.scanning", "Scanning...")}</span>
            ) : (
              <>
                <span className="font-normal opacity-80 lowercase mr-1.5">{t("sidebar.last_scan", "Last Scan")}:</span>
                {formatLastScan(lastScanTimestamp, currentTime)}
              </>
            )}
          </span>
        </div>
      </div>

      {/* Main Content */}
      <div
        className="flex-1 px-8 flex flex-col overflow-hidden transition-all duration-300 relative z-10"
        style={{ background: viewMode === "settings" ? "var(--bg-primary)" : "linear-gradient(to bottom right, var(--bg-primary), var(--bg-secondary))" }}
      >
        <div className={`flex-1 flex flex-col min-h-0 ${viewMode === "settings" ? "overflow-y-auto custom-scrollbar" : ""}`}>
          <div className={viewMode === "settings" ? "block" : "hidden"}>
            <SettingsPanel
              brightness={brightness}
              setBrightness={setBrightness}
              textContrast={textContrast}
              setTextContrast={setTextContrast}
              fontScale={fontScale}
              setFontScale={setFontScale}
              animationsEnabled={animationsEnabled}
              toggleAnimations={toggleAnimations}
              vimModeNav={vimModeNav}
              setVimModeNav={setVimModeNav}
              scanPaths={scanPaths}
              onAddPath={handleAddScanPath}
              onRemovePath={handleRemoveScanPath}
            />
          </div>

          <div className={viewMode !== "settings" ? "flex-1 flex flex-col min-h-0" : "hidden"}>
            <MemoizedScriptTree
              key={`script-tree-${refreshKey}`}
              filterTag={activeTab}
              onTagsLoaded={handleTagsLoaded}
              onLoadingChange={handleLoadingChange}
              onRunningCountChange={setRunningCount}
              viewMode={displayMode}
              onViewModeChange={toggleDisplayMode}
              onCustomDragStart={startCustomDrag}
              isDragging={draggedScript !== null}
              draggedScriptPath={draggedScript?.path || null}
              animationsEnabled={animationsEnabled}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              contextMenu={contextMenu}
              onScriptContextMenu={(e, s) => {
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY, type: "script", data: s });
              }}
              onFolderContextMenu={(e, folderData) => {
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY, type: "folder", data: folderData });
              }}
              onShowUI={handleShowUI}
              manualRefresh={refreshKey > 0}
              onScanComplete={handleScanComplete}
              isPathsEmpty={scanPaths.length === 0}
              onAddPath={handleAddScanPath}
              onRefresh={() => setRefreshKey(p => p + 1)}
            />
          </div>
        </div>
      </div>

      <DragGhost
        ghostRef={ghostRef}
        draggedScript={draggedScript}
        draggedTag={draggedTag}
        activeTab={activeTab}
        dragGhostSize={dragGhostSize}
      />

      <ContextMenu
        contextMenu={contextMenu}
        onClose={() => setContextMenu(null)}
        onStartRenameTag={(tag) => { setIsRenamingTag(tag); setEditTagName(tag); }}
        onRefresh={() => setRefreshKey(p => p + 1)}
      />
    </div>
  );
}

export default App;
