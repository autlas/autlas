import React, { useState, useEffect, useRef, useCallback } from "react";
import ScriptTree from "./components/ScriptTree";
import ScriptDetailPanel from "./components/ScriptDetailPanel";
import ContextMenu from "./components/ContextMenu";
import TagIconPicker from "./components/TagIconPicker";
import SettingsPanel from "./components/SettingsPanel";
import DragGhost from "./components/DragGhost";
import Sidebar from "./components/Sidebar";
import OrphanReconcileDialog, { PendingMatch } from "./components/OrphanReconcileDialog";
import { Script, checkEverythingStatus, launchEverything, installEverything } from "./api";
import { Toaster, toast } from "sonner";
import { CloseIcon } from "./components/ui/Icons";
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

  const [draggedScript, setDraggedScript] = useState<{ id: string; path: string; filename: string; tags: string[] } | null>(null);
  const [dragOverTag, setDragOverTag] = useState<string | null>(null);
  const [isCreatingTagFor, setIsCreatingTagFor] = useState<{ id: string; path: string; filename: string; tags: string[] } | null>(null);
  const [newTagName, setNewTagName] = useState("");
  const [draggedTag, setDraggedTag] = useState<string | null>(null);
  const [isRenamingTag, setIsRenamingTag] = useState<string | null>(null);
  const [editTagName, setEditTagName] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [everythingToast, setEverythingToast] = useState<"installed" | "not_installed" | "launching" | "installing" | "started" | null>(null);
  const [installProgress, setInstallProgress] = useState<{ phase: string; progress: number } | null>(null);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [orphanMatches, setOrphanMatches] = useState<PendingMatch[]>([]);
  const [showOrphanDialog, setShowOrphanDialog] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; type: "script" | "tag" | "folder" | "general"; data: any } | null>(null);
  const [activeTabPressed, setActiveTabPressed] = useState<string | null>(null);
  const iconPickerTag = useTreeStore(s => s.iconPickerTag);
  const setIconPickerTag = useTreeStore(s => s.setIconPickerTag);
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
  const scriptActionsRef = useRef<{ toggle: (s: Script) => void; restart: (s: Script) => void; pendingScripts: Record<string, "run" | "kill" | "restart">; allScripts: Script[]; setTagIcon: (tag: string, iconName: string) => void; removeTagIcon: (tag: string) => void }>({ toggle: () => { }, restart: () => { }, pendingScripts: {}, allScripts: [], setTagIcon: () => { }, removeTagIcon: () => { } });
  const [, setDataVersion] = useState(0);

  const { brightness, setBrightness, textContrast, setTextContrast, fontScale, setFontScale, animationsEnabled, toggleAnimations, vimModeNav, setVimModeNav } = useTheme();

  const triggerScan = useCallback(() => {
    toast.dismiss("everything");
    setRefreshKey(p => p + 1);
  }, []);

  const { scanPaths, handleAddScanPath, handleRemoveScanPath } = useScanPaths(triggerScan);

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
    toast.custom(() => (
      <div className="flex items-center gap-3 w-full px-5 py-3 bg-[#1a1a1f] border border-white/10 rounded-2xl shadow-2xl">
        <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
        <span className="text-xs font-medium text-white/70 flex-1">{t("sidebar.library_synced")}</span>
      </div>
    ), { id: "scan", duration: 2500 });
  }, [t]);

  // Listen for scan progress events
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let unlistenOrphan: (() => void) | null = null;
    import('@tauri-apps/api/event').then(({ listen }) => {
      listen<number>('scan-progress', (event) => {
        toast.custom(() => (
          <div className="flex items-center gap-3 w-full px-5 py-3 bg-[#1a1a1f] border border-white/10 rounded-2xl shadow-2xl">
            <div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)] animate-pulse" />
            <span className="text-xs font-medium text-white/70 flex-1">{t("sidebar.scripts_found")} {event.payload}</span>
          </div>
        ), { id: "scan", duration: Infinity });
      }).then(fn => { unlisten = fn; });
      listen<PendingMatch[]>('orphan-matches-found', (event) => {
        if (event.payload.length > 0) {
          setOrphanMatches(event.payload);
          const count = event.payload.length;
          toast.custom(() => (
            <div className="flex items-center gap-3 w-full px-5 py-3 bg-[#1a1a1f] border border-white/10 rounded-2xl shadow-2xl">
              <div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
              <span className="text-xs font-medium text-white/70 flex-1">
                {count === 1 ? t("orphan.toast_one") : t("orphan.toast_many", { count })}
              </span>
              <button
                onClick={() => { setShowOrphanDialog(true); toast.dismiss("orphan"); }}
                className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider whitespace-nowrap bg-indigo-500/20 text-indigo-400 rounded-lg hover:bg-indigo-500/30 transition-colors cursor-pointer"
              >{t("orphan.review")}</button>
              <button
                onClick={() => toast.dismiss("orphan")}
                className="ml-1 text-white/30 hover:text-white/60 transition-colors cursor-pointer"
              ><CloseIcon size={14} /></button>
            </div>
          ), { id: "orphan", duration: Infinity });
        }
      }).then(fn => { unlistenOrphan = fn; });
    });
    return () => { unlisten?.(); unlistenOrphan?.(); };
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
      timeText = `${m}${t("sidebar.time_m")} ${s}${t("sidebar.time_s")}`;
    } else if (diff < 172800) {
      timeText = `${Math.floor(diff / 3600)}${t("sidebar.time_h")}`;
    } else {
      timeText = `${Math.floor(diff / 86400)}${t("sidebar.time_d")}`;
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
    toast.dismiss("everything");
    setTimeout(() => setEverythingToast(null), 500);
  }, []);

  const showEverythingToast = useCallback((status: string) => {
    const isInstalled = status === "installed";
    const isStarted = status === "started";
    toast.custom(() => (
      <div className="flex items-center gap-3 w-full px-5 py-3 bg-[#1a1a1f] border border-white/10 rounded-2xl shadow-2xl">
        <div className={`w-2 h-2 rounded-full ${isStarted
          ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]"
          : isInstalled
            ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]"
            : "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]"}`} />
        <span className="text-xs font-medium text-white/70 flex-1">
          {isStarted ? "Everything is running — instant scan enabled"
            : isInstalled ? "Everything is not running — scan will be slower"
            : "Install Everything for instant file scanning"}
        </span>
        {isInstalled && (
          <button
            onClick={async () => {
              toast.dismiss("everything");
              setEverythingToast("launching");
              try { await launchEverything(); setEverythingToast("started"); showEverythingToast("started"); }
              catch (e) { console.error(e); setEverythingToast("installed"); showEverythingToast("installed"); }
            }}
            className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider whitespace-nowrap bg-indigo-500/20 text-indigo-400 rounded-lg hover:bg-indigo-500/30 transition-colors cursor-pointer"
          >Launch</button>
        )}
        {status === "not_installed" && (
          <button onClick={() => setShowInstallModal(true)}
            className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider whitespace-nowrap bg-indigo-500/20 text-indigo-400 rounded-lg hover:bg-indigo-500/30 transition-colors cursor-pointer"
          >Install</button>
        )}
        <button onClick={() => toast.dismiss("everything")} className="ml-1 text-white/30 hover:text-white/60 transition-colors cursor-pointer"><CloseIcon size={14} /></button>
      </div>
    ), { id: "everything", duration: isStarted ? 3000 : Infinity });
  }, []);

  // Check Everything status on startup
  useEffect(() => {
    checkEverythingStatus().then(status => {
      if (status !== "running") {
        setEverythingToast(status);
        showEverythingToast(status);
      }
    });
  }, [showEverythingToast]);

  // Auto-hide toast when Everything starts running
  useEffect(() => {
    if (everythingToast !== "installed") return;
    const interval = setInterval(async () => {
      const status = await checkEverythingStatus();
      if (status === "running") {
        setEverythingToast("started");
        showEverythingToast("started");
        setTimeout(hideEverythingToast, 3000);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [everythingToast, hideEverythingToast, showEverythingToast]);

  // Listen for Everything install progress events
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    import('@tauri-apps/api/event').then(({ listen }) => {
      listen<{ phase: string; progress: number }>('everything-install-progress', (event) => {
        setInstallProgress(event.payload);
      }).then(fn => { unlisten = fn; });
    });
    return () => { if (unlisten) unlisten(); };
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

  const handleCustomDrop = async (id: string, tag: string) => {
    setDragOverTag(null);
    if (id && tag) {
      try {
        await invoke("add_script_tag", { id, tag: tag === "hub" ? "hub" : tag });
      } catch (err) {
        console.warn("[App] FAIL: Backend refused custom engine update", err);
      }
    }
  };

  const startCustomDrag = useCallback((script: { id: string; path: string; filename: string; tags: string[]; x: number; y: number }) => {
    setDraggedScript({ id: script.id, path: script.path, filename: script.filename, tags: script.tags });
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

  const handleExposeActions = useCallback((actions: typeof scriptActionsRef.current) => {
    scriptActionsRef.current = actions;
    setDataVersion(v => v + 1);
  }, []);

  const handleSelectScript = useCallback((s: Script) => {
    setSelectedPath(prev => prev === s.path ? null : s.path);
  }, []);

  const handleDetailToggle = useCallback((s: Script) => {
    scriptActionsRef.current.toggle(s);
  }, []);

  const handleDetailRestart = useCallback((s: Script) => {
    scriptActionsRef.current?.restart(s);
  }, []);

  const handleDetailAddTag = useCallback(async (s: Script, tag: string) => {
    try {
      await invoke("add_script_tag", { id: s.id, tag });
    } catch (err) { console.error("[App] Add tag failed:", err); }
  }, []);

  const handleDetailRemoveTag = useCallback(async (s: Script, tag: string) => {
    try {
      await invoke("remove_script_tag", { id: s.id, tag });
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
        await handleCustomDrop(draggedScript.id, dragOverTag);
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
        triggerScan={triggerScan}
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
          className="flex-1 px-4 flex flex-col overflow-hidden transition-all duration-300"
          style={{ background: viewMode === "settings" ? "var(--bg-primary)" : "linear-gradient(to bottom right, var(--bg-primary), var(--bg-secondary))" }}
        >
          <div className={`flex-1 flex flex-col min-h-0 ${viewMode === "settings" ? "overflow-y-auto custom-scrollbar -mr-4 pr-4" : ""}`}>
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
                onInstallEverything={() => setShowInstallModal(true)}
                orphanCount={orphanMatches.length}
                onReviewOrphans={() => setShowOrphanDialog(true)}
              />
            </div>

            <div className={viewMode !== "settings" ? "flex-1 flex flex-col min-h-0" : "hidden"}>
              {Array.from(visitedTabs).map(tab => (
                <div key={`script-tree-${tab}`} className={tab === activeTab ? "flex-1 flex flex-col min-h-0" : "hidden"}>
                  <MemoizedScriptTree
                    isActive={tab === activeTab}
                    filterTag={tab}
                    onTagsLoaded={handleTagsLoaded}
                    onLoadingChange={tab === activeTab ? handleLoadingChange : () => { }}
                    onRunningCountChange={tab === activeTab ? setRunningCount : () => { }}
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
                    refreshKey={refreshKey}
                    onScanComplete={handleScanComplete}
                    isPathsEmpty={scanPaths.length === 0}
                    scanPaths={scanPaths}
                    onAddPath={handleAddScanPath}
                    onRemovePath={handleRemoveScanPath}
                    onRefresh={triggerScan}
                    isRefreshing={isRefreshing}
                    onSelectScript={handleSelectScript}
                    onExposeActions={handleExposeActions}
                    isDetailOpen={!!selectedPath}
                    onCloseDetail={() => setSelectedPath(null)}
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
        onRefresh={triggerScan}
        onChooseTagIcon={(tag) => setIconPickerTag(tag)}
      />

      {iconPickerTag && (
        <TagIconPicker
          tag={iconPickerTag}
          currentIcon={useTreeStore.getState().tagIcons[iconPickerTag]}
          onSelect={(tag, iconName) => scriptActionsRef.current.setTagIcon(tag, iconName)}
          onReset={(tag) => scriptActionsRef.current.removeTagIcon(tag)}
          onClose={() => setIconPickerTag(null)}
        />
      )}

      {/* Orphan reconciliation dialog */}
      {showOrphanDialog && orphanMatches.length > 0 && (
        <OrphanReconcileDialog
          matches={orphanMatches}
          onClose={() => setShowOrphanDialog(false)}
          onResolved={() => { setOrphanMatches([]); toast.dismiss("orphan"); }}
          onMatchResolved={(orphanId) => setOrphanMatches(prev => prev.filter(m => m.orphan_id !== orphanId))}
        />
      )}

      <Toaster
        position="bottom-center"
        gap={8}
        toastOptions={{ unstyled: true, style: { minWidth: '420px' } }}
      />

      {/* Everything Install Modal */}
      {showInstallModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !installProgress && setShowInstallModal(false)} />
          <div className="relative bg-[#1a1a1f] border border-white/10 rounded-3xl shadow-2xl w-[400px] p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold tracking-widest text-white/60 uppercase">Install Everything</h3>
              {!installProgress && (
                <button onClick={() => setShowInstallModal(false)} className="text-white/30 hover:text-white/60 transition-colors cursor-pointer"><CloseIcon size={14} /></button>
              )}
            </div>

            <p className="text-xs text-white/50 leading-relaxed">
              Everything enables instant file scanning — 30–100x faster than regular disk scan. Choose how to install:
            </p>

            {!installProgress ? (
              <div className="space-y-3">
                <button
                  onClick={async () => {
                    setInstallProgress({ phase: "downloading", progress: 0 });
                    setEverythingToast("installing");
                    try {
                      await installEverything();
                      setInstallProgress(null);
                      setShowInstallModal(false);
                      setEverythingToast("started");
                      showEverythingToast("started");
                      setTimeout(hideEverythingToast, 3000);
                    } catch (e) {
                      console.error(e);
                      setInstallProgress(null);
                      setEverythingToast("not_installed");
                    }
                  }}
                  className="w-full py-3 bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/20 hover:border-indigo-500/40 rounded-2xl transition-all cursor-pointer group"
                >
                  <div className="text-sm font-bold text-indigo-400 group-hover:text-indigo-300 transition-colors">Install Automatically</div>
                  <div className="text-[14px] text-white/40 mt-1">Download and install silently via direct link</div>
                </button>

                <button
                  onClick={() => {
                    invoke("open_url", { url: "https://www.voidtools.com/downloads/" });
                    setShowInstallModal(false);
                  }}
                  className="w-full py-3 bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 hover:border-white/20 rounded-2xl transition-all cursor-pointer group"
                >
                  <div className="text-sm font-bold text-white/70 group-hover:text-white/90 transition-colors">Install Manually</div>
                  <div className="text-[14px] text-white/40 mt-1">Open voidtools.com downloads page</div>
                </button>
              </div>
            ) : (
              <div className="space-y-4 py-2">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)] animate-pulse" />
                  <span className="text-xs font-medium text-white/70 flex-1">
                    {installProgress.phase === "installing"
                      ? "Installing Everything…"
                      : `Downloading… ${installProgress.progress}%`}
                  </span>
                </div>
                <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                    style={{ width: `${installProgress.phase === "installing" ? 100 : installProgress.progress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
