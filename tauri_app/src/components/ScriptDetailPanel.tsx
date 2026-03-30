import { useState, useEffect, useCallback, useRef, MouseEvent as ReactMouseEvent } from "react";
import { Script, readScriptContent } from "../api";
import { invoke } from "@tauri-apps/api/core";
import { useHotkeys } from "react-hotkeys-hook";
import TagPickerPopover from "./TagPickerPopover";
import { CloseIcon, PlayIcon, RestartIcon, InterfaceIcon, PlusIcon, EditIcon, FolderIcon } from "./ui/Icons";

interface ScriptDetailPanelProps {
  script: Script;
  allUniqueTags: string[];
  pinned: boolean;
  pendingType: "run" | "kill" | "restart" | null;
  onPinToggle: () => void;
  onClose: () => void;
  onToggle: (s: Script) => void;
  onRestart: (s: Script) => void;
  onShowUI: (s: Script) => void;
  onAddTag: (s: Script, tag: string) => void;
  onRemoveTag: (s: Script, tag: string) => void;
}

export default function ScriptDetailPanel({ script, allUniqueTags, pinned, pendingType, onPinToggle, onClose, onToggle, onRestart, onShowUI, onAddTag, onRemoveTag }: ScriptDetailPanelProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [isEditingTags, setIsEditingTags] = useState(false);
  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = localStorage.getItem("ahk_detail_panel_width");
    return saved ? parseInt(saved) : 420;
  });
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Clamp panel width when window resizes
  useEffect(() => {
    const handleResize = () => {
      const parentWidth = panelRef.current?.parentElement?.clientWidth ?? 1200;
      const maxWidth = parentWidth - 400;
      setPanelWidth(prev => Math.min(prev, Math.max(280, maxWidth)));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    setLoading(true);
    setContent(null);
    readScriptContent(script.path).then(c => {
      setContent(c);
      setLoading(false);
    }).catch(() => {
      setContent(null);
      setLoading(false);
    });
  }, [script.path]);

  useHotkeys('escape', () => {
    if (isEditingTags) setIsEditingTags(false);
    else onClose();
  });
  useHotkeys('p', () => onPinToggle(), { preventDefault: true });
  useHotkeys('f', () => handleOpenFolder(), { preventDefault: true });

  const copyPath = useCallback(() => {
    navigator.clipboard.writeText(script.path);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [script.path]);

  const handleResizeStart = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = panelWidth;
    let currentWidth = startWidth;
    const parentWidth = panelRef.current?.parentElement?.clientWidth ?? 1200;
    const maxWidth = parentWidth - 400;

    const onMouseMove = (ev: globalThis.MouseEvent) => {
      currentWidth = Math.min(maxWidth, Math.max(280, startWidth + (startX - ev.clientX)));
      setPanelWidth(currentWidth);
    };
    const onMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      localStorage.setItem("ahk_detail_panel_width", String(currentWidth));
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [panelWidth]);

  const handleEdit = () => invoke("edit_script", { path: script.path });
  const handleOpenFolder = () => invoke("open_in_explorer", { path: script.path });

  const name = script.filename.replace(/\.ahk$/i, "");
  const lines = content?.split("\n") ?? [];
  const displayedTags = script.tags.filter(t => !["hub", "fav", "favourites"].includes(t.toLowerCase()));

  const panelContent = (
    <>
      {/* Resize handle */}
      <div
        onMouseDown={handleResizeStart}
        className={`absolute left-0 top-0 bottom-0 w-[5px] cursor-col-resize z-50 group hover:bg-indigo-500/30 transition-colors ${!pinned ? "rounded-l-2xl" : ""}`}
      >
        <div className="absolute left-0 top-0 bottom-0 w-px bg-white/[0.06] group-hover:bg-indigo-500/60 transition-colors" />
      </div>
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 transition-all duration-500 ${
            pendingType ? "bg-yellow-500 animate-pulse shadow-[0_0_10px_rgba(234,179,8,0.6)]"
            : script.is_running ? "bg-green-500 animate-status-glow shadow-[0_0_12px_rgba(34,197,94,0.8)]"
            : "bg-white/10"
          }`} />
          <h2 className="text-lg font-semibold text-white truncate">{name}</h2>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={onPinToggle}
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-all cursor-pointer bg-white/5 text-white/25 hover:text-white/50 hover:bg-white/10"
            title={pinned ? "Unpin" : "Pin"}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill={pinned ? "#888" : "none"} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="17" x2="12" y2="22" />
              <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
            </svg>
          </button>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 transition-all cursor-pointer"
          >
            <CloseIcon size={12} strokeWidth={2.5} className="text-[#666] hover:text-white" />
          </button>
        </div>
      </div>

      {/* Path */}
      <button
        onClick={copyPath}
        className="mx-5 mb-4 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] text-left cursor-pointer hover:bg-white/[0.06] transition-all"
      >
        <span className="text-[14px] font-mono text-white/30 break-all leading-relaxed">
          {copied ? "Copied!" : script.path}
        </span>
      </button>

      {/* Actions */}
      <div className="flex gap-2 px-5 mb-4">
        <button
          onClick={() => !pendingType && onToggle(script)}
          className={`w-[80px] h-[42px] flex items-center justify-center rounded-2xl transition-all cursor-pointer border
            ${pendingType
              ? pendingType === "kill" ? "bg-red-500/10 text-red-500 border-red-500/20 animate-pulse"
                : pendingType === "restart" ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/20 animate-pulse"
                : "bg-green-500/10 text-green-500 border-green-500/20 animate-pulse"
              : script.is_running
                ? 'bg-white/5 text-[#71717a] border-white/5 hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/20'
                : 'bg-white/5 text-[#71717a] border-white/5 hover:bg-green-500/10 hover:text-green-500 hover:border-green-500/20'
            }`}
          title={pendingType ? (pendingType === "restart" ? "Restarting..." : pendingType === "kill" ? "Stopping..." : "Starting...") : (script.is_running ? "Stop" : "Run")}
        >
          {pendingType ? (
            <span className="text-[10px] font-bold">...</span>
          ) : script.is_running ? <CloseIcon /> : <PlayIcon />}
        </button>
        {script.is_running && !pendingType && (
          <button
            onClick={() => onRestart(script)}
            className="w-[80px] h-[42px] flex items-center justify-center rounded-2xl bg-white/5 text-[#71717a] border border-white/5 hover:bg-yellow-500/10 hover:text-yellow-500 hover:border-yellow-500/30 transition-all cursor-pointer"
            title="Restart"
          >
            <RestartIcon />
          </button>
        )}
        {script.is_running && !pendingType && script.has_ui && (
          <button
            onClick={() => onShowUI(script)}
            className="w-[80px] h-[42px] flex items-center justify-center rounded-2xl bg-white/5 text-[#71717a] border border-white/5 hover:bg-indigo-500/10 hover:text-indigo-400 hover:border-indigo-500/30 transition-all cursor-pointer"
            title="Interface"
          >
            <InterfaceIcon />
          </button>
        )}
        <div className="flex-1" />
        <button
          onClick={handleEdit}
          className="w-[80px] h-[42px] flex items-center justify-center rounded-2xl bg-white/5 text-[#71717a] border border-white/5 hover:bg-white/10 hover:text-white/60 transition-all cursor-pointer"
          title="Edit"
        >
          <EditIcon />
        </button>
        <button
          onClick={handleOpenFolder}
          className="w-[80px] h-[42px] flex items-center justify-center rounded-2xl bg-white/5 text-[#71717a] border border-white/5 hover:bg-white/10 hover:text-white/60 transition-all cursor-pointer"
          title="Show in Folder"
        >
          <FolderIcon />
        </button>
      </div>

      {/* Tags */}
      <div className="px-5 mb-1.5">
        <span className="text-[11px] font-bold uppercase tracking-widest text-white/20">Tags</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 px-5 mb-4">
        {displayedTags.map(tag => (
          <div key={tag} className="relative group/tag inline-flex items-center">
            <span className="text-sm font-bold px-4 h-[42px] rounded-2xl bg-white/5 text-tertiary border border-white/5 cursor-default flex items-center justify-center">
              {tag}
            </span>
            <button
              onClick={() => onRemoveTag(script, tag)}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover/tag:opacity-100 transition-all shadow-lg hover:scale-125 active:scale-90 cursor-pointer z-50 border-none"
            >
              <svg width="8" height="2" viewBox="0 0 8 2" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M1 1h6" /></svg>
            </button>
          </div>
        ))}
        <button
          ref={addBtnRef}
          onClick={() => setIsEditingTags(!isEditingTags)}
          className="w-[42px] h-[42px] flex-shrink-0 flex items-center justify-center border border-dashed border-white/10 rounded-2xl transition-all cursor-pointer text-[#666] hover:text-[#aaa] hover:border-white/20 bg-white/5"
        >
          <PlusIcon />
        </button>
        {isEditingTags && (
          <TagPickerPopover
            script={script}
            allUniqueTags={allUniqueTags}
            popoverRef={popoverRef}
            onAdd={(s, tag) => { onAddTag(s, tag); }}
            onClose={() => setIsEditingTags(false)}
            variant="tree"
            anchorRef={addBtnRef}
          />
        )}
      </div>

      {/* Divider */}
      <div className="mx-5 border-t border-white/[0.06] mb-3" />

      {/* Code Viewer */}
      <div className="flex-1 min-h-0 overflow-auto custom-scrollbar px-2">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-white/20 text-sm">Loading...</div>
        ) : content === null ? (
          <div className="flex items-center justify-center h-32 text-red-400/60 text-sm">Failed to read file</div>
        ) : (
          <pre className="text-[12px] leading-[1.6] font-mono text-white/60 select-text">
            <table className="border-collapse">
              <tbody>
                {lines.map((line, i) => (
                  <tr key={i} className="hover:bg-white/[0.03]">
                    <td className="text-right pr-4 text-white/15 select-none align-top w-[1%] whitespace-nowrap">{i + 1}</td>
                    <td className="whitespace-pre">{line || " "}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </pre>
        )}
      </div>
    </>
  );

  if (pinned) {
    return (
      <div ref={panelRef} className={`flex-shrink-0 flex flex-col h-full bg-[var(--bg-primary)] relative ${isResizing ? "select-none" : ""}`} style={{ width: `${panelWidth}px` }}>
        {panelContent}
      </div>
    );
  }

  // Floating mode
  return (
    <div ref={panelRef} className="absolute right-3 top-3 bottom-3 z-[100] flex flex-col bg-[var(--bg-primary)] border border-white/[0.08] rounded-2xl shadow-2xl shadow-black/50 overflow-hidden" style={{ width: `${panelWidth - 12}px` }}>
      {panelContent}
    </div>
  );
}
