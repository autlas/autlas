import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { GearIcon, TagIcon, TagDotIcon, LayersIcon, TagOffIcon } from "./ui/Icons";
import { useTreeStore } from "../store/useTreeStore";
import logoImg from "../assets/logo.png";

interface SidebarProps {
  activeTab: string;
  viewMode: "tree" | "hub" | "settings";
  userTags: string[];
  draggedScript: { path: string; filename: string; tags: string[] } | null;
  draggedTag: string | null;
  dragOverTag: string | null;
  isCreatingTagFor: { path: string; filename: string; tags: string[] } | null;
  isRenamingTag: string | null;
  editTagName: string;
  runningCount: number;
  isRefreshing: boolean;
  isHoveringRefresh: boolean;
  lastScanTimestamp: number;
  activeTabPressed: string | null;
  newTagName: string;

  onTabClick: (tab: string) => void;
  setActiveTab: (tab: string) => void;
  setDragOverTag: (tag: string | null) => void;
  setDraggedTag: (tag: string | null) => void;
  setIsCreatingTagFor: (data: any) => void;
  setNewTagName: (name: string) => void;
  setIsRenamingTag: (tag: string | null) => void;
  setEditTagName: (name: string) => void;
  setActiveTabPressed: (tab: string | null) => void;
  setDragGhostSize: (size: { w: number; h: number }) => void;
  setContextMenu: (menu: any) => void;
  setUserTags: (tags: string[]) => void;
  setRefreshKey: (fn: (p: number) => number) => void;
  onRefresh: () => void;
  onHoveringRefresh: (hovering: boolean) => void;
  onCustomDrop: (path: string, tag: string) => void;
  settingsIconRef: React.RefObject<HTMLDivElement | null>;
  refreshIconRef: React.RefObject<HTMLDivElement | null>;
  ghostRef: React.RefObject<HTMLDivElement | null>;
  tagDragOffsetYRef: React.MutableRefObject<number>;
  tagDragOffsetXRef: React.MutableRefObject<number>;
  pendingTagDragRef: React.MutableRefObject<{ tag: string; x: number; y: number } | null>;
  formatLastScan: (ts: number, now: number) => React.ReactNode;
}

function navItemClass(tab: string, isTag: boolean, state: Pick<SidebarProps, "activeTab" | "draggedScript" | "draggedTag" | "dragOverTag" | "activeTabPressed">): string {
  return `
    px-4 h-12 rounded-2xl cursor-pointer text-sm font-bold transition-all flex items-center justify-between relative z-50
    will-change-transform select-none long-press-shrink ${state.activeTabPressed === tab ? "active-left" : ""}
    ${state.draggedTag === tab
      ? "opacity-0 invisible pointer-events-none"
      : (state.draggedScript && isTag && state.draggedScript.tags.includes(tab))
        ? "text-white/10 opacity-30 shadow-none blur-[1px]"
        : (state.draggedScript && isTag)
          ? `text-indigo-400 tag-pulse-target ${state.dragOverTag === tab ? "tag-drop-hover" : ""}`
          : state.activeTab === tab
            ? "text-indigo-400 shadow-lg tag-active"
            : state.draggedScript
              ? "text-white/10 opacity-30 shadow-none blur-[1px]"
              : "text-tertiary hover:text-secondary tag-hover"}
  `;
}

export default function Sidebar({
  activeTab, viewMode, userTags, draggedScript, draggedTag, dragOverTag, isCreatingTagFor, isRenamingTag, editTagName,
  runningCount, isRefreshing, isHoveringRefresh, lastScanTimestamp, activeTabPressed, newTagName,
  onTabClick, setActiveTab, setDragOverTag, setDraggedTag, setIsCreatingTagFor, setNewTagName, setIsRenamingTag, setEditTagName,
  setActiveTabPressed, setDragGhostSize, setContextMenu, setUserTags, setRefreshKey, onRefresh, onHoveringRefresh, onCustomDrop,
  settingsIconRef, refreshIconRef, ghostRef, tagDragOffsetYRef, tagDragOffsetXRef, pendingTagDragRef, formatLastScan,
}: SidebarProps) {
  const { t } = useTranslation();
  const sidebarCollapsed = useTreeStore(s => s.sidebarCollapsed);
  const toggleSidebarCollapsed = useTreeStore(s => s.toggleSidebarCollapsed);
  const [currentTime, setCurrentTime] = useState(Date.now());
  useEffect(() => {
    const ticker = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(ticker);
  }, []);

  const handleTagDragStart = (e: React.MouseEvent<HTMLLIElement>, tag: string) => {
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
  };

  const collapsed = sidebarCollapsed;

  return (
    <div
      className={`group/sidebar flex flex-col border-r transition-all duration-300 relative z-[100] ${collapsed ? 'w-20' : 'w-72'}`}
      style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-color)" }}
    >
      {/* Toggle button — right edge */}
      <button
        onClick={toggleSidebarCollapsed}
        className="absolute top-[25px] w-[22px] h-[42px] rounded-lg flex items-center justify-center transition-all cursor-pointer z-[110] border border-white/10 opacity-0 pointer-events-none group-hover/sidebar:opacity-100 group-hover/sidebar:pointer-events-auto bg-[var(--bg-secondary)] text-tertiary hover:text-secondary"
        style={{ right: "-11px" }}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-300 ${collapsed ? '' : 'rotate-180'}`}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>

      <div className={`flex flex-col space-y-1.5 flex-1 pt-5 pb-5 overflow-y-auto custom-scrollbar overflow-x-hidden pl-4 ${collapsed ? 'pr-4' : 'pr-[6px]'}`}>
        {/* Group 1: Hub */}
        <ul className="space-y-1.5 w-full">
          {[{ id: "hub", label: t("sidebar.hub", "Hub") }].map((tab) => (
            <li
              key={tab.id}
              onMouseEnter={() => { if (!collapsed && draggedScript && !draggedScript.tags.includes("hub")) setDragOverTag(tab.id); }}
              onMouseLeave={() => { if (!collapsed && draggedScript && dragOverTag === tab.id) setDragOverTag(null); }}
              className={`h-[52px] rounded-2xl cursor-pointer text-sm font-bold transition-all flex items-center whitespace-nowrap relative px-[10px] -ml-[2px] ${collapsed && 'w-[52px]'}
                justify-between
                ${draggedScript && !collapsed
                  ? (draggedScript.tags.includes("hub")
                    ? "opacity-20 blur-[1px]"
                    : `text-indigo-400 tag-pulse-target ${dragOverTag === tab.id ? "tag-drop-hover" : ""}`)
                  : (activeTab === tab.id && viewMode !== "settings"
                    ? "bg-gradient-to-r from-indigo-500 to-purple-500 shadow-xl shadow-indigo-900/40 text-white"
                    : "text-tertiary hover:text-secondary tag-hover")
                }`}
              style={{
                backgroundColor: (activeTab === tab.id && viewMode !== "settings") ? "transparent"
                  : (!collapsed && draggedScript && dragOverTag === tab.id) ? undefined
                    : "var(--bg-tag)",
              }}
              onClick={() => !draggedScript && onTabClick(tab.id)}
            >
              <div className="flex items-center pointer-events-none flex-shrink-0 overflow-hidden">
                <img src={logoImg} alt="Hub" className="w-8 h-8 flex-shrink-0" />
                <span className={`text-lg tracking-tight transition-all duration-300 ${collapsed ? 'w-0 ml-0 opacity-0' : 'w-auto ml-3 opacity-100'}`}>{tab.label}</span>
              </div>
              {!collapsed && activeTab !== "hub" && (
                <div className={`flex items-center justify-center rounded-full bg-indigo-400 transition-all duration-500 flex-shrink-0 ${runningCount > 0 ? "w-5 h-5 shadow-[0_0_12px_rgba(99,102,241,0.6)]" : "w-2 h-2 animate-pulse shadow-[0_0_8px_rgba(79,70,229,0.5)]"}`}>
                  {runningCount > 0 && <span className="text-[15px] font-bold leading-none mt-[1px]" style={{ color: "var(--bg-secondary)" }}>{runningCount}</span>}
                </div>
              )}
              {collapsed && activeTab !== "hub" && runningCount > 0 && (
                <div className="absolute top-0 right-0 w-4 h-4 rounded-full bg-indigo-400 flex items-center justify-center shadow-[0_0_12px_rgba(99,102,241,0.6)]">
                  <span className="text-[10px] font-bold leading-none" style={{ color: "var(--bg-secondary)" }}>{runningCount}</span>
                </div>
              )}
            </li>
          ))}
        </ul>

        <div className="h-[1px] bg-white/5 mx-2 my-2" />

        {/* Group 2: Global Filters */}
        <ul className="space-y-1.5 w-full">
          {[
            { id: "all", label: t("sidebar.all", "All") },
            { id: "no_tags", label: t("sidebar.no_tags", "Untagged") },
          ].map((tab) => (
            <li
              key={tab.id}
              className={`h-12 rounded-2xl cursor-pointer text-sm font-bold transition-all flex items-center overflow-hidden whitespace-nowrap ${collapsed ? 'w-12' : ''} px-4
                justify-between
                ${!collapsed && draggedScript && tab.id !== dragOverTag ? "opacity-20 blur-[1px]" : ""}
                ${activeTab === tab.id && viewMode !== "settings"
                  ? "text-indigo-400 shadow-lg tag-active"
                  : "text-tertiary hover:text-secondary tag-hover"
                }`}
              style={{ backgroundColor: activeTab === tab.id && viewMode !== "settings" ? "var(--bg-tag-active)" : "var(--bg-tag)" }}
              onClick={() => !draggedScript && onTabClick(tab.id)}
            >
              <div className="flex items-center pointer-events-none flex-shrink-0">
                {tab.id === "all" && <LayersIcon className={`flex-shrink-0 transition-opacity ${activeTab === tab.id && viewMode !== "settings" ? 'opacity-100' : 'opacity-40'}`} />}
                {tab.id === "no_tags" && <TagOffIcon className={`flex-shrink-0 translate-y-[1px] transition-opacity ${activeTab === tab.id && viewMode !== "settings" ? 'opacity-100' : 'opacity-40'}`} />}
                <span className={`transition-all duration-300 ${collapsed ? 'w-0 ml-0 opacity-0' : 'w-auto ml-3 opacity-100'}`}>{tab.label}</span>
              </div>
            </li>
          ))}
        </ul>

        <div className="h-[1px] bg-white/5 mx-2 my-2" />

        {/* Group 3: Tags */}
        <div className="flex flex-col space-y-1.5 w-full">
          <li
            className={`h-12 rounded-2xl cursor-pointer text-sm font-bold transition-all flex items-center overflow-hidden whitespace-nowrap ${collapsed ? 'w-12' : ''} px-4
              justify-between
              ${!collapsed && draggedScript ? "opacity-20 blur-[1px]" : ""}
              ${activeTab === "tags" && viewMode !== "settings"
                ? "text-indigo-400 shadow-lg tag-active"
                : "text-tertiary hover:text-secondary tag-hover"
              }`}
            style={{ backgroundColor: activeTab === "tags" && viewMode !== "settings" ? "var(--bg-tag-active)" : "var(--bg-tag)", listStyle: "none" }}
            onClick={() => !draggedScript && onTabClick("tags")}
          >
            <div className="flex items-center pointer-events-none flex-shrink-0">
              <TagIcon className={`flex-shrink-0 translate-y-[1px] transition-opacity ${activeTab === "tags" && viewMode !== "settings" ? 'opacity-100' : 'opacity-40'}`} />
              <span className={`transition-all duration-300 ${collapsed ? 'w-0 ml-0 opacity-0' : 'w-auto ml-3 opacity-100'}`}>{t("sidebar.tags", "Tags")}</span>
            </div>
          </li>

          <ul className="flex flex-col space-y-1.5 px-0 w-full">
            {userTags.map((tag) => (
              <li
                key={tag}
                onMouseDown={(e) => !collapsed && handleTagDragStart(e, tag)}
                onMouseEnter={() => {
                  if (collapsed) return;
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
                  if (collapsed) return;
                  setActiveTabPressed(null);
                  draggedScript && dragOverTag === tag && setDragOverTag(null);
                }}
                className={collapsed
                  ? `w-12 px-4 h-12 rounded-2xl cursor-pointer text-sm font-bold transition-all flex items-center justify-between overflow-hidden whitespace-nowrap
                    ${activeTab === tag && viewMode !== "settings"
                    ? "text-indigo-400 shadow-lg tag-active"
                    : "text-tertiary hover:text-secondary tag-hover"
                  }`
                  : navItemClass(tag, true, { activeTab, draggedScript, draggedTag, dragOverTag, activeTabPressed })
                }
                style={collapsed
                  ? { backgroundColor: activeTab === tag ? "var(--bg-tag-active)" : "var(--bg-tag)" }
                  : {
                    backgroundColor: (dragOverTag === tag || (draggedScript && !draggedScript.tags.includes(tag)))
                      ? undefined
                      : (activeTab === tag ? "var(--bg-tag-active)" : "var(--bg-tag)"),
                    // @ts-ignore
                    viewTransitionName: `tag-${tag.replace(/\s+/g, "-")}`,
                  }
                }
                onClick={() => { if (!draggedScript) onTabClick(tag); }}
              >
                {isRenamingTag === tag && !collapsed ? (
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
                  <div className="flex items-center pointer-events-none flex-shrink-0">
                    <TagDotIcon className={`flex-shrink-0 transition-opacity ${activeTab === tag && viewMode !== "settings" ? 'opacity-100' : 'opacity-40'}`} />
                    <span className={`relative z-50 truncate flex-1 font-bold transition-all duration-300 ${collapsed ? 'w-0 ml-0 opacity-0' : 'w-auto ml-3 opacity-100'}`}>{tag}</span>
                  </div>
                )}
              </li>
            ))}
            {!collapsed && draggedScript && (
              <li
                className={navItemClass("new-tag", true, { activeTab, draggedScript, draggedTag, dragOverTag, activeTabPressed })}
                onMouseEnter={() => setDragOverTag("new-tag")}
                onMouseLeave={() => dragOverTag === "new-tag" && setDragOverTag(null)}
              >
                <span className="flex items-center justify-center w-full pointer-events-none">
                  <span className="text-xl font-light">+</span>
                </span>
              </li>
            )}
            {!collapsed && isCreatingTagFor && (
              <li className={navItemClass("", true, { activeTab, draggedScript, draggedTag, dragOverTag, activeTabPressed })}>
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
                      onCustomDrop(isCreatingTagFor.path, newTagName.trim());
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

      {/* Bottom: settings + refresh */}
      <div className={`flex w-full mt-auto pl-5 pr-[10px] ${collapsed ? 'flex-col items-center space-y-1.5 pb-5' : 'items-center space-x-3'}`}>
        <button
          onClick={() => onTabClick("settings")}
          className={`${collapsed ? 'w-11' : 'flex-1'} h-12 rounded-xl flex items-center justify-center transition-all group cursor-pointer ${!collapsed && draggedScript ? "opacity-20 blur-[1px]" : ""
            } ${viewMode === "settings"
              ? "text-indigo-400 shadow-lg tag-active bg-white/5"
              : "text-tertiary hover:text-secondary tag-hover"
            }`}
          title={t("sidebar.settings", "Settings")}
          style={viewMode === "settings" ? { backgroundColor: "var(--bg-tag-active)" } : {}}
        >
          <div ref={settingsIconRef} className="flex items-center justify-center will-change-transform">
            <GearIcon className={viewMode === "settings" ? "stroke-white" : "stroke-current"} />
          </div>
        </button>

        <button
          onClick={() => { setRefreshKey(p => p + 1); onRefresh(); }}
          onMouseEnter={() => onHoveringRefresh(true)}
          onMouseLeave={() => onHoveringRefresh(false)}
          className={`${collapsed ? 'w-11' : 'flex-1'} h-12 rounded-xl flex items-center justify-center transition-all border group cursor-pointer ${!collapsed && draggedScript ? "opacity-20 blur-[1px]" : ""
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
      {!collapsed && (
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
      )}
    </div>
  );
}
