import React, { useState, useEffect, useRef, useCallback } from "react";
import ScriptTree from "./components/ScriptTree";
import ScriptDetailPanel from "./components/ScriptDetailPanel";
import ContextMenu from "./components/ContextMenu";
import SettingsPanel from "./components/SettingsPanel";
import DragGhost from "./components/DragGhost";
import Sidebar from "./components/Sidebar";
import { Script, checkEverythingStatus, launchEverything, installEverything } from "./api";
import { useTheme } from "./hooks/useTheme";
import { useScanPaths } from "./hooks/useScanPaths";
import { usePhysicsMotion } from "./hooks/usePhysicsMotion";
import { useNavigation } from "./hooks/useNavigation";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useTranslation } from "react-i18next";
import { useTreeStore } from "./store/useTreeStore";
import "./App.css";

const MemoizedScriptTree = React.memo(ScriptTree);

function App() {
  const { t } = useTranslation();
  const [userTags, setUserTags] = useState<string[]>([]);

  const [draggedScript, setDraggedScript] = useState<{ path: string; filename: string; tags: string[] } | null>(null);
  const [dragOverTag, setDragOverTag] = useState<string | null>(null);
  const [isCreatingTagFor, setIsCreatingTagFor] = useState<{ path: string; filename: string; tags: string[] } | null>(null);
  const [newTagName, setNewTagName] = useState("");
  const [draggedTag, setDraggedTag] = useState<string | null>(null);
  const [isRenamingTag, setIsRenamingTag] = useState<string | null>(null);
  const [editTagName, setEditTagName] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [scanToast, setScanToast] = useState(false);
  const scanToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [everythingToast, setEverythingToast] = useState<"installed" | "not_installed" | "launching" | "installing" | "started" | null>(null);
  const [everythingToastVisible, setEverythingToastVisible] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; type: "script" | "tag" | "folder" | "general"; data: any } | null>(null);
  const [activeTabPressed, setActiveTabPressed] = useState<string | null>(null);
  const [runningCount, setRunningCount] = useState(0);
  const [lastScanTimestamp, setLastScanTimestamp] = useState<number>(() => {
    const saved = localStorage.getItem("ahk_last_scan_timestamp");
    if (saved) {
      return parseInt(saved);
    }
    const now = Date.now();
    localStorage.setItem("ahk_last_scan_timestamp", now.toString());
    return now;
  });
  const [isHoveringRefresh, setIsHoveringRefresh] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [detailPinned, setDetailPinned] = useState(() => localStorage.getItem("ahk_detail_pinned") === "true");
  const scriptActionsRef = useRef<{ toggle: (s: Script) => void; restart: (s: Script) => void; pendingScripts: Record<string, "run" | "kill" | "restart">; allScripts: Script[] }>({ toggle: () => {}, restart: () => {}, pendingScripts: {}, allScripts: [] });
  const [, setDataVersion] = useState(0);

  const { brightness, setBrightness, textContrast, setTextContrast, fontScale, setFontScale, animationsEnabled, toggleAnimations, vimModeNav, setVimModeNav } = useTheme();
  const { scanPaths, handleAddScanPath, handleRemoveScanPath } = useScanPaths(() => setRefreshKey(p => p + 1));

  const { settingsIconRef, pendingImpulseRef, momentumRef, motionImpulseRef, motionImpulseInitialRef } = usePhysicsMotion();
  const navPhysics = { pendingImpulseRef, momentumRef, motionImpulseRef, motionImpulseInitialRef };
  const { activeTab, setActiveTab, viewMode, displayMode, searchQuery, setSearchQuery, handleTabClick, toggleDisplayMode } = useNavigation(userTags, navPhysics);

  const refreshIconRef = useRef<HTMLDivElement>(null);
  const activeAnimRef = useRef<Animation | null>(null);
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(() => new Set([activeTab]));
  useEffect(() => {
    if (activeTab !== "settings") {
      setVisitedTabs(prev => prev.has(activeTab) ? prev : new Set(prev).add(activeTab));
    }
  }, [activeTab]);

  const ghostRef = useRef<HTMLDivElement>(null);
  const [dragGhostSize, setDragGhostSize] = useState({ w: 0, h: 0 });

  const handleScanComplete = useCallback((timestamp: number) => {
    setLastScanTimestamp(timestamp);
    localStorage.setItem("ahk_last_scan_timestamp", timestamp.toString());
    if (scanToastTimerRef.current) clearTimeout(scanToastTimerRef.current);
    setScanToast(true);
    scanToastTimerRef.current = setTimeout(() => setScanToast(false), 2500);
  }, []);

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

  const hideEverythingToast = useCallback(() => {
    setEverythingToastVisible(false);
    setTimeout(() => setEverythingToast(null), 500);
  }, []);

  // Check Everything status on startup
  useEffect(() => {
    checkEverythingStatus().then(status => {
      if (status !== "running") {
        setEverythingToast(status);
        setEverythingToastVisible(true);
      }
    });
  }, []);

  // Sync contextMenu to store for TreeNodeRenderer
  useEffect(() => { useTreeStore.getState().setContextMenu(contextMenu); }, [contextMenu]);

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

  const handleExposeActions = useCallback((actions: { toggle: (s: Script) => void; restart: (s: Script) => void; pendingScripts: Record<string, "run" | "kill" | "restart">; allScripts: Script[] }) => {
    scriptActionsRef.current = actions;
    setDataVersion(v => v + 1);
  }, []);

  const handleSelectScript = useCallback((s: Script) => {
    setSelectedPath(s.path);
  }, []);

  const handleDetailToggle = useCallback((s: Script) => {
    scriptActionsRef.current.toggle(s);
  }, []);

  const handleDetailRestart = useCallback((s: Script) => {
    scriptActionsRef.current?.restart(s);
  }, []);

  const handleDetailAddTag = useCallback(async (s: Script, tag: string) => {
    try {
      await invoke("add_script_tag", { path: s.path, tag });
    } catch (err) { console.error("[App] Add tag failed:", err); }
  }, []);

  const handleDetailRemoveTag = useCallback(async (s: Script, tag: string) => {
    try {
      await invoke("remove_script_tag", { path: s.path, tag });
    } catch (err) { console.error("[App] Remove tag failed:", err); }
  }, []);

  const handleShowUI = useCallback(async (s: any) => {
    try {
      await invoke("show_script_ui", { path: s.path });
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
      <Sidebar
        activeTab={activeTab}
        viewMode={viewMode}
        userTags={userTags}
        draggedScript={draggedScript}
        draggedTag={draggedTag}
        dragOverTag={dragOverTag}
        isCreatingTagFor={isCreatingTagFor}
        isRenamingTag={isRenamingTag}
        editTagName={editTagName}
        runningCount={runningCount}
        isRefreshing={isRefreshing}
        isHoveringRefresh={isHoveringRefresh}
        lastScanTimestamp={lastScanTimestamp}
        activeTabPressed={activeTabPressed}
        newTagName={newTagName}
        onTabClick={handleTabClick}
        setActiveTab={setActiveTab}
        setDragOverTag={setDragOverTag}
        setDraggedTag={setDraggedTag}
        setIsCreatingTagFor={setIsCreatingTagFor}
        setNewTagName={setNewTagName}
        setIsRenamingTag={setIsRenamingTag}
        setEditTagName={setEditTagName}
        setActiveTabPressed={setActiveTabPressed}
        setDragGhostSize={setDragGhostSize}
        setContextMenu={setContextMenu}
        setUserTags={setUserTags}
        setRefreshKey={setRefreshKey}
        onRefresh={() => setIsRefreshing(true)}
        onHoveringRefresh={setIsHoveringRefresh}
        onCustomDrop={handleCustomDrop}
        settingsIconRef={settingsIconRef}
        refreshIconRef={refreshIconRef}
        ghostRef={ghostRef}
        tagDragOffsetYRef={tagDragOffsetYRef}
        tagDragOffsetXRef={tagDragOffsetXRef}
        pendingTagDragRef={pendingTagDragRef}
        formatLastScan={formatLastScan}
      />

      {/* Main Content + Detail Panel */}
      <div className="flex-1 flex flex-row overflow-hidden relative z-10">
      <div
        className="flex-1 px-8 flex flex-col overflow-hidden transition-all duration-300"
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
            {Array.from(visitedTabs).map(tab => (
              <div key={`script-tree-${tab}-${refreshKey}`} className={tab === activeTab ? "flex-1 flex flex-col min-h-0" : "hidden"}>
                <MemoizedScriptTree
                  isActive={tab === activeTab}
                  filterTag={tab}
                  onTagsLoaded={handleTagsLoaded}
                  onLoadingChange={tab === activeTab ? handleLoadingChange : () => {}}
                  onRunningCountChange={tab === activeTab ? setRunningCount : () => {}}
                  viewMode={displayMode}
                  onViewModeChange={toggleDisplayMode}
                  onCustomDragStart={startCustomDrag}
                  isDragging={draggedScript !== null}
                  draggedScriptPath={draggedScript?.path || null}
                  animationsEnabled={animationsEnabled}
                  searchQuery={tab === activeTab ? searchQuery : ""}
                  setSearchQuery={setSearchQuery}
                  contextMenu={tab === activeTab ? contextMenu : null}
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
                  onSelectScript={handleSelectScript}
                  onExposeActions={handleExposeActions}
                  onOpenSettings={() => {
                    handleTabClick("settings");
                    setTimeout(() => {
                      const el = document.getElementById("settings-add-folder-btn");
                      if (el) {
                        el.scrollIntoView({ behavior: "smooth", block: "center" });
                        el.classList.add("highlight-pulse-once");
                        el.addEventListener("animationend", () => el.classList.remove("highlight-pulse-once"), { once: true });
                      }
                    }, 350);
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {(() => {
        if (!selectedPath || viewMode === "settings") return null;
        const script = scriptActionsRef.current.allScripts.find(s => s.path === selectedPath);
        if (!script) return null;
        return (
          <ScriptDetailPanel
            script={script}
            allUniqueTags={userTags}
            pinned={detailPinned}
            pendingType={scriptActionsRef.current.pendingScripts[selectedPath] ?? null}
            onPinToggle={() => setDetailPinned(p => { const v = !p; localStorage.setItem("ahk_detail_pinned", String(v)); return v; })}
            onClose={() => setSelectedPath(null)}
            onToggle={handleDetailToggle}
            onRestart={handleDetailRestart}
            onShowUI={handleShowUI}
            onAddTag={handleDetailAddTag}
            onRemoveTag={handleDetailRemoveTag}
          />
        );
      })()}
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

      <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] transition-all duration-500 ${scanToast ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
        <div className="flex items-center gap-3 px-5 py-3 bg-[#1a1a1f] border border-white/10 rounded-2xl shadow-2xl">
          <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
          <span className="text-xs font-medium text-white/70">Library synced</span>
        </div>
      </div>

      {/* Everything status toast */}
      <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] transition-all duration-500 ${everythingToastVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
        <div className="flex items-center gap-3 px-5 py-3 bg-[#1a1a1f] border border-white/10 rounded-2xl shadow-2xl">
          <div className={`w-2 h-2 rounded-full ${
            everythingToast === "started"
              ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]"
              : everythingToast === "launching" || everythingToast === "installing"
              ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)] animate-pulse"
              : "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]"
          }`} />
          <span className="text-xs font-medium text-white/70">
            {everythingToast === "started"
              ? "Everything is running — instant scan enabled"
              : everythingToast === "launching"
              ? "Starting Everything…"
              : everythingToast === "installing"
              ? "Installing Everything…"
              : everythingToast === "installed"
              ? "Everything is not running — scan will be slower"
              : "Install Everything for instant file scanning"}
          </span>
          {everythingToast === "installed" ? (
            <button
              onClick={async () => {
                setEverythingToast("launching");
                try {
                  await launchEverything();
                  setEverythingToast("started");
                  setTimeout(() => hideEverythingToast(), 3000);
                } catch (e) { console.error(e); setEverythingToast("installed"); }
              }}
              className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-400 rounded-lg hover:bg-indigo-500/30 transition-colors cursor-pointer"
            >
              Launch
            </button>
          ) : everythingToast === "not_installed" ? (
            <button
              onClick={async () => {
                setEverythingToast("installing");
                try {
                  await installEverything();
                  setEverythingToast("started");
                  setTimeout(() => hideEverythingToast(), 3000);
                } catch (e) { console.error(e); setEverythingToast("not_installed"); }
              }}
              className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-400 rounded-lg hover:bg-indigo-500/30 transition-colors cursor-pointer"
            >
              Install
            </button>
          ) : null}
          {everythingToast !== "launching" && everythingToast !== "installing" && (
            <button
              onClick={hideEverythingToast}
              className="ml-1 text-white/30 hover:text-white/60 transition-colors cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
