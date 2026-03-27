import React, { useState, useEffect, useRef, useCallback } from "react";
import ScriptTree from "./components/ScriptTree";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import "./App.css";

const MemoizedScriptTree = React.memo(ScriptTree);

function App() {
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem("ahk_active_tab") || "Хаб");
  const [userTags, setUserTags] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<"tree" | "hub" | "settings">(() => {
    const tab = localStorage.getItem("ahk_active_tab") || "Хаб";
    if (tab === "Настройки") return "settings";
    if (tab === "Хаб") return "hub";
    return "tree";
  });

  const [draggedScript, setDraggedScript] = useState<{ path: string, filename: string, tags: string[] } | null>(null);
  const [dragOverTag, setDragOverTag] = useState<string | null>(null);
  const [isCreatingTagFor, setIsCreatingTagFor] = useState<{ path: string, filename: string, tags: string[] } | null>(null);
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
    // Determine which mode to load based on where we are starting
    const isHub = (localStorage.getItem("ahk_active_tab") || "Хаб") === "Хаб";
    const key = isHub ? "ahk_hub_display_mode" : "ahk_tree_display_mode";
    return (localStorage.getItem(key) as "tree" | "tiles" | "list") || (isHub ? "tiles" : "tree");
  });
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, type: 'script' | 'tag' | 'folder' | 'general', data: any } | null>(null);
  const [activeTabPressed, setActiveTabPressed] = useState<string | null>(null);

  const ghostRef = useRef<HTMLDivElement>(null);

  const [dragGhostSize, setDragGhostSize] = useState({ w: 0, h: 0 });

  const [brightness, setBrightness] = useState(() => {
    return parseInt(localStorage.getItem("app-brightness") || "20");
  });

  // --- Kinetic Tuning States (easter egg - values finalized) ---
  const [motionDecay, setMotionDecay] = useState(() => parseFloat(localStorage.getItem("motion-decay") || "4.0"));
  const [motionImpulse, setMotionImpulse] = useState(() => parseFloat(localStorage.getItem("motion-impulse") || "1.5"));
  const [motionImpulseInitial, setMotionImpulseInitial] = useState(() => parseFloat(localStorage.getItem("motion-impulse-initial") || "2.5"));
  const [motionSpeedBase, setMotionSpeedBase] = useState(() => parseFloat(localStorage.getItem("motion-speed-base") || "0.14"));
  const [motionSpeedScale, setMotionSpeedScale] = useState(() => parseFloat(localStorage.getItem("motion-speed-scale") || "0.23"));
  const [motionScaleFactor, setMotionScaleFactor] = useState(() => parseFloat(localStorage.getItem("motion-scale-factor") || "0.14"));
  const [motionScaleDeadzone, setMotionScaleDeadzone] = useState(() => parseFloat(localStorage.getItem("motion-scale-deadzone") || "1.5"));
  const [motionImpulseMax, setMotionImpulseMax] = useState(() => parseFloat(localStorage.getItem("motion-impulse-max") || "100.0"));

  // Refs for high-speed access in requestAnimationFrame (no stale closures)
  const motionDecayRef = useRef(motionDecay);
  const motionImpulseRef = useRef(motionImpulse);
  const motionImpulseInitialRef = useRef(motionImpulseInitial);
  const motionSpeedBaseRef = useRef(motionSpeedBase);
  const motionSpeedScaleRef = useRef(motionSpeedScale);
  const motionScaleFactorRef = useRef(motionScaleFactor);
  const motionScaleDeadzoneRef = useRef(motionScaleDeadzone);
  const motionImpulseMaxRef = useRef(motionImpulseMax);

  const momentumRef = useRef(0);
  const lastMomentumUpdateRef = useRef(performance.now());
  const settingsRotationRef = useRef(0);

  // Refs for Direct DOM updates (Performance)
  const debugLabelRef = useRef<HTMLSpanElement>(null);
  const debugBarRef = useRef<HTMLDivElement>(null);
  const settleTargetRef = useRef<number | null>(null);
  const pendingImpulseRef = useRef(0);

  const [animationsEnabled, setAnimationsEnabled] = useState(() => {
    return localStorage.getItem("animations-enabled") !== "false";
  });

  const [textContrast, setTextContrast] = useState(() => {
    return parseFloat(localStorage.getItem("text-contrast") || "1.0");
  });

  const [fontScale, setFontScale] = useState(() => {
    return parseFloat(localStorage.getItem("font-scale") || "1.0");
  });

  const toggleAnimations = () => {
    setAnimationsEnabled(prev => {
      const next = !prev;
      localStorage.setItem("animations-enabled", String(next));
      return next;
    });
  };


  const [rootPath] = useState(() => {
    return localStorage.getItem("root-path") || "Desktop / Parent folder";
  });

  const updatePalette = (val: number) => {
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
    document.documentElement.style.setProperty("--bg-tertiary", val < 10 ? "rgba(255, 255, 255, 0.05)" : "rgba(255, 255, 255, 0.03)");
    document.documentElement.style.setProperty("--border-color", val < 10 ? "rgba(255, 255, 255, 0.1)" : "rgba(255, 255, 255, 0.05)");
    document.documentElement.style.setProperty("--accent-indigo", "#6366f1");
  };

  useEffect(() => {
    updatePalette(brightness);
    localStorage.setItem("app-brightness", brightness.toString());
  }, [brightness]);

  useEffect(() => {
    document.documentElement.style.setProperty("--contrast-factor", textContrast.toFixed(2));
    localStorage.setItem("text-contrast", textContrast.toString());
  }, [textContrast]);

  useEffect(() => {
    document.documentElement.style.setProperty("--font-scale", fontScale.toFixed(2));
    localStorage.setItem("font-scale", fontScale.toString());
  }, [fontScale]);

  useEffect(() => {
    let animationFrameId: number;
    let latestX = 0;
    let latestY = 0;
    let isDragging = false;

    const updatePosition = () => {
      if (ghostRef.current && isDragging) {
        const type = ghostRef.current.getAttribute("data-drag-type");
        if (type === "tag") {
          ghostRef.current.style.transform = `translate3d(144px, ${latestY - tagDragOffsetYRef.current}px, 0) translate(-50%, 0) scale(1.05)`;
        } else {
          ghostRef.current.style.transform = `translate3d(${latestX}px, ${latestY}px, 0) translate(-50%, -50%) scale(1.05)`;
        }
      }
      animationFrameId = 0;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!ghostRef.current) return;
      if (ghostRef.current.getAttribute("data-dragging") !== "true") {
        isDragging = false;
        return;
      }

      isDragging = true;
      latestX = e.clientX;
      latestY = e.clientY;

      if (!animationFrameId) {
        animationFrameId = requestAnimationFrame(updatePosition);
      }
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, []);

  useEffect(() => {
    const handleGlobalClick = () => setContextMenu(null);
    const handleGlobalScroll = () => setContextMenu(null);
    const handleGlobalContextMenu = (e: MouseEvent) => {
      // Always prevent default to hide browser menu
      e.preventDefault();
      // (React's synthetic event will call preventDefault on our custom items)
      if (!(e as any)._reactProcessed && !e.defaultPrevented) {
        setContextMenu(null);
      }
    };

    window.addEventListener('click', handleGlobalClick);
    window.addEventListener('scroll', handleGlobalScroll, true);
    window.addEventListener('contextmenu', handleGlobalContextMenu);

    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'i') {
        const win = getCurrentWebviewWindow();
        // Fallback for different tauri v2 API versions if openDevtools doesn't exist
        if ('openDevtools' in win) {
          (win as any).openDevtools();
        } else if ('toggleDevtools' in win) {
          (win as any).toggleDevtools();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('scroll', handleGlobalScroll, true);
      window.removeEventListener('contextmenu', handleGlobalContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // FPS Counter & Momentum Debug Effect
  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    let animFrame: number;

    const measureFPS = () => {
      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.1); // Cap dt to avoid teleporting
      frameCount++;

      // Physics Loop: Gradual Impulse Injection (Smoothing)
      if (pendingImpulseRef.current > 0) {
        // Inject energy over ~100ms (rate = 1/0.1 = 10x per second)
        const injectAmount = Math.min(pendingImpulseRef.current, (pendingImpulseRef.current * 10) * dt);
        momentumRef.current = Math.min(motionImpulseMaxRef.current, momentumRef.current + injectAmount);
        pendingImpulseRef.current -= injectAmount;
      }

      // Physics Loop: Non-Linear Hybrid Decay (Exponential + Static Friction)
      const expLoss = momentumRef.current * (motionDecayRef.current * 0.5) * dt;
      const friction = 0.05 * dt;
      momentumRef.current = Math.max(0, momentumRef.current - expLoss - friction);

      // HIGH PERFORMANCE: Direct DOM updates instead of React state
      if (debugLabelRef.current) {
        debugLabelRef.current.innerText = momentumRef.current.toFixed(1);
      }
      if (debugBarRef.current) {
        const pct = Math.min(100, (momentumRef.current / motionImpulseMaxRef.current) * 100);
        debugBarRef.current.style.width = `${pct}%`;
      }

      // We update debugMomentum state for visibility
      // Stay visible if energy > 0 OR if we are still settling to a target
      const isVisible = momentumRef.current > 0 || (settleTargetRef.current !== null && Math.abs(settingsRotationRef.current - settleTargetRef.current) > 0.1);
      if (isVisible && debugMomentum <= 0) setDebugMomentum(1);
      else if (!isVisible && debugMomentum > 0) setDebugMomentum(0);

      // --- Gear Animation Physics (Pure Physics) ---
      if (settingsIconRef.current) {
        const energy = momentumRef.current;
        // 1. Calculate Velocity (Restored Base Speed influence)
        // If energy > 0, we use BaseSpeed + Energy-Scaled speed
        const velocity = energy > 0.001 ? (motionSpeedBaseRef.current + energy * motionSpeedScaleRef.current) : 0;

        if (velocity > 0) {
          settingsRotationRef.current += velocity * 360 * dt;

          // Scale based on energy with DEADZONE
          const effectiveEnergy = Math.max(0, energy - motionScaleDeadzoneRef.current);
          const scale = 1 + (effectiveEnergy * motionScaleFactorRef.current);
          const brightness = 1 + (energy * 0.05);
          settingsIconRef.current.style.transform = `rotate(${settingsRotationRef.current}deg) scale(${scale})`;
          settingsIconRef.current.style.filter = `brightness(${brightness})`;
        }

        // Update debug visibility
        if (energy > 0 && debugMomentum <= 0) setDebugMomentum(1);
        else if (energy <= 0 && debugMomentum > 0) setDebugMomentum(0);
      }

      // Update actual FPS every 1000ms
      if (now - lastFPSTime >= 1000) {
        frameCount = 0;
        lastFPSTime = now;
      }

      // CRITICAL: Update lastTime EVERY FRAME for accurate dt
      lastTime = now;
      animFrame = requestAnimationFrame(measureFPS);
    };

    let lastFPSTime = performance.now();

    animFrame = requestAnimationFrame(measureFPS);
    return () => cancelAnimationFrame(animFrame);
  }, []);

  const handleTabClick = (tab: string) => {
    setActiveTab(tab);
    localStorage.setItem("ahk_active_tab", tab);

    if (tab === "Хаб") {
      setViewMode("hub");
      const savedMode = (localStorage.getItem("ahk_hub_display_mode") as any) || "tiles";
      setDisplayMode(savedMode);
    } else if (tab === "Все" || tab === "ТЕГИ" || tab === "Без тегов") {
      setViewMode("tree");
      const savedMode = (localStorage.getItem("ahk_tree_display_mode") as any) || "tree";
      setDisplayMode(savedMode);
    }
    else if (tab === "Настройки") {
      setViewMode("settings");
      // Use initial impulse if we are currently stopped
      const kick = (momentumRef.current + pendingImpulseRef.current) <= 0.05 ? motionImpulseInitialRef.current : motionImpulseRef.current;

      // Add to pending buffer instead of instant jump
      pendingImpulseRef.current += kick;
    }

    else {
      setViewMode("tree");
      const savedMode = (localStorage.getItem("ahk_tree_display_mode") as any) || "tree";
      setDisplayMode(savedMode);
    }
  };

  const toggleDisplayMode = (mode: "tree" | "tiles" | "list") => {
    setDisplayMode(mode);
    const key = activeTab === "Хаб" ? "ahk_hub_display_mode" : "ahk_tree_display_mode";
    localStorage.setItem(key, mode);
  };

  useEffect(() => {
    const loadTags = async () => {
      setIsRefreshing(true);
      try {
        const tags = await invoke<string[]>("get_all_tags");
        setUserTags(tags);
      } catch (err) {
        console.error("Failed to load tags:", err);
      } finally {
        // We'll let ScriptTree handle the final isRefreshing = false if it's also loading
      }
    };
    loadTags();
  }, [refreshKey]);

  const handleCustomDrop = async (path: string, tag: string) => {
    setDragOverTag(null);
    if (path && tag) {
      try {
        await invoke("add_script_tag", { path, tag });
      } catch (err) {
        console.warn("[App] FAIL: Backend refused custom engine update", err);
      }
    }
  };

  const startCustomDrag = useCallback((script: { path: string, filename: string, tags: string[], x: number, y: number }) => {
    setDraggedScript({ path: script.path, filename: script.filename, tags: script.tags });
    if (ghostRef.current) {
      ghostRef.current.setAttribute("data-dragging", "true");
      ghostRef.current.style.transform = `translate3d(${script.x}px, ${script.y}px, 0) translate(-50%, -50%) scale(1.05)`;
    }
  }, []);

  const handleTagsLoaded = useCallback((tags: string[]) => {
    // If we have a stored order, prioritize it
    invoke<string[]>("get_tag_order").then(order => {
      const merged = [...order];
      tags.forEach(t => {
        if (!merged.includes(t)) merged.push(t);
      });
      // Filter out tags that no longer exist
      const existing = merged.filter(t => tags.includes(t));
      setUserTags(existing);
    });
  }, []);

  // Web Animations API for the refresh icon (Hardware Accelerated & Smooth Finish)
  useEffect(() => {
    const icon = refreshIconRef.current;
    if (!icon) return;

    if (isRefreshing) {
      if (activeAnimRef.current) activeAnimRef.current.cancel();

      activeAnimRef.current = icon.animate(
        [
          { transform: 'rotate(0deg)' },
          { transform: 'rotate(360deg)' }
        ],
        {
          duration: 800,
          iterations: Infinity,
          easing: 'linear'
        }
      );
    } else {
      // Logic for smooth finish (V5 variant approved by user)
      if (activeAnimRef.current && activeAnimRef.current.playState !== 'idle') {
        const style = window.getComputedStyle(icon);
        const matrix = new DOMMatrix(style.transform);
        const currentAngle = Math.round(Math.atan2(matrix.b, matrix.a) * (180 / Math.PI));

        activeAnimRef.current.cancel();
        activeAnimRef.current = null;

        const startDeg = currentAngle < 0 ? currentAngle + 360 : currentAngle;

        // Target: Current + 360 deg (at least one full circle) 
        // AND aligned to the nearest 180deg (symmetric home position)
        let targetDeg = startDeg + 360;
        targetDeg = Math.ceil(targetDeg / 180) * 180;

        icon.animate(
          [
            { transform: `rotate(${startDeg}deg)` },
            { transform: `rotate(${targetDeg}deg)` }
          ],
          {
            duration: 800,
            easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)', // V5: Back-out / Overshoot
            fill: 'forwards'
          }
        ).onfinish = () => {
          // Reset to normalized angle to prevent accumulation issues
          icon.style.transform = `rotate(${targetDeg % 360}deg)`;
        };
      }
    }
  }, [isRefreshing]);


  const pendingTagDragRef = useRef<{ tag: string, x: number, y: number } | null>(null);
  const tagDragOffsetYRef = useRef<number>(0);

  const handleGlobalMouseUp = useCallback(async () => {
    if (draggedScript) {
      if (dragOverTag === "new-tag") {
        setIsCreatingTagFor(draggedScript);
        setNewTagName("");
      } else if (dragOverTag) {
        await handleCustomDrop(draggedScript.path, dragOverTag);
      }
      if (ghostRef.current) {
        ghostRef.current.setAttribute("data-dragging", "false");
      }
      setDraggedScript(null);
      setDragOverTag(null);
    }

    if (draggedTag) {
      setDraggedTag(null);
      invoke("save_tag_order", { order: userTags });
      if (ghostRef.current) {
        ghostRef.current.setAttribute("data-dragging", "false");
      }
    }

    // Always clear pending too
    pendingTagDragRef.current = null;
    setActiveTabPressed(null); // Clear pressed state on global mouse up
  }, [draggedScript, dragOverTag, draggedTag, userTags]);

  useEffect(() => {
    const handleWindowMouseUp = () => {
      if (draggedScript || draggedTag || pendingTagDragRef.current) {
        handleGlobalMouseUp();
      }
    };
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => window.removeEventListener('mouseup', handleWindowMouseUp);
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
      className={`flex h-screen w-full transition-colors duration-300 font-inter overflow-hidden ${draggedScript ? 'select-none cursor-grabbing drag-active' : ''}`}
      style={{ backgroundColor: 'var(--bg-primary)' }}
      onMouseUp={handleGlobalMouseUp}
      onMouseLeave={() => {
        if (draggedScript) {
          if (ghostRef.current) ghostRef.current.setAttribute("data-dragging", "false");
          setDraggedScript(null);
        }
      }}
    >
      {/* Sidebar - Balanced padding for Symmetric Gutter */}
      <div
        className="w-72 flex flex-col px-4 py-6 space-y-10 border-r overflow-y-auto custom-scrollbar transition-colors duration-300 relative z-[100]"
        style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
      >
        <div className="flex flex-col space-y-5 flex-1">
          {/* Group 1: Hub */}
          <ul className="space-y-1.5">
            {[
              { id: "Хаб", label: "Хаб", icon: "" }
            ].map((tab) => (
              <li
                key={tab.id}
                className={`px-6 h-[62px] rounded-2xl cursor-pointer text-sm font-bold border-b-2 flex items-center justify-between ${draggedScript && tab.id !== dragOverTag ? 'opacity-20 blur-[1px]' : ''
                  } ${activeTab === tab.id && viewMode !== "settings"
                    ? "bg-gradient-to-r from-indigo-500 to-purple-500 border-indigo-400 shadow-xl shadow-indigo-900/40 text-white"
                    : "text-tertiary border-transparent hover:text-secondary tag-hover"
                  }`}
                style={{
                  backgroundColor: (activeTab === tab.id && viewMode !== "settings")
                    ? 'transparent'
                    : 'var(--bg-tag)'
                }}
                onClick={() => !draggedScript && handleTabClick(tab.id)}
              >
                <div className="flex items-center space-x-4 pointer-events-none">
                  <span className="text-lg tracking-tight">{tab.label}</span>
                </div>
                {activeTab !== "Хаб" && <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(79,70,229,0.5)]"></div>}
              </li>
            ))}
          </ul>

          <div className="h-[1px] bg-white/5 mx-2" />

          {/* Group 2: Global Filters */}
          <ul className="space-y-1.5">
            {[
              { id: "Все", label: "Все", icon: "" },
              { id: "Без тегов", label: "Без тегов", icon: "" }
            ].map((tab) => (
              <li
                key={tab.id}
                className={`px-6 h-11 rounded-2xl cursor-pointer text-sm font-bold transition-all border-b-2 flex items-center justify-between ${draggedScript && tab.id !== dragOverTag ? 'opacity-20 blur-[1px]' : ''
                  } ${activeTab === tab.id && viewMode !== "settings"
                    ? "text-indigo-400 border-indigo-500 shadow-lg tag-active"
                    : "text-tertiary border-transparent hover:text-secondary tag-hover"
                  }`}
                style={{
                  backgroundColor: (activeTab === tab.id && viewMode !== "settings" ? 'var(--bg-tag-active)' : 'var(--bg-tag)')
                }}
                onClick={() => !draggedScript && handleTabClick(tab.id)}
              >
                <div className="flex items-center space-x-4 pointer-events-none">
                  <span>{tab.label}</span>
                </div>
              </li>
            ))}
          </ul>

          <div className="h-[1px] bg-white/5 mx-2" />

          {/* Group 3: Tags Header */}
          <div className="flex flex-col space-y-4">
            <div
              className={`px-6 flex items-center justify-between group cursor-pointer ${activeTab === "ТЕГИ" ? "text-indigo-400" : "text-tertiary"}`}
              onClick={() => handleTabClick("ТЕГИ")}
            >
              <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50 group-hover:opacity-100 transition-opacity">ТЕГИ</span>
            </div>

            <ul className="flex flex-col space-y-1.5 px-0 w-full">
              {userTags.map((tag) => (
                <li
                  key={tag}
                  onMouseDown={(e) => {
                    if (e.button === 2) {
                      e.preventDefault();
                      if (!draggedScript) {
                        setContextMenu({ x: e.clientX, y: e.clientY, type: 'tag', data: tag });
                      }
                      return;
                    }
                    if (e.button !== 0) {
                      e.preventDefault();
                      return;
                    }
                    setActiveTabPressed(tag);
                    if (!isRenamingTag) {
                      const tagToDrag = tag;
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setDragGhostSize({ w: rect.width, h: rect.height });

                      const startX = e.clientX;
                      const startY = e.clientY;
                      tagDragOffsetYRef.current = startY - rect.top;
                      pendingTagDragRef.current = { tag: tagToDrag, x: startX, y: startY };

                      const dragTimer = setTimeout(() => {
                        if (pendingTagDragRef.current && pendingTagDragRef.current.tag === tagToDrag) {
                          setDraggedTag(tagToDrag);
                          if (ghostRef.current) {
                            ghostRef.current.setAttribute("data-dragging", "true");
                            ghostRef.current.style.transform = `translate3d(144px, ${startY - tagDragOffsetYRef.current}px, 0) translate(-50%, 0) scale(1.05)`;
                          }
                        }
                      }, 300);

                      const handleInitialMouseMove = (moveEv: MouseEvent) => {
                        if (!pendingTagDragRef.current) return;
                        const dx = moveEv.clientX - pendingTagDragRef.current.x;
                        const dy = moveEv.clientY - pendingTagDragRef.current.y;
                        const distance = Math.sqrt(dx * dx + dy * dy);

                        if (distance > 5) {
                          clearTimeout(dragTimer);
                          setDraggedTag(pendingTagDragRef.current.tag);
                          if (ghostRef.current) {
                            ghostRef.current.setAttribute("data-dragging", "true");
                            ghostRef.current.style.transform = `translate3d(144px, ${moveEv.clientY - tagDragOffsetYRef.current}px, 0) translate(-50%, 0) scale(1.05)`;
                          }
                          cleanup();
                        }
                      };

                      const handleInitialMouseUp = () => cleanup();

                      const cleanup = () => {
                        clearTimeout(dragTimer);
                        pendingTagDragRef.current = null;
                        window.removeEventListener('mousemove', handleInitialMouseMove);
                        window.removeEventListener('mouseup', handleInitialMouseUp);
                      };

                      window.addEventListener('mousemove', handleInitialMouseMove);
                      window.addEventListener('mouseup', handleInitialMouseUp);
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
                          document.startViewTransition(() => {
                            setUserTags(newOrder);
                          });
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
                    draggedScript && dragOverTag === tag && setDragOverTag(null)
                  }}
                  className={navItemClass(tag, true)}
                  style={{
                    backgroundColor: (dragOverTag === tag || (draggedScript && !draggedScript.tags.includes(tag)))
                      ? undefined
                      : (activeTab === tag ? 'var(--bg-tag-active)' : 'var(--bg-tag)'),
                    // @ts-ignore
                    viewTransitionName: `tag-${tag.replace(/\s+/g, '-')}`,
                  }}
                  onClick={() => {
                    if (!draggedScript) {
                      handleTabClick(tag);
                    }
                  }}
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

                          if (activeTab === tag) {
                            setActiveTab(newName);
                          }

                          setIsRenamingTag(null);
                          setRefreshKey(prev => prev + 1);
                        } else if (e.key === "Escape") {
                          setIsRenamingTag(null);
                        }
                      }}
                    />
                  ) : (
                    <>
                      <span className="relative z-50 pointer-events-none truncate flex-1 font-bold">{tag}</span>
                    </>
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
                    placeholder="Имя тега..."
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


        <div className="flex items-center space-x-3 w-full">
          <button
            onClick={() => handleTabClick("Настройки")}
            className={`flex-1 h-12 rounded-xl flex items-center justify-center transition-all border-b-2 group cursor-pointer ${draggedScript ? 'opacity-20 blur-[1px]' : ''
              } ${viewMode === "settings"
                ? "text-indigo-400 border-indigo-500 shadow-lg tag-active bg-white/5"
                : "text-tertiary border-transparent hover:text-secondary tag-hover"
              }`}
            title="Настройки"
            style={viewMode === "settings" ? { backgroundColor: 'var(--bg-tag-active)' } : {}}

          >
            {/* <div className="transition-transform duration-500 group-hover:rotate-45"> */}
            <div ref={settingsIconRef} className="flex items-center justify-center will-change-transform">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                className={viewMode === "settings" ? 'stroke-white' : 'stroke-current'}
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
              </svg>
            </div>
            {/* </div> */}
          </button>

          <button
            onClick={() => {
              setRefreshKey(p => p + 1);
              setIsRefreshing(true);
            }}
            className={`flex-1 h-12 rounded-xl flex items-center justify-center transition-all border group cursor-pointer ${draggedScript ? 'opacity-20 blur-[1px]' : ''
              } text-tertiary border-transparent hover:text-secondary tag-hover active:scale-95`}
            title="Обновить список"
          >
            <div className="transition-transform duration-500 group-hover:-rotate-45">
              <div
                ref={refreshIconRef}
                className="flex items-center justify-center will-change-transform"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                </svg>
              </div>
            </div>
          </button>
        </div>
      </div >

      {/* Main Content */}
      < div
        className="flex-1 px-8 flex flex-col overflow-hidden transition-all duration-300 relative z-10"
        style={{ background: viewMode === "settings" ? 'var(--bg-primary)' : 'linear-gradient(to bottom right, var(--bg-primary), var(--bg-secondary))' }
        }
      >

        <div className={`flex-1 flex flex-col min-h-0 ${viewMode === "settings" ? "overflow-y-auto custom-scrollbar" : ""}`}>
          {viewMode === "settings" ? (
            <div className="max-w-[1200px] mx-auto w-full space-y-12 py-8">
              <section className="space-y-8 bg-white/[0.02] p-10 rounded-[2.5rem] border border-white/5 shadow-2xl">
                <h3 className="text-sm font-bold tracking-widest text-tertiary uppercase">Настройки темы</h3>
                <div className="space-y-6">
                  <div className="flex justify-between items-center px-2">
                    <span className="text-base font-bold text-secondary">Яркость интерфейса</span>
                    <span className="text-xs font-mono text-indigo-400 font-bold bg-indigo-400/10 px-4 py-1.5 rounded-full tracking-widest uppercase">{brightness}%</span>
                  </div>
                  <input
                    type="range"
                    min="0" max="100"
                    value={brightness}
                    onChange={(e) => setBrightness(parseInt(e.target.value))}
                    className="w-full h-2 bg-white/5 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 transition-all opacity-80 hover:opacity-100"
                  />
                  <div className="flex justify-between text-xs text-tertiary font-bold uppercase tracking-[0.3em] pt-2 px-1">
                    <span>OLED черный</span>
                    <span>Светло-серый</span>
                  </div>
                </div>

                <div className="space-y-6 pt-4 border-t border-white/5">
                  <div className="flex justify-between items-center px-2">
                    <div className="flex flex-col">
                      <span className="text-base font-bold text-secondary">Контраст текста</span>
                      <span className="text-xs text-tertiary mt-1">Яркость второстепенных текстов</span>
                    </div>
                    <span className="text-xs font-mono text-indigo-400 font-bold bg-indigo-400/10 px-4 py-1.5 rounded-full tracking-widest uppercase">{textContrast.toFixed(1)}x</span>
                  </div>
                  <input
                    type="range"
                    min="1" max="3" step="0.1"
                    value={textContrast}
                    onChange={(e) => setTextContrast(parseFloat(e.target.value))}
                    className="w-full h-2 bg-white/5 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 transition-all opacity-80 hover:opacity-100"
                  />
                  <div className="flex justify-between text-xs text-tertiary font-bold uppercase tracking-[0.3em] pt-2 px-1">
                    <span>Стандарт</span>
                    <span>Максимум (100%)</span>
                  </div>
                </div>

                <div className="space-y-6 pt-4 border-t border-white/5">
                  <div className="flex justify-between items-center px-2">
                    <div className="flex flex-col">
                      <span className="text-base font-bold text-secondary">Размер текста</span>
                      <span className="text-xs text-tertiary mt-1">Глобальное масштабирование шрифтов</span>
                    </div>
                    <span className="text-xs font-mono text-indigo-400 font-bold bg-indigo-400/10 px-4 py-1.5 rounded-full tracking-widest uppercase">{fontScale.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.75" max="1.5" step="0.05"
                    value={fontScale}
                    onChange={(e) => setFontScale(parseFloat(e.target.value))}
                    className="w-full h-2 bg-white/5 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 transition-all opacity-80 hover:opacity-100"
                  />
                  <div className="flex justify-between text-xs text-tertiary font-bold uppercase tracking-[0.3em] pt-2 px-1">
                    <span>1.0x</span>
                    <span>1.5x</span>
                  </div>
                </div>
              </section>

              {/* 
              <section className="space-y-10 bg-white/[0.02] p-10 rounded-[2.5rem] border border-white/5 shadow-2xl relative overflow-hidden group/kinetics">
                ... (Kinetics Tuning Block)
              </section>
              */}

              <section className="space-y-8 bg-white/[0.02] p-10 rounded-[2.5rem] border border-white/5 shadow-2xl">
                <h3 className="text-sm font-bold tracking-widest text-tertiary uppercase">Интерфейс</h3>
                <div className="flex justify-between items-center px-2">
                  <div className="flex flex-col">
                    <span className="text-base font-bold text-secondary">Анимации</span>
                    <span className="text-xs text-tertiary mt-1">Плавные переходы в дереве скриптов</span>
                  </div>
                  <button
                    onClick={toggleAnimations}
                    className={`relative w-14 h-7 rounded-full transition-all duration-300 cursor-pointer border ${animationsEnabled
                      ? 'bg-indigo-500/30 border-indigo-400/40 shadow-[0_0_12px_rgba(99,102,241,0.3)]'
                      : 'bg-white/5 border-white/10'
                      }`}
                  >
                    <div className={`absolute top-[3px] w-5 h-5 rounded-full transition-all duration-300 shadow-lg ${animationsEnabled
                      ? 'left-[30px] bg-indigo-400 shadow-indigo-500/50'
                      : 'left-[3px] bg-white/30'
                      }`} />
                  </button>
                </div>
              </section>

              <section className="space-y-8 bg-white/[0.02] p-10 rounded-[2.5rem] border border-white/5 shadow-2xl">
                <h3 className="text-sm font-bold tracking-widest text-tertiary uppercase">Пути к скриптам</h3>
                <div className="flex flex-col space-y-6">
                  <span className="text-base font-bold text-secondary pl-2">Корневая папка</span>
                  <div className="flex items-center space-x-4 p-5 bg-white/[0.03] border border-white/5 rounded-2xl">
                    <span className="flex-1 text-xs font-bold text-tertiary truncate font-mono italic tracking-tight">{rootPath}</span>
                    <button
                      onClick={() => alert("Интерфейс выбора папки - в разработке")}
                      className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-bold tracking-widest transition-all shadow-xl shadow-indigo-900/20 active:scale-95 border border-transparent"
                    >
                      Обзор
                    </button>
                  </div>
                </div>
              </section>
            </div>
          ) : (
            <MemoizedScriptTree
              key={`script-tree-${refreshKey}`}
              filterTag={activeTab}
              onTagsLoaded={handleTagsLoaded}
              onLoadingChange={setIsRefreshing}
              viewMode={displayMode}
              onViewModeChange={toggleDisplayMode}
              onCustomDragStart={startCustomDrag}
              isDragging={draggedScript !== null}
              draggedScriptPath={draggedScript?.path || null}
              animationsEnabled={animationsEnabled}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              onScriptContextMenu={(e, s) => {
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY, type: 'script', data: s });
              }}
              onFolderContextMenu={(e, folderData) => {
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY, type: 'folder', data: folderData });
              }}
            />
          )}
        </div>
      </div >

      {/* Ghost Drag Element */}
      <div
        ref={ghostRef}
        data-dragging="false"
        data-drag-type={draggedTag ? "tag" : (draggedScript ? "script" : "none")}
        className={`drag-ghost-container fixed z-[99999] flex items-center ${draggedScript || draggedTag ? 'opacity-100' : 'opacity-0 hidden'}
          ${draggedTag
            ? (draggedTag === activeTab
              ? 'w-[240px] px-6 h-11 rounded-2xl border-b-2 border-indigo-500 shadow-xl text-indigo-400 font-bold'
              : 'w-[240px] px-6 h-11 rounded-2xl border-transparent shadow-2xl text-secondary font-bold'
            )
            : (draggedScript ? 'bg-white/10 border border-white/20 shadow-2xl backdrop-blur-xl rounded-2xl px-6 py-3 text-white font-bold whitespace-nowrap space-x-3' : '')
          }
        `}
        style={{
          left: 0,
          top: 0,
          width: draggedTag ? `${dragGhostSize.w}px` : 'auto',
          height: draggedTag ? `${dragGhostSize.h}px` : 'auto',
          willChange: 'transform, opacity',
          backgroundColor: draggedTag ? (draggedTag === activeTab ? 'var(--bg-tag-active-hover)' : 'var(--bg-tag-drag)') : 'transparent',
          // @ts-ignore
          viewTransitionName: 'drag-ghost'
        }}
      >
        {draggedScript && (
          <>
            <div className="w-2 h-2 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]"></div>
            <span className="text-xs font-semibold text-white tracking-wide">{draggedScript.filename}</span>
          </>
        )}
        {
          draggedTag && (
            <span className="text-sm font-bold truncate flex-1">{draggedTag}</span>
          )
        }
      </div >

      {/* Context Menu */}
      {
        contextMenu && (
          <div
            className="fixed z-[100000] min-w-[200px] bg-[#1a1a1c]/80 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] py-2 animate-scale-in overflow-hidden"
            style={{
              left: Math.min(contextMenu.x, window.innerWidth - 220),
              top: Math.min(contextMenu.y, window.innerHeight - 300),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {contextMenu.type === 'script' && (
              <>
                <ContextMenuItem
                  label={contextMenu.data.is_running ? "Остановить" : "Запустить"}
                  icon={contextMenu.data.is_running ? "⏹" : "▶"}
                  onClick={() => {
                    if (contextMenu.data.is_running) invoke("kill_script", { path: contextMenu.data.path });
                    else invoke("run_script", { path: contextMenu.data.path });
                    setContextMenu(null);
                    setRefreshKey(p => p + 1);
                  }}
                />
                <ContextMenuItem
                  label="Редактировать"
                  icon="📝"
                  onClick={() => {
                    invoke("edit_script", { path: contextMenu.data.path });
                    setContextMenu(null);
                  }}
                />
                <ContextMenuItem
                  label="Показать в папке"
                  icon="📂"
                  onClick={() => {
                    invoke("open_in_explorer", { path: contextMenu.data.path });
                    setContextMenu(null);
                  }}
                />
                <div className="h-[1px] bg-white/5 my-1" />
                <ContextMenuItem
                  label="Копировать путь"
                  icon="🔗"
                  onClick={() => {
                    navigator.clipboard.writeText(contextMenu.data.path);
                    setContextMenu(null);
                  }}
                />
              </>
            )}

            {contextMenu.type === 'tag' && (
              <>
                <ContextMenuItem
                  label="Переименовать"
                  icon="✏️"
                  onClick={() => {
                    setIsRenamingTag(contextMenu.data);
                    setEditTagName(contextMenu.data);
                    setContextMenu(null);
                  }}
                />
                <ContextMenuItem
                  label="Удалить тег"
                  icon="🗑️"
                  danger
                  onClick={async () => {
                    if (confirm(`Вы уверены, что хотите удалить тег "${contextMenu.data}" у всех скриптов и из базы?`)) {
                      await invoke("delete_tag", { tag: contextMenu.data });
                      setContextMenu(null);
                      setRefreshKey(p => p + 1);
                    }
                  }}
                />
              </>
            )}

            {contextMenu.type === 'folder' && (
              <>
                <ContextMenuItem
                  label="Показать в проводнике"
                  icon="📂"
                  onClick={() => {
                    invoke("open_in_explorer", { path: contextMenu.data.fullName });
                    setContextMenu(null);
                  }}
                />
                <div className="h-[1px] bg-white/5 my-1" />
                <ContextMenuItem
                  label="Развернуть все вложенные"
                  icon="➕"
                  onClick={() => {
                    contextMenu.data.onExpandAll();
                    setContextMenu(null);
                  }}
                />
                <div className="h-[1px] bg-white/5 my-1" />
                <ContextMenuItem
                  label="Копировать путь"
                  icon="🔗"
                  onClick={() => {
                    navigator.clipboard.writeText(contextMenu.data.fullName);
                    setContextMenu(null);
                  }}
                />
              </>
            )}
          </div>
        )}
      {/* Debug Overlay - Finalized
        {debugMomentum > 0 && (
          <div className="flex flex-col items-center space-y-4">
            ...
          </div>
        )}
      */}
    </div >
  );
}

function ContextMenuItem({ label, icon, onClick, danger = false }: { label: string, icon: string, onClick: () => void, danger?: boolean }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`w-full px-4 py-2.5 text-xs font-bold flex items-center space-x-3 transition-all cursor-pointer group ${danger ? 'text-red-400 hover:bg-red-500/10' : 'text-secondary hover:bg-white/5 hover:text-white'}`}
    >
      <span className="w-4 h-4 flex items-center justify-center opacity-70 group-hover:opacity-100">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

export default App;

