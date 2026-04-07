import React, { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { GearIcon, TagIcon, TagDotIcon, TagIconSvg, LayersIcon, TagOffIcon, SyncIcon, ChevronDownIcon } from "./ui/Icons";
import { useTreeStore } from "../store/useTreeStore";
import Tooltip from "./ui/Tooltip";
import logoImg from "../assets/logo.png";
import { safeSetItem } from "../utils/safeStorage";

interface SidebarProps {
  activeTab: string;
  viewMode: "tree" | "hub" | "settings";
  userTags: string[];
  draggedScript: { id: string; path: string; filename: string; tags: string[] } | null;
  draggedTag: string | null;
  dragOverTag: string | null;
  isCreatingTagFor: { id: string; path: string; filename: string; tags: string[] } | null;
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
  triggerScan: () => void;
  onRenameTag: (oldTag: string, newTag: string) => Promise<void>;
  onRefresh: () => void;
  onHoveringRefresh: (hovering: boolean) => void;
  onCustomDrop: (id: string, tag: string) => void;
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
    px-[13px] h-12 rounded-2xl cursor-pointer text-sm font-bold transition-[background-color,opacity,filter,box-shadow,transform] duration-200 flex items-center justify-between relative z-50
    will-change-transform select-none long-press-shrink ${state.activeTabPressed === tab ? "active-left" : ""}
    ${state.draggedTag === tab
      ? "opacity-0 invisible pointer-events-none"
      : (state.draggedScript && isTag && state.draggedScript.tags.includes(tab))
        ? "text-white/10 opacity-30 shadow-none blur-[1px]"
        : (state.draggedScript && isTag)
          ? `text-indigo-400 tag-pulse-target ${state.dragOverTag === tab ? "tag-drop-hover" : ""}`
          : state.activeTab === tab
            ? "text-white/80 shadow-lg tag-active"
            : state.draggedScript
              ? "text-white/10 opacity-30 shadow-none blur-[1px]"
              : "text-tertiary hover:text-secondary tag-hover"}
  `;
}

export default function Sidebar({
  activeTab, viewMode, userTags, draggedScript, draggedTag, dragOverTag, isCreatingTagFor, isRenamingTag, editTagName,
  runningCount, isRefreshing, isHoveringRefresh, lastScanTimestamp, activeTabPressed, newTagName,
  onTabClick, setActiveTab, setDragOverTag, setDraggedTag, setIsCreatingTagFor, setNewTagName, setIsRenamingTag, setEditTagName,
  setActiveTabPressed, setDragGhostSize, setContextMenu, setUserTags, triggerScan, onRenameTag, onRefresh, onHoveringRefresh, onCustomDrop,
  settingsIconRef, refreshIconRef, ghostRef, tagDragOffsetYRef, tagDragOffsetXRef, pendingTagDragRef, formatLastScan,
}: SidebarProps) {
  const { t } = useTranslation();
  const sidebarCollapsed = useTreeStore(s => s.sidebarCollapsed);
  const tagIcons = useTreeStore(s => s.tagIcons);

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
  const sideTip = (text: string, child: React.ReactElement) =>
    collapsed ? <Tooltip text={text} side="right">{child}</Tooltip> : child;
  const sidebarWidth = useTreeStore(s => s.sidebarWidth);
  const setSidebarWidth = useTreeStore(s => s.setSidebarWidth);
  const [isResizing, setIsResizing] = useState(false);
  const [tagsCollapsed, setTagsCollapsed] = useState(() => localStorage.getItem("ahk_tags_collapsed") === "true");

  const setSidebarCollapsed = useTreeStore(s => s.setSidebarCollapsed);
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const wasCollapsed = useTreeStore.getState().sidebarCollapsed;
    const startWidth = wasCollapsed ? 80 : sidebarWidth;
    let didCollapse = wasCollapsed;
    if (!wasCollapsed) setIsResizing(true);

    const onMouseMove = (ev: MouseEvent) => {
      const raw = startWidth + (ev.clientX - startX);
      if (raw < 100) {
        if (!didCollapse) {
          didCollapse = true;
          setIsResizing(false);
          setSidebarCollapsed(true);
        }
      } else {
        if (didCollapse) {
          didCollapse = false;
          setSidebarCollapsed(false);
          // Let transition animate expand, then switch to resize mode
          setTimeout(() => setIsResizing(true), 300);
        }
        setSidebarWidth(Math.min(400, Math.max(200, raw)));
      }
    };
    const onMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [sidebarWidth, setSidebarWidth, setSidebarCollapsed]);

  return (
    <div
      className={`group/sidebar flex flex-col border-r relative z-[100] ${collapsed ? 'w-20 transition-all duration-300' : ''} ${isResizing ? '' : 'transition-all duration-300'}`}
      style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-color)", ...(!collapsed ? { width: `${sidebarWidth}px` } : {}) }}
    >
      {/* Resize handle — right edge */}
      <div
        onMouseDown={handleResizeStart}
        className="absolute top-0 right-0 w-1 h-full cursor-col-resize z-[111] hover:bg-indigo-500/50 transition-colors"
      />

      <div className={`flex flex-col space-y-1.5 flex-1 pt-5 pb-5 overflow-x-hidden pl-4 ${collapsed ? 'scrollbar-overlay custom-scrollbar pr-[13px]' : 'overflow-y-auto custom-scrollbar pr-[6px]'}`}>
        {/* Group 1: Hub */}
        <ul className="space-y-1.5 w-full">
          {[{ id: "hub", label: t("sidebar.hub", "Hub") }].map((tab) => {
            const item = (
              <li
                key={tab.id}
                onMouseEnter={() => { if (!collapsed && draggedScript && !draggedScript.tags.includes("hub")) setDragOverTag(tab.id); }}
                onMouseLeave={() => { if (!collapsed && draggedScript && dragOverTag === tab.id) setDragOverTag(null); }}
                className={`h-[52px] rounded-2xl cursor-pointer text-sm font-bold flex items-center whitespace-nowrap relative px-[10px] -ml-[2px]
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
                  <img src={logoImg} alt="Hub" className={`w-8 h-8 flex-shrink-0 transition-all duration-300 ${activeTab === "hub" && viewMode !== "settings" ? "brightness-0 invert" : ""}`} />
                  <span className={`text-lg tracking-tight transition-[width,margin,opacity] duration-150 ${collapsed ? 'w-0 ml-0 opacity-0' : 'w-auto ml-3 opacity-100'}`}>{tab.label}</span>
                </div>
                {activeTab !== "hub" && (
                  <div className={`absolute flex items-center justify-center rounded-full bg-green-500 transition-all duration-300
                    ${collapsed
                      ? (runningCount > 0 ? 'top-[-1px] right-[-1px] w-4.5 h-4.5 shadow-[0_0_12px_rgba(34,197,94,0.6)]' : 'top-[22px] right-2 w-2 h-2 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.5)] opacity-0')
                      : (runningCount > 0 ? 'top-[16px] right-3 w-5 h-5 shadow-[0_0_12px_rgba(34,197,94,0.6)]' : 'top-[22px] right-4 w-2 h-2 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.5)]')
                    }`}
                  >
                    {runningCount > 0 && (
                      <span className={`font-bold leading-none transition-all duration-300 ${collapsed ? 'text-[14px]' : 'text-[15px]'}`} style={{ color: "var(--bg-secondary)" }}>{runningCount}</span>
                    )}
                  </div>
                )}
              </li>
            );
            return collapsed ? <Tooltip key={tab.id} text={tab.label} side="right">{item}</Tooltip> : item;
          })}
        </ul>

        <div className="h-[1px] bg-white/5 mx-2 my-2" />

        {/* Group 2: Global Filters */}
        <ul className="space-y-1.5 w-full">
          {[
            { id: "all", label: t("sidebar.all", "All") },
            { id: "no_tags", label: t("sidebar.no_tags", "Untagged") },
          ].map((tab) => {
            const item = (
              <li
                key={tab.id}
                className={`h-12 rounded-2xl cursor-pointer text-sm font-bold transition-[background-color,opacity,filter,box-shadow] duration-200 flex items-center overflow-hidden whitespace-nowrap ${collapsed ? 'w-12' : ''} px-[13px]
                  justify-between
                  ${!collapsed && draggedScript && tab.id !== dragOverTag ? "opacity-20 blur-[1px]" : ""}
                  ${activeTab === tab.id && viewMode !== "settings"
                    ? "text-white/80 shadow-lg tag-active"
                    : "text-tertiary hover:text-secondary tag-hover"
                  }`}
                style={{ backgroundColor: activeTab === tab.id && viewMode !== "settings" ? "var(--bg-tag-active)" : "var(--bg-tag)" }}
                onClick={() => !draggedScript && onTabClick(tab.id)}
              >
                <div className="flex items-center pointer-events-none flex-shrink-0">
                  {tab.id === "all" && <LayersIcon size={22} weight={activeTab === tab.id && viewMode !== "settings" ? "fill" : "bold"} className="flex-shrink-0" />}
                  {tab.id === "no_tags" && <TagOffIcon size={22} weight={activeTab === tab.id && viewMode !== "settings" ? "fill" : "bold"} className="flex-shrink-0 translate-y-[1px]" />}
                  <span className={`transition-[width,margin,opacity] duration-150 ${collapsed ? 'w-0 ml-0 opacity-0' : 'w-auto ml-3 opacity-100'}`}>{tab.label}</span>
                </div>
              </li>
            );
            return collapsed ? <Tooltip key={tab.id} text={tab.label} side="right">{item}</Tooltip> : item;
          })}
        </ul>

        <div className="h-[1px] bg-white/5 mx-2 my-2" />

        {/* Group 3: Tags */}
        <div className="flex flex-col space-y-1.5 w-full">
          {sideTip(t("sidebar.tags", "Tags"),
            <li
              className={`h-12 rounded-2xl cursor-pointer text-sm font-bold transition-[background-color,opacity,filter,box-shadow] duration-200 flex items-center overflow-hidden whitespace-nowrap ${collapsed ? 'w-12' : ''} px-[13px]
                justify-between
                ${!collapsed && draggedScript ? "opacity-20 blur-[1px]" : ""}
                ${activeTab === "tags" && viewMode !== "settings"
                  ? "text-white/80 shadow-lg tag-active"
                  : "text-tertiary hover:text-secondary tag-hover"
                }`}
              style={{ backgroundColor: activeTab === "tags" && viewMode !== "settings" ? "var(--bg-tag-active)" : "var(--bg-tag)", listStyle: "none" }}
              onClick={() => !draggedScript && onTabClick("tags")}
            >
              <div className="flex items-center pointer-events-none flex-shrink-0">
                <TagIcon size={22} weight={activeTab === "tags" && viewMode !== "settings" ? "fill" : "bold"} className="flex-shrink-0 translate-y-[1px]" />
                <span className={`transition-[width,margin,opacity] duration-150 ${collapsed ? 'w-0 ml-0 opacity-0' : 'w-auto ml-3 opacity-100'}`}>{t("sidebar.tags", "Tags")}</span>
              </div>
              {!collapsed && (
                <button
                  onClick={(e) => { e.stopPropagation(); setTagsCollapsed(v => { const next = !v; safeSetItem("ahk_tags_collapsed", String(next)); return next; }); }}
                  className="text-white/20 hover:text-white/50 transition-colors cursor-pointer p-1"
                >
                  <ChevronDownIcon className={`transition-transform duration-200 ${tagsCollapsed ? '-rotate-90' : ''}`} />
                </button>
              )}
            </li>
          )}

          <ul className={`flex flex-col space-y-1.5 px-0 w-full transition-all duration-300 overflow-hidden ${tagsCollapsed && !collapsed ? 'max-h-0 opacity-0' : 'max-h-[2000px] opacity-100'}`}>
            {userTags.map((tag) => {
              const item = (
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
                    ? `w-12 px-[13px] h-12 rounded-2xl cursor-pointer text-sm font-bold transition-[background-color,opacity,filter,box-shadow] duration-200 flex items-center justify-between overflow-hidden whitespace-nowrap
                      ${activeTab === tag && viewMode !== "settings"
                      ? "text-white/80 shadow-lg tag-active"
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
                    <div className="flex items-center flex-shrink-0 w-full">
                      {tagIcons[tag]
                        ? <TagIconSvg name={tagIcons[tag]} size={22} weight="bold" className="flex-shrink-0" />
                        : <TagDotIcon size={22} weight="bold" className="flex-shrink-0" />
                      }
                      <input
                        autoFocus
                        className="bg-transparent border-none outline-none text-sm font-bold w-full text-white ml-3"
                        value={editTagName}
                        onChange={(e) => setEditTagName(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onBlur={async () => {
                          const newName = editTagName.trim();
                          if (newName && newName !== tag) {
                            await onRenameTag(tag, newName);
                            const newOrder = userTags.map(t => t === tag ? newName : t);
                            setUserTags(newOrder);
                            await invoke("save_tag_order", { order: newOrder });
                            if (activeTab === tag) setActiveTab(newName);
                          }
                          setIsRenamingTag(null);
                        }}
                        onKeyDown={async (e) => {
                          if (e.key === "Enter") {
                            (e.target as HTMLInputElement).blur();
                          } else if (e.key === "Escape") {
                            setEditTagName(tag);
                            setIsRenamingTag(null);
                          }
                        }}
                      />
                    </div>
                  ) : (
                    <div className="flex items-center pointer-events-none flex-shrink-0">
                      {tagIcons[tag]
                        ? <TagIconSvg name={tagIcons[tag]} size={22} weight={activeTab === tag && viewMode !== "settings" ? "fill" : "bold"} className="flex-shrink-0" />
                        : <TagDotIcon size={22} weight={activeTab === tag && viewMode !== "settings" ? "fill" : "bold"} className="flex-shrink-0" />
                      }
                      <span className={`relative z-50 font-bold transition-[width,margin,opacity] duration-150 ${collapsed ? 'w-0 ml-0 opacity-0' : 'w-auto ml-3 opacity-100 truncate'}`}>{tag}</span>
                    </div>
                  )}
                </li>
              );
              return collapsed ? <Tooltip key={tag} text={tag} side="right">{item}</Tooltip> : item;
            })}
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
                <div className="flex items-center flex-shrink-0 w-full">
                  <TagDotIcon size={22} weight="bold" className="flex-shrink-0" />
                  <input
                    autoFocus
                    type="text"
                    className="bg-transparent border-none outline-none text-sm font-bold w-full text-white ml-3 placeholder:text-white/20"
                    placeholder={t("search.tag_name")}
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    onBlur={() => setIsCreatingTagFor(null)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newTagName.trim()) {
                        const tagName = newTagName.trim();
                        onCustomDrop(isCreatingTagFor.id, tagName);
                        setIsCreatingTagFor(null);
                        useTreeStore.getState().setIconPickerTag(tagName);
                      } else if (e.key === "Escape") {
                        setIsCreatingTagFor(null);
                      }
                    }}
                  />
                </div>
              </li>
            )}
          </ul>
        </div>
      </div>

      {/* Bottom: settings + refresh */}
      <div className={`flex w-full mt-auto pl-4 pr-[13px] ${collapsed ? 'flex-col items-center space-y-1.5 pb-5' : 'items-center space-x-3'}`}>
        <Tooltip text={t("sidebar.settings")} side={collapsed ? "right" : undefined}>
          <button
            onClick={() => onTabClick("settings")}
            className={`${collapsed ? 'w-12' : 'flex-1'} h-12 rounded-xl flex items-center justify-center transition-[background-color,opacity,filter,box-shadow] duration-200 group cursor-pointer ${!collapsed && draggedScript ? "opacity-20 blur-[1px]" : ""
              } ${viewMode === "settings"
                ? "text-white/80 shadow-lg tag-active bg-white/5"
                : "text-tertiary hover:text-secondary tag-hover"
              }`}
            style={viewMode === "settings" ? { backgroundColor: "var(--bg-tag-active)" } : {}}
          >
            <div ref={settingsIconRef} className="flex items-center justify-center will-change-transform">
              <GearIcon weight={viewMode === "settings" ? "fill" : "bold"} />
            </div>
          </button>
        </Tooltip>

        <Tooltip text={t("sidebar.refresh")} side={collapsed ? "right" : undefined}>
          <button
            onClick={() => { triggerScan(); onRefresh(); }}
            onMouseEnter={() => onHoveringRefresh(true)}
            onMouseLeave={() => onHoveringRefresh(false)}
            className={`${collapsed ? 'w-12' : 'flex-1'} h-12 rounded-xl flex items-center justify-center transition-all border group cursor-pointer ${!collapsed && draggedScript ? "opacity-20 blur-[1px]" : ""
              } text-tertiary border-transparent hover:text-secondary tag-hover active:scale-95`}
          >
            <div className="transition-transform duration-500 group-hover:-rotate-45">
              <div ref={refreshIconRef} className="flex items-center justify-center will-change-transform">
                <SyncIcon />
              </div>
            </div>
          </button>
        </Tooltip>
      </div>
      {!collapsed && (
        <div className={`pr-[14px] flex justify-end h-4 transition-all duration-150 ${isHoveringRefresh ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"}`}>
          <span className="text-[12px] uppercase tracking-[0.1em] text-tertiary/50 select-none flex items-center whitespace-nowrap">
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
