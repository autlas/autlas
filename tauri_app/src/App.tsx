import React, { useState, useEffect, useRef, useCallback } from "react";
import ScriptTree from "./components/ScriptTree";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

const MemoizedScriptTree = React.memo(ScriptTree);

function App() {
  const [activeTab, setActiveTab] = useState("Хаб");
  const [userTags, setUserTags] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<"tree" | "hub" | "settings">("hub");

  const [draggedScript, setDraggedScript] = useState<{ path: string, filename: string } | null>(null);
  const [dragOverTag, setDragOverTag] = useState<string | null>(null);
  const [isCreatingTagFor, setIsCreatingTagFor] = useState<{ path: string, filename: string } | null>(null);
  const [newTagName, setNewTagName] = useState("");
  const [isEditingTags, setIsEditingTags] = useState(() => {
    return localStorage.getItem("is-editing-tags") === "true";
  });
  const [draggedTag, setDraggedTag] = useState<string | null>(null);
  const [isRenamingTag, setIsRenamingTag] = useState<string | null>(null);
  const [editTagName, setEditTagName] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, type: 'script' | 'tag' | 'general', data: any } | null>(null);
  const [activeTabPressed, setActiveTabPressed] = useState<string | null>(null);

  const ghostRef = useRef<HTMLDivElement>(null);

  const [brightness, setBrightness] = useState(() => {
    return parseInt(localStorage.getItem("app-brightness") || "20");
  });

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

  const toggleEditMode = () => {
    setIsEditingTags(prev => {
      const next = !prev;
      localStorage.setItem("is-editing-tags", String(next));
      return next;
    });
  };

  const [rootPath] = useState(() => {
    return localStorage.getItem("root-path") || "Desktop / Parent folder";
  });

  const updatePalette = (val: number) => {
    const base = Math.floor((31 * val) / 100);
    const side = Math.floor((37 * val) / 100);
    document.documentElement.style.setProperty("--bg-primary", `rgb(${base}, ${base}, ${base})`);
    document.documentElement.style.setProperty("--bg-secondary", `rgb(${side}, ${side}, ${side})`);
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
        const posX = type === "tag" ? 144 : latestX;
        ghostRef.current.style.transform = `translate3d(${posX}px, ${latestY}px, 0) translate(-50%, -50%)`;
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

      // Only close our menu if the right-click wasn't on a custom target
      // (React's synthetic event will call preventDefault on our custom items)
      if (!(e as any)._reactProcessed && !e.defaultPrevented) {
        setContextMenu(null);
      }
    };

    window.addEventListener('click', handleGlobalClick);
    window.addEventListener('scroll', handleGlobalScroll, true);
    window.addEventListener('contextmenu', handleGlobalContextMenu);
    return () => {
      window.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('scroll', handleGlobalScroll, true);
      window.removeEventListener('contextmenu', handleGlobalContextMenu);
    };
  }, []);

  const handleTabClick = (tab: string) => {
    setActiveTab(tab);
    if (tab === "Хаб") setViewMode("hub");
    else if (tab === "Настройки") setViewMode("settings");
    else setViewMode("tree");
  };

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

  const startCustomDrag = useCallback((script: { path: string, filename: string, x: number, y: number }) => {
    setDraggedScript({ path: script.path, filename: script.filename });
    if (ghostRef.current) {
      ghostRef.current.setAttribute("data-dragging", "true");
      ghostRef.current.style.transform = `translate3d(${script.x}px, ${script.y}px, 0) translate(-50%, -50%)`;
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

  const pendingTagDragRef = useRef<{ tag: string, x: number, y: number } | null>(null);

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
    px-6 h-11 rounded-xl cursor-pointer text-sm font-bold transition-all border flex items-center justify-between relative z-50
    will-change-transform select-none
    ${draggedTag === tab
      ? "bg-white/15 text-white border-white/20 shadow-2xl scale-[1.05] z-50 ring-1 ring-white/20 shadow-white/5"
      : isEditingTags
        ? "bg-white/[0.05] text-tertiary border-white/5 hover:bg-white/10 hover:text-secondary"
        : activeTab === tab
          ? "bg-white/10 text-white border-white/10 shadow-lg"
          : dragOverTag === tab
            ? "bg-indigo-600 text-white border-white/40 shadow-[0_0_20px_rgba(79,70,229,0.5)] scale-[1.02]"
            : (draggedScript && isTag)
              ? "text-indigo-400 border-indigo-500/30 bg-indigo-500/5 animate-pulse"
              : draggedScript
                ? "text-white/10 border-transparent opacity-30 shadow-none scale-[0.98] blur-[1px]"
                : "text-tertiary border-transparent hover:bg-white/5 hover:text-secondary"}
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
        <div className="flex flex-col space-y-8 flex-1">
          <ul className="space-y-1.5">
            {[{ id: "Хаб", label: "Хаб", icon: "" }, { id: "Все скрипты", label: "Дерево", icon: "" }].map((tab) => (
              <li
                key={tab.id}
                className={`px-6 py-4 rounded-xl cursor-pointer text-base font-bold transition-all border flex items-center justify-between ${draggedScript && tab.id !== dragOverTag ? 'opacity-20 blur-[1px] scale-95' : ''
                  } ${activeTab === tab.id && viewMode !== "settings"
                    ? tab.id === "Хаб"
                      ? "bg-gradient-to-r from-indigo-500 to-purple-500 border-indigo-400 shadow-xl shadow-indigo-900/30 text-white"
                      : "bg-white/10 text-primary border-white/10 shadow-lg"
                    : "text-secondary border-transparent hover:bg-white/5 hover:text-primary"
                  }`}
                onClick={() => !draggedScript && handleTabClick(tab.id)}
              >
                <span className="flex items-center space-x-4 pointer-events-none">
                  {tab.icon}
                  <span>{tab.label}</span>
                </span>
                {tab.id === "Хаб" && activeTab !== "Хаб" && <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(79,70,229,0.5)]"></div>}
              </li>
            ))}
          </ul>

          <div className="flex-1">
            <div className="flex items-center justify-between pl-6 pr-0 mb-4">
              <span className="text-xs font-black tracking-[0.3em] text-tertiary uppercase opacity-40">Теги</span>
              <button
                onClick={toggleEditMode}
                className={`p-2 rounded-lg transition-all ${isEditingTags ? 'bg-indigo-500/20 text-indigo-400' : 'text-tertiary hover:text-secondary hover:bg-white/5'}`}
                title={isEditingTags ? "Выйти из режима правки" : "Редактировать теги"}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
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
                      const startX = e.clientX;
                      const startY = e.clientY;
                      pendingTagDragRef.current = { tag: tagToDrag, x: startX, y: startY };

                      const dragTimer = setTimeout(() => {
                        if (pendingTagDragRef.current && pendingTagDragRef.current.tag === tagToDrag) {
                          setDraggedTag(tagToDrag);
                          if (ghostRef.current) {
                            ghostRef.current.setAttribute("data-dragging", "true");
                            ghostRef.current.style.transform = `translate3d(144px, ${startY}px, 0) translate(-50%, -50%)`;
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
                            ghostRef.current.style.transform = `translate3d(144px, ${moveEv.clientY}px, 0) translate(-50%, -50%)`;
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
                  className={`relative flex items-center h-11 px-6 rounded-2xl cursor-pointer transition-all duration-300 group select-none whitespace-nowrap border-b-2 
                    ${activeTab === tag && !draggedScript
                      ? "text-indigo-400 border-indigo-500 bg-white/[0.03] shadow-[0_4px_15px_rgba(79,70,229,0.1)]"
                      : "text-tertiary border-transparent hover:text-secondary hover:bg-white/[0.02]"
                    }
                    ${draggedTag === tag ? "opacity-0 invisible" : ""}
                    ${draggedScript ? "pointer-events-none opacity-20 blur-[1px]" : ""}
                    long-press-shrink ${activeTabPressed === tag ? 'active-left' : ''}
                  `}
                  style={{
                    // @ts-ignore
                    viewTransitionName: `tag-${tag.replace(/\s+/g, '-')}`
                  }}
                  onClick={() => {
                    if (!isEditingTags && !draggedScript) {
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
                      {isEditingTags && (
                        <div
                          className="flex items-center space-x-2 ml-4 p-1.5 hover:bg-white/10 rounded-lg transition-all cursor-pointer group/edit-btn"
                          style={{
                            // @ts-ignore
                            viewTransitionName: 'none'
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsRenamingTag(tag);
                            setEditTagName(tag);
                          }}
                        >
                          <svg className="w-3.5 h-3.5 opacity-40 group-hover/edit-btn:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </div>
                      )}
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

        <div className="pt-8 border-t border-white/5 space-y-3">
          <ul className="space-y-1.5">
            {["Запущенные"].map((item) => (
              <li
                key={item}
                className={navItemClass(item, false)}
                onClick={() => !draggedScript && handleTabClick(item)}
              >
                <span className="relative z-50 pointer-events-none">{item}</span>
              </li>
            ))}
          </ul>

          <button
            onClick={() => handleTabClick("Настройки")}
            className={`w-full px-6 py-4 rounded-xl flex items-center space-x-4 transition-all border group ${draggedScript ? 'opacity-20 blur-[1px]' : ''
              } ${viewMode === "settings"
                ? "bg-indigo-600/10 text-indigo-400 border-indigo-400/20 shadow-lg"
                : "text-tertiary border-transparent hover:text-secondary hover:bg-white/5"
              }`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
              className={`transition-transform duration-500 group-hover:rotate-90 ${viewMode === "settings" ? 'stroke-indigo-400' : 'stroke-current'}`}
              strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
            <span className="text-sm font-bold">Настройки</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div
        className="flex-1 px-8 py-6 flex flex-col overflow-hidden transition-all duration-300 relative z-10"
        style={{ background: viewMode === "settings" ? 'var(--bg-primary)' : 'linear-gradient(to bottom right, var(--bg-primary), var(--bg-secondary))' }}
      >
        <div className={`flex justify-between items-end mb-8 transition-all duration-300 ${draggedScript ? 'opacity-20 blur-[1px]' : ''}`}>
          <div className="flex flex-col">
            <h1 className="text-4xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-white to-white/40 pb-1">
              {activeTab}
            </h1>
            <div className="flex items-center space-x-3 mt-3">
              <div className="h-1.5 w-12 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full w-1/2 bg-indigo-500"></div>
              </div>
              <span className="text-xs text-tertiary uppercase tracking-[0.5em] font-mono">Operations Unit Ready</span>
            </div>
          </div>
          <button
            className="px-10 py-4 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 transition-all text-xs font-bold tracking-widest cursor-pointer active:scale-95 shadow-lg"
            onClick={() => !draggedScript && window.location.reload()}
          >
            Обновить
          </button>
        </div>

        <div className="flex-1 overflow-hidden">
          {viewMode === "settings" ? (
            <div className="max-w-3xl space-y-12 overflow-y-auto custom-scrollbar h-full pr-4">
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
                  <p className="text-xs text-tertiary pl-2 max-w-sm italic leading-relaxed">Обычно скрипты подгружаются с Рабочего стола или из папки приложения.</p>
                </div>
              </section>
            </div>
          ) : (
            <MemoizedScriptTree
              key={`script-tree-${refreshKey}`}
              filterTag={activeTab}
              viewMode={viewMode === "hub" ? "hub" : "tree"}
              onTagsLoaded={handleTagsLoaded}
              onCustomDragStart={startCustomDrag}
              isDragging={draggedScript !== null}
              draggedScriptPath={draggedScript?.path || null}
              animationsEnabled={animationsEnabled}
              onScriptContextMenu={(e, s) => {
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY, type: 'script', data: s });
              }}
            />
          )}
        </div>
      </div>
      {/* Ghost Drag Element */}
      <div
        ref={ghostRef}
        data-dragging="false"
        data-drag-type={draggedTag ? "tag" : (draggedScript ? "script" : "none")}
        className={`fixed z-[99999] pointer-events-none flex items-center transition-opacity duration-150 ${draggedScript || draggedTag ? 'opacity-100' : 'opacity-0 hidden'}
          ${draggedTag
            ? 'w-[240px] px-6 h-11 rounded-2xl border border-white/20 bg-white/10 backdrop-blur-3xl shadow-[0_15px_50px_rgba(0,0,0,0.5)] text-white font-bold'
            : 'px-4 py-2.5 rounded-xl border border-indigo-400/40 bg-indigo-500/20 backdrop-blur-md shadow-2xl text-white space-x-3'
          }
        `}
        style={{
          left: 0,
          top: 0,
          transform: 'translate3d(-50%, -50%, 0)',
          willChange: 'transform, opacity'
        }}
      >
        {draggedScript && (
          <>
            <div className="w-2 h-2 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]"></div>
            <span className="text-xs font-semibold text-white tracking-wide">{draggedScript.filename}</span>
          </>
        )}
        {draggedTag && (
          <span className="text-sm font-black tracking-tight">{draggedTag}</span>
        )}
      </div>

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
                <div className="px-4 py-2 border-b border-white/5 mb-1">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-tertiary opacity-50 mb-0.5">Скрипт</div>
                  <div className="text-xs font-bold text-white truncate">{contextMenu.data.filename}</div>
                </div>
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
                <div className="px-4 py-2 border-b border-white/5 mb-1">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-tertiary opacity-50 mb-0.5">Тег</div>
                  <div className="text-xs font-bold text-white truncate">{contextMenu.data}</div>
                </div>
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
                  onClick={() => {
                    alert("Удаление тега пока не реализовано в бэкенде");
                    setContextMenu(null);
                  }}
                />
              </>
            )}
          </div>
        )
      }
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
