import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { GearIcon } from "./ui/Icons";

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
    px-6 h-11 rounded-2xl cursor-pointer text-sm font-bold transition-all border-b-2 flex items-center justify-between relative z-50
    will-change-transform select-none long-press-shrink ${state.activeTabPressed === tab ? "active-left" : ""}
    ${state.draggedTag === tab
      ? "opacity-0 invisible pointer-events-none"
      : (state.draggedScript && isTag && state.draggedScript.tags.includes(tab))
        ? "text-white/10 border-transparent opacity-30 shadow-none blur-[1px]"
        : (state.draggedScript && isTag)
          ? `text-indigo-400 border-indigo-500/20 tag-pulse-target ${state.dragOverTag === tab ? "tag-drop-hover" : ""}`
          : state.activeTab === tab
            ? "text-indigo-400 border-indigo-500 shadow-lg tag-active"
            : state.draggedScript
              ? "text-white/10 border-transparent opacity-30 shadow-none blur-[1px]"
              : "text-tertiary border-transparent hover:text-secondary tag-hover"}
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

  return (
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
              onClick={() => !draggedScript && onTabClick(tab.id)}
            >
              <div className="flex items-center space-x-3 pointer-events-none">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="translate-y-[2px]">
                  <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
                  <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
                  <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
                  <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
                </svg>
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
              onClick={() => !draggedScript && onTabClick(tab.id)}
            >
              <div className="flex items-center space-x-3 pointer-events-none">
                {tab.id === "all" && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2L2 7l10 5 10-5-10-5z" />
                    <path d="M2 17l10 5 10-5" />
                    <path d="M2 12l10 5 10-5" />
                  </svg>
                )}
                {tab.id === "no_tags" && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="translate-y-[2px]">
                    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                    <line x1="7" y1="7" x2="7.01" y2="7" />
                    <line x1="2" y1="22" x2="22" y2="2" />
                  </svg>
                )}
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
            onClick={() => onTabClick("tags")}
          >
            <span className={`text-[14px] font-bold uppercase tracking-[0.1em] group-hover:opacity-100 ${activeTab === "tags" ? "opacity-80" : "opacity-50"} transition-opacity`}>{t("sidebar.tags", "TAGS")}</span>
          </div>

          <ul className="flex flex-col space-y-1.5 px-0 w-full">
            {userTags.map((tag) => (
              <li
                key={tag}
                onMouseDown={(e) => handleTagDragStart(e, tag)}
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
                className={navItemClass(tag, true, { activeTab, draggedScript, draggedTag, dragOverTag, activeTabPressed })}
                style={{
                  backgroundColor: (dragOverTag === tag || (draggedScript && !draggedScript.tags.includes(tag)))
                    ? undefined
                    : (activeTab === tag ? "var(--bg-tag-active)" : "var(--bg-tag)"),
                  // @ts-ignore
                  viewTransitionName: `tag-${tag.replace(/\s+/g, "-")}`,
                }}
                onClick={() => { if (!draggedScript) onTabClick(tag); }}
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
                className={navItemClass("new-tag", true, { activeTab, draggedScript, draggedTag, dragOverTag, activeTabPressed })}
                onMouseEnter={() => setDragOverTag("new-tag")}
                onMouseLeave={() => dragOverTag === "new-tag" && setDragOverTag(null)}
              >
                <span className="flex items-center justify-center w-full pointer-events-none">
                  <span className="text-xl font-light">+</span>
                </span>
              </li>
            )}
            {isCreatingTagFor && (
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

      <div className="flex items-center space-x-3 w-full pr-[10px] mt-10">
        <button
          onClick={() => onTabClick("settings")}
          className={`flex-1 h-12 rounded-xl flex items-center justify-center transition-all border-b-2 group cursor-pointer ${draggedScript ? "opacity-20 blur-[1px]" : ""
            } ${viewMode === "settings"
              ? "text-indigo-400 border-indigo-500 shadow-lg tag-active bg-white/5"
              : "text-tertiary border-transparent hover:text-secondary tag-hover"
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
  );
}
