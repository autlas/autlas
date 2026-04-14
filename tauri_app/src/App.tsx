import React, { useState, useEffect, useRef, useCallback, useDeferredValue, useMemo } from "react";
import ScriptTree from "./components/scripts/ScriptTree";
import ScriptDetailPanel from "./components/detail/ScriptDetailPanel";
import ContextMenu from "./components/common/ContextMenu";
import TagIconPicker from "./components/tags/TagIconPicker";
import SettingsPanel from "./components/settings/SettingsPanel";
import DragGhost from "./components/common/DragGhost";
import Sidebar from "./components/sidebar/Sidebar";
import CheatSheet from "./components/common/CheatSheet";
import OrphanReconcileDialog, { PendingMatch } from "./components/common/OrphanReconcileDialog";
import EverythingManager, { EverythingManagerHandle } from "./components/common/EverythingManager";
import { Script, setScriptHub, addScriptTag, removeScriptTag, showScriptUI, saveTagOrder, getTagOrder } from "./api";
import { Toaster } from "sonner";
import { appToast } from "./components/ui/AppToast";
import { useTheme } from "./hooks/useTheme";
import { useScanPaths } from "./hooks/useScanPaths";
import { useScanBlacklist } from "./hooks/useScanBlacklist";
import { useHiddenFolders } from "./hooks/useHiddenFolders";
import { usePhysicsMotion } from "./hooks/usePhysicsMotion";
import { useNavigation } from "./hooks/useNavigation";
import { useWindowLayoutManager } from "./hooks/useWindowLayoutManager";
import { useScanProgressListener } from "./hooks/useScanProgressListener";
import { useRefreshAnimation } from "./hooks/useRefreshAnimation";
import { useDragGhostPosition } from "./hooks/useDragGhostPosition";
import { useFpsMonitor } from "./hooks/useFpsMonitor";
import {
  useVimMouseExit,
  useCheatsheetKeybind,
  useDevtoolsShortcut,
  useContextMenuCloseOnOutside,
} from "./hooks/useAppGlobalEvents";
import { useTranslation } from "react-i18next";
import { useTreeStore } from "./store/useTreeStore";
import { safeSetItem } from "./utils/safeStorage";
import {
  TREE_MIN_WIDTH,
  DETAIL_PANEL_MIN_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_COLLAPSED_WIDTH,
} from "./constants/layout";
import "./App.css";

const MemoizedScriptTree = React.memo(ScriptTree);

function App() {
  const { t } = useTranslation();

  // ─── Global app lifecycle hooks (vim, cheatsheet, devtools, FPS) ─────
  useVimMouseExit();
  useCheatsheetKeybind();
  useDevtoolsShortcut();
  useFpsMonitor();

  const cheatsheetOpen = useTreeStore(s => s.cheatsheetOpen);
  const setCheatsheetOpen = useTreeStore(s => s.setCheatsheetOpen);

  const selectedPathRef = useRef<string | null>(null);
  const setSelectedPathRef = useRef<((p: string | null) => void) | null>(null);

  // ─── Window layout (resize, grow, squeeze) ─────────────────────────
  const { growWindowToFit } = useWindowLayoutManager(selectedPathRef, setSelectedPathRef);

  const [userTags, setUserTags] = useState<string[]>([]);

  const draggedScript = useTreeStore(s => s.draggedScript);
  const setDraggedScript = useTreeStore(s => s.setDraggedScript);
  const dragOverTag = useTreeStore(s => s.dragOverTag);
  const setDragOverTag = useTreeStore(s => s.setDragOverTag);
  const draggedTag = useTreeStore(s => s.draggedTag);
  const setDraggedTag = useTreeStore(s => s.setDraggedTag);
  const setIsCreatingTagFor = useTreeStore(s => s.setIsCreatingTagFor);
  const setNewTagName = useTreeStore(s => s.setNewTagName);
  const setIsRenamingTag = useTreeStore(s => s.setIsRenamingTag);
  const setEditTagName = useTreeStore(s => s.setEditTagName);
  const setActiveTabPressedStore = useTreeStore(s => s.setActiveTabPressed);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const everythingRef = useRef<EverythingManagerHandle>(null);
  const [orphanMatches, setOrphanMatches] = useState<PendingMatch[]>([]);
  const [showOrphanDialog, setShowOrphanDialog] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; type: "script" | "tag" | "folder" | "general"; data: any; fromKeyboard?: boolean } | null>(null);
  const iconPickerTag = useTreeStore(s => s.iconPickerTag);
  const setIconPickerTag = useTreeStore(s => s.setIconPickerTag);
  const [runningCount, setRunningCount] = useState(0);
  const [lastScanTimestamp, setLastScanTimestamp] = useState<number>(() => {
    const saved = localStorage.getItem("ahk_last_scan_timestamp");
    if (saved) {
      return parseInt(saved);
    }
    const now = Date.now();
    safeSetItem("ahk_last_scan_timestamp", now.toString());
    return now;
  });
  const [isHoveringRefresh, setIsHoveringRefresh] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  useEffect(() => {
    const wasOpen = !!selectedPathRef.current;
    selectedPathRef.current = selectedPath;
    if (!wasOpen && selectedPath) {
      // Grow the window first (if it can fit), then fall back to squeezing
      // the sidebar only if the window couldn't actually grow large enough.
      (async () => {
        await growWindowToFit({ assumeDetailOpen: true });
        const TREE_MIN = TREE_MIN_WIDTH;
        const DETAIL_MIN = DETAIL_PANEL_MIN_WIDTH;
        const SIDEBAR_COLLAPSED = SIDEBAR_COLLAPSED_WIDTH;
        const state = useTreeStore.getState();
        const total = window.innerWidth;
        const sidebar = state.sidebarCollapsed ? SIDEBAR_COLLAPSED : state.sidebarWidth;
        const detail = state.detailPanelWidth;
        if (total - sidebar - detail >= TREE_MIN) return;
        // Window didn't grow enough — squeeze. Drop the panel to its floor
        // first, then ask the sidebar to step aside.
        if (detail > DETAIL_MIN) state.setDetailPanelWidth(Math.max(DETAIL_MIN, total - sidebar - TREE_MIN));
        if (total - (state.sidebarCollapsed ? SIDEBAR_COLLAPSED : state.sidebarWidth) - DETAIL_MIN >= TREE_MIN) return;
        if (!state.sidebarCollapsed) {
          const desiredSidebar = total - DETAIL_MIN - TREE_MIN;
          if (desiredSidebar >= SIDEBAR_MIN_WIDTH) {
            state.setSidebarWidth(desiredSidebar);
          } else {
            state.setSidebarWidth(SIDEBAR_MIN_WIDTH);
            state.setSidebarCollapsed(true);
          }
        }
      })();
    }
  }, [selectedPath, growWindowToFit]);
  useEffect(() => { setSelectedPathRef.current = setSelectedPath; }, []);
  const [detailPinned, setDetailPinned] = useState(() => localStorage.getItem("ahk_detail_pinned") === "true");
  const scriptActionsRef = useRef<{ toggle: (s: Script) => void; restart: (s: Script) => void; pendingScripts: Record<string, "run" | "kill" | "restart">; allScripts: Script[]; setTagIcon: (tag: string, iconName: string) => void; removeTagIcon: (tag: string) => void; deleteTagFromAll: (tag: string) => void; renameTag: (oldTag: string, newTag: string) => Promise<void>; toggleHiddenByPath: (path: string) => void }>({ toggle: () => { }, restart: () => { }, pendingScripts: {}, allScripts: [], setTagIcon: () => { }, removeTagIcon: () => { }, deleteTagFromAll: () => { }, renameTag: async () => { }, toggleHiddenByPath: () => { } });
  const [dataVersion, setDataVersion] = useState(0);

  const { brightness, setBrightness, textContrast, setTextContrast, fontScale, setFontScale, vimModeNav, setVimModeNav } = useTheme();

  const triggerScan = useCallback(() => {
    appToast.dismiss("everything");
    appToast.info(t("sidebar.scanning", "Сканирование..."), { id: "scan", duration: Infinity, pulse: true });
    setRefreshKey(p => p + 1);
  }, [t]);

  const { scanPaths, handleAddScanPath, handleRemoveScanPath } = useScanPaths(triggerScan);
  const { blacklist, handleAddBlacklist, handleRemoveBlacklist, addBlacklistPath } = useScanBlacklist(triggerScan);
  const { hiddenFolders, unhideFolder, refreshHiddenFolders, handleAddHiddenFolder } = useHiddenFolders(triggerScan);

  // Memoize pathCounts — avoid O(scripts×paths) on every render
  const pathCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const norm = (p: string) => p.replace(/\\/g, "/").toLowerCase().replace(/\/+$/, "");
    const normPaths = scanPaths.map(p => ({ orig: p, n: norm(p) }));
    for (const s of scriptActionsRef.current.allScripts) {
      const sp = norm(s.path);
      for (const { orig, n } of normPaths) {
        if (sp === n || sp.startsWith(n + "/")) {
          counts[orig] = (counts[orig] || 0) + 1;
        }
      }
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanPaths, dataVersion]);

  const { settingsIconRef, pendingImpulseRef, momentumRef, motionImpulseRef, motionImpulseInitialRef } = usePhysicsMotion();
  const navPhysics = { pendingImpulseRef, momentumRef, motionImpulseRef, motionImpulseInitialRef };
  const { activeTab, setActiveTab, viewMode, displayMode, searchQuery, setSearchQuery, handleTabClick, toggleDisplayMode } = useNavigation(userTags, navPhysics);
  // Sidebar consumes the urgent activeTab so the highlight flips on the
  // next paint. The (potentially heavy) ScriptTree mount/swap is driven by
  // deferred copies of the navigation state so it doesn't block the urgent
  // commit (especially when switching to hub which also flips displayMode).
  const renderedTab = useDeferredValue(activeTab);
  const renderedViewMode = useDeferredValue(viewMode);
  const renderedDisplayMode = useDeferredValue(displayMode);

  const refreshIconRef = useRef<HTMLDivElement>(null);
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(() => new Set([activeTab]));
  useEffect(() => {
    if (renderedTab !== "settings") {
      setVisitedTabs(prev => prev.has(renderedTab) ? prev : new Set(prev).add(renderedTab));
    }
  }, [renderedTab]);

  const ghostRef = useRef<HTMLDivElement>(null);
  const [dragGhostSize, setDragGhostSize] = useState({ w: 0, h: 0 });

  const handleScanComplete = useCallback((timestamp: number, count?: number, durationMs?: number) => {
    setLastScanTimestamp(timestamp);
    safeSetItem("ahk_last_scan_timestamp", timestamp.toString());
    const seconds = durationMs !== undefined ? (durationMs / 1000).toFixed(1) : "0.0";
    const message = count !== undefined
      ? t("sidebar.scan_complete", { count, seconds })
      : t("sidebar.library_synced");
    appToast.success(message, { id: "scan", duration: 3500 });
  }, [t]);

  useScanProgressListener({
    onOrphanMatches: setOrphanMatches,
    onReviewOrphans: () => setShowOrphanDialog(true),
  });

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

  // Refresh spinner animation (Web Animations API) + global close handlers.
  useRefreshAnimation(refreshIconRef, isRefreshing);
  useContextMenuCloseOnOutside(() => setContextMenu(null));

  // Sync contextMenu to store (ContextMenu-aware components read from there).
  useEffect(() => { useTreeStore.getState().setContextMenu(contextMenu); }, [contextMenu]);

  // vim Ctrl-tap → open context menu on focused script/folder
  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent).detail as { x: number; y: number; type: "script" | "folder"; data: any; path: string };
      if (d.type === "script") {
        setContextMenu({ x: d.x, y: d.y, type: "script", data: d.data, fromKeyboard: true });
      } else {
        // Folder data from visibleItems lacks the expand-all callbacks that
        // the tree view plumbs in via right-click. The menu disables the
        // expand-all entry when those callbacks are missing.
        setContextMenu({
          x: d.x, y: d.y, type: "folder", fromKeyboard: true, data: {
            ...d.data,
            is_hidden: !!d.data?.is_hidden,
          }
        });
      }
    };
    window.addEventListener("ahk-open-context-menu", onOpen);
    return () => window.removeEventListener("ahk-open-context-menu", onOpen);
  }, []);

  const pendingTagDragRef = useRef<{ tag: string; x: number; y: number } | null>(null);
  const tagDragOffsetYRef = useRef<number>(0);
  const tagDragOffsetXRef = useRef<number>(0);

  useDragGhostPosition(ghostRef, tagDragOffsetXRef, tagDragOffsetYRef);

  const handleCustomDrop = async (id: string, tag: string) => {
    setDragOverTag(null);
    if (id && tag) {
      try {
        // The Hub sidebar pseudo-tab carries the literal id "hub" — when a
        // script gets dropped on it we set the dedicated is_hub flag instead
        // of writing a magic tag string.
        if (tag === "hub") {
          await setScriptHub(id, true);
        } else {
          await addScriptTag(id, tag);
        }
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
    getTagOrder().then(order => {
      const merged = [...order];
      tags.forEach(t => { if (!merged.includes(t)) merged.push(t); });
      setUserTags(merged.filter(t => tags.includes(t)));
    });
  }, []);

  const handleExposeActions = useCallback((actions: typeof scriptActionsRef.current) => {
    const prev = scriptActionsRef.current;
    scriptActionsRef.current = actions;
    // Only force re-render when data the detail panel actually uses has changed
    if (prev.allScripts !== actions.allScripts || prev.pendingScripts !== actions.pendingScripts) {
      setDataVersion(v => v + 1);
    }
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
      if (tag === "hub") await setScriptHub(s.id, true);
      else await addScriptTag(s.id, tag);
    } catch (err) { console.error("[App] Add tag failed:", err); }
  }, []);

  const handleDetailRemoveTag = useCallback(async (s: Script, tag: string) => {
    try {
      if (tag === "hub") await setScriptHub(s.id, false);
      else await removeScriptTag(s.id, tag);
    } catch (err) { console.error("[App] Remove tag failed:", err); }
  }, []);

  const handleShowUI = useCallback(async (s: any) => {
    try {
      await showScriptUI(s.path);
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
      saveTagOrder(userTags);
      if (ghostRef.current) ghostRef.current.setAttribute("data-dragging", "false");
    }

    pendingTagDragRef.current = null;
    setActiveTabPressedStore(null);
  }, [draggedScript, dragOverTag, draggedTag, userTags, setActiveTabPressedStore, setDraggedScript, setDragOverTag, setDraggedTag, setIsCreatingTagFor, setNewTagName]);

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
        runningCount={runningCount}
        isRefreshing={isRefreshing}
        isHoveringRefresh={isHoveringRefresh}
        lastScanTimestamp={lastScanTimestamp}
        onTabClick={handleTabClick}
        setActiveTab={setActiveTab}
        setDragGhostSize={setDragGhostSize}
        setContextMenu={setContextMenu}
        setUserTags={setUserTags}
        triggerScan={triggerScan}
        onRenameTag={(oldTag, newTag) => scriptActionsRef.current.renameTag(oldTag, newTag)}
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
        detailOpen={!!selectedPath && viewMode !== "settings"}
      />

      {/* Main Content + Detail Panel */}
      <div className="flex-1 flex flex-row overflow-hidden relative z-10">
        <div
          className="flex-1 px-4 flex flex-col overflow-hidden transition-all duration-300"
          style={{ background: "var(--bg-primary)" }}
        >
          <div className={`flex-1 flex flex-col min-h-0 ${renderedViewMode === "settings" ? "overflow-y-auto custom-scrollbar -mr-4 pr-4" : ""}`}>
            <div className={renderedViewMode === "settings" ? "block" : "hidden"}>
              <SettingsPanel
                brightness={brightness}
                setBrightness={setBrightness}
                textContrast={textContrast}
                setTextContrast={setTextContrast}
                fontScale={fontScale}
                setFontScale={setFontScale}
                vimModeNav={vimModeNav}
                setVimModeNav={setVimModeNav}
                scanPaths={scanPaths}
                pathCounts={pathCounts}
                onAddPath={handleAddScanPath}
                onRemovePath={handleRemoveScanPath}
                blacklist={blacklist}
                onAddBlacklist={handleAddBlacklist}
                onRemoveBlacklist={handleRemoveBlacklist}
                hiddenFolders={hiddenFolders}
                onUnhideFolder={unhideFolder}
                onAddHiddenFolder={handleAddHiddenFolder}
                onInstallEverything={() => everythingRef.current?.openInstallModal()}
                orphanCount={orphanMatches.length}
                onReviewOrphans={() => setShowOrphanDialog(true)}
                onRefresh={triggerScan}
              />
            </div>

            <div className={renderedViewMode !== "settings" ? "flex-1 flex flex-col min-h-0" : "hidden"}>
              {Array.from(visitedTabs).map(tab => (
                <div key={`script-tree-${tab}`} className={tab === renderedTab ? "flex-1 flex flex-col min-h-0" : "hidden"}>
                  <MemoizedScriptTree
                    isActive={tab === renderedTab}
                    filterTag={tab}
                    onTagsLoaded={handleTagsLoaded}
                    onLoadingChange={tab === renderedTab || renderedViewMode === "settings" ? handleLoadingChange : () => { }}
                    onRunningCountChange={tab === renderedTab ? setRunningCount : () => { }}
                    viewMode={renderedDisplayMode}
                    onViewModeChange={toggleDisplayMode}
                    onCustomDragStart={startCustomDrag}
                    isDragging={draggedScript !== null}
                    draggedScriptPath={draggedScript?.path || null}
                    searchQuery={tab === renderedTab ? searchQuery : ""}
                    setSearchQuery={setSearchQuery}
                    contextMenu={tab === renderedTab ? contextMenu : null}
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
                    onDetailPinToggle={() => setDetailPinned(p => { const v = !p; safeSetItem("ahk_detail_pinned", String(v)); return v; })}
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
              onPinToggle={() => setDetailPinned(p => { const v = !p; safeSetItem("ahk_detail_pinned", String(v)); return v; })}
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
        onDeleteTag={(tag) => scriptActionsRef.current.deleteTagFromAll(tag)}
        onToggleHideFolder={(path) => { scriptActionsRef.current.toggleHiddenByPath(path); refreshHiddenFolders(); }}
        onBlacklistFolder={addBlacklistPath}
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
          onResolved={() => { setOrphanMatches([]); appToast.dismiss("orphan"); }}
          onMatchResolved={(orphanId) => setOrphanMatches(prev => prev.filter(m => m.orphan_id !== orphanId))}
        />
      )}

      <CheatSheet isOpen={cheatsheetOpen} onClose={() => setCheatsheetOpen(false)} />

      <Toaster
        position="bottom-right"
        gap={8}
        toastOptions={{ unstyled: true, style: { minWidth: '420px' } }}
      />

      <EverythingManager ref={everythingRef} />
    </div>
  );
}

export default App;
