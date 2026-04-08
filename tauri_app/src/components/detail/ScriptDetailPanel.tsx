import { useState, useEffect, useCallback, useRef } from "react";
import { Script } from "../../api";
import { invoke } from "@tauri-apps/api/core";
import { useHotkeys } from "react-hotkeys-hook";
import { useTranslation } from "react-i18next";
import { formatDate } from "../../utils/formatDate";
import TagPickerPopover from "../tags/TagPickerPopover";
import { CloseIcon, PlayIcon, RestartIcon, InterfaceIcon, PlusIcon, EditIcon, FolderIcon, OpenWithIcon, MinusIcon, PinIcon, CopyIcon, StarIcon } from "../ui/Icons";
import Tooltip from "../ui/Tooltip";
import TruncatedTooltip from "../ui/TruncatedTooltip";
import { formatSize } from "../../utils/formatSize";
import { useScriptContent } from "../../hooks/useScriptContent";
import { usePanelResize } from "../../hooks/usePanelResize";

function MetaRow({ label, value, mono, copiedLabel, copyLabel }: { label: string; value: string; mono?: boolean; copiedLabel?: string; copyLabel?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div
      className="flex items-center gap-3 group/meta cursor-pointer rounded-lg px-2 py-1 -mx-2 hover:bg-[var(--bg-tertiary)] transition-colors"
      onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
    >
      <span className="text-[11px] font-bold text-white/15 uppercase tracking-wider w-15 flex-shrink-0">{label}</span>
      <span className={`text-[12px] text-white/30 truncate flex-1 ${mono ? "font-mono" : ""}`}>{value}</span>
      <span className={`text-[10px] text-white/30 transition-opacity ${copied ? "opacity-100" : "opacity-0 group-hover/meta:opacity-50"}`}>
        {copied ? (copiedLabel || "copied") : (copyLabel || "copy")}
      </span>
    </div>
  );
}

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
  const { t } = useTranslation();
  const { html: highlightedLinesFromHook, source: content, isLoading: loading } = useScriptContent(script.path);
  const highlightedLines: string[] = (highlightedLinesFromHook as any) || [];
  const [copied, setCopied] = useState(false);
  const [scriptMeta, setScriptMeta] = useState<{ hash: string; created: string; modified: string; last_run: string } | null>(null);
  const [isEditingTags, setIsEditingTags] = useState(false);
  const { width: panelWidth, setWidth: setPanelWidth, handleProps: resizeHandleProps, isResizing } = usePanelResize("ahk_detail_panel_width", 420, { min: 280 });
  const panelRef = useRef<HTMLDivElement>(null);
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Clamp panel width when available space changes (window resize or sidebar resize)
  useEffect(() => {
    const parent = panelRef.current?.parentElement;
    if (!parent) return;
    const clamp = () => {
      const maxWidth = parent.clientWidth - 450;
      setPanelWidth(prev => Math.min(prev, Math.max(280, maxWidth)));
    };
    const observer = new ResizeObserver(clamp);
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setScriptMeta(null);
    invoke<{ hash: string; created: string; modified: string; last_run: string }>("get_script_meta", { path: script.path })
      .then(setScriptMeta).catch(() => { });
  }, [script.path]);

  // Refresh meta when running status changes (last_run updated in DB)
  useEffect(() => {
    invoke<{ hash: string; created: string; modified: string; last_run: string }>("get_script_meta", { path: script.path })
      .then(setScriptMeta).catch(() => { });
  }, [script.is_running]);

  // Esc is handled centrally in ScriptTree with priority:
  // cheatsheet → tagpicker → search → detail panel → vim mode
  useHotkeys('p', () => onPinToggle(), { preventDefault: true });

  const copyPath = useCallback(() => {
    navigator.clipboard.writeText(script.path);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [script.path]);

  const handleEdit = () => invoke("edit_script", { path: script.path });
  const handleOpenFolder = () => invoke("open_in_explorer", { path: script.path });
  const handleOpenWith = () => invoke("open_with", { path: script.path });

  const name = script.filename.replace(/\.ahk$/i, "");
  const isHub = script.is_hub;
  const displayedTags = script.tags;

  const panelContent = (
    <>
      {/* Resize handle */}
      <div
        {...resizeHandleProps}
        className={`absolute left-0 top-0 bottom-0 w-[5px] cursor-col-resize z-50 group hover:bg-indigo-500/30 transition-colors ${!pinned ? "rounded-l-2xl" : ""}`}
      >
        <div className="absolute left-0 top-0 bottom-0 w-px bg-white/[0.06] group-hover:bg-indigo-500/60 transition-colors" />
      </div>
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 transition-all duration-500 ${pendingType ? (pendingType === "kill" ? "bg-red-500 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.6)]" : "bg-yellow-500 animate-pulse shadow-[0_0_10px_rgba(234,179,8,0.6)]")
            : script.is_running ? "bg-green-500 animate-status-glow shadow-[0_0_12px_rgba(34,197,94,0.8)]"
              : "bg-white/10"
            }`} />
          <TruncatedTooltip text={name}>
            <h2 className="text-lg font-semibold text-white truncate">{name}</h2>
          </TruncatedTooltip>
          <Tooltip text={isHub ? t("tooltips.remove_from_hub") : t("tooltips.add_to_hub")}>
            <button
              onClick={async () => {
                try { await invoke("set_script_hub", { id: script.id, hub: !isHub }); }
                catch (err) { console.error("set_script_hub failed:", err); }
              }}
              className={`w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg transition-all cursor-pointer ${isHub ? 'text-white/60 hover:text-white/90' : 'text-white/25 hover:text-white/50'}`}
            >
              <StarIcon size={15} weight={isHub ? "fill" : "bold"} />
            </button>
          </Tooltip>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Tooltip text={pinned ? t("tooltips.unpin") : t("tooltips.pin")} shortcut="p">
            <button
              onClick={onPinToggle}
              className="w-7 h-7 flex items-center justify-center rounded-lg transition-all cursor-pointer bg-[var(--bg-tertiary)] text-white/25 hover:text-white/50 hover:bg-white/10"
            >
              <PinIcon size={14} fill={pinned ? "#888" : "none"} />
            </button>
          </Tooltip>
          <Tooltip text={t("tooltips.close")} shortcut="Esc">
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-[var(--bg-tertiary)] text-[#666] hover:bg-white/10 hover:text-white/60 transition-all cursor-pointer"
            >
              <CloseIcon className="pointer-events-none" />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Path */}
      <Tooltip text={t("context.copy_path")}>
        <button
          onClick={copyPath}
          className="group/path mx-5 mb-4 px-3 py-1.5 rounded-lg bg-[var(--bg-tertiary)] border border-white/[0.06] text-left cursor-pointer hover:bg-[var(--bg-tertiary-hover)] transition-all relative"
        >
          <span className={`text-[14px] font-mono text-white/30 leading-relaxed transition-opacity ${copied ? 'opacity-0' : ''}`}>
            {script.path.split(/(?<=[\\/])/).map((seg, i) => <span key={i} style={{ display: 'inline-block' }}>{seg}</span>)}
          </span>
          <span className={`absolute right-2 top-1/2 -translate-y-1/2 transition-opacity ${copied ? 'opacity-0' : 'opacity-0 group-hover/path:opacity-50'}`}>
            <CopyIcon className="text-white" />
          </span>
          {copied && (
            <span className="absolute inset-0 flex items-center justify-center text-[13px] font-bold text-white/50">
              {t("detail.copied")}
            </span>
          )}
        </button>
      </Tooltip>

      {/* Actions */}
      <div className="flex gap-2 px-5 mb-4">
        {script.is_running && !pendingType && script.has_ui && (
          <Tooltip text={t("tooltips.interface")}>
            <button
              onClick={() => onShowUI(script)}
              className="w-[80px] h-[42px] flex items-center justify-center rounded-2xl bg-[var(--bg-tertiary)] text-[#71717a] border border-white/5 hover:bg-indigo-500/10 hover:text-indigo-400 hover:border-indigo-500/30 transition-all cursor-pointer"
            >
              <InterfaceIcon size={22} />
            </button>
          </Tooltip>
        )}
        {script.is_running && !pendingType && (
          <Tooltip text={t("tooltips.restart")}>
            <button
              onClick={() => onRestart(script)}
              className="w-[80px] h-[42px] flex items-center justify-center rounded-2xl bg-[var(--bg-tertiary)] text-[#71717a] border border-white/5 hover:bg-yellow-500/10 hover:text-yellow-500 hover:border-yellow-500/30 transition-all cursor-pointer"
            >
              <RestartIcon size={22} />
            </button>
          </Tooltip>
        )}
        <Tooltip text={pendingType ? (pendingType === "restart" ? t("tooltips.restarting") : pendingType === "kill" ? t("tooltips.stopping") : t("tooltips.starting")) : (script.is_running ? t("tooltips.stop") : t("tooltips.run"))}>
          <button
            onClick={() => !pendingType && onToggle(script)}
            className={`w-[80px] h-[42px] flex items-center justify-center rounded-2xl transition-all cursor-pointer border
              ${pendingType
                ? pendingType === "kill" ? "bg-red-500/10 text-red-500 border-red-500/20 animate-pulse"
                  : pendingType === "restart" ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/20 animate-pulse"
                    : "bg-green-500/10 text-green-500 border-green-500/20 animate-pulse"
                : script.is_running
                  ? 'bg-[var(--bg-tertiary)] text-[#71717a] border-white/5 hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/20'
                  : 'bg-[var(--bg-tertiary)] text-[#71717a] border-white/5 hover:bg-green-500/10 hover:text-green-500 hover:border-green-500/20'
              }`}
          >
            {pendingType ? (
              <span className="text-[10px] font-bold">...</span>
            ) : script.is_running ? <CloseIcon size={22} /> : <PlayIcon size={22} />}
          </button>
        </Tooltip>
        <div className="flex-1" />
        <Tooltip text={t("tooltips.show_in_folder")}>
          <button
            onClick={handleOpenFolder}
            className="w-[80px] h-[42px] flex items-center justify-center rounded-2xl bg-[var(--bg-tertiary)] text-[#71717a] border border-white/5 hover:bg-white/10 hover:text-white/60 transition-all cursor-pointer"
          >
            <FolderIcon size={22} />
          </button>
        </Tooltip>
        <Tooltip text={t("tooltips.edit")}>
          <button
            onClick={handleEdit}
            className="w-[80px] h-[42px] flex items-center justify-center rounded-2xl bg-[var(--bg-tertiary)] text-[#71717a] border border-white/5 hover:bg-white/10 hover:text-white/60 transition-all cursor-pointer"
          >
            <EditIcon size={22} />
          </button>
        </Tooltip>
        <Tooltip text={t("tooltips.open_with")}>
          <button
            onClick={handleOpenWith}
            className="w-[80px] h-[42px] flex items-center justify-center rounded-2xl bg-[var(--bg-tertiary)] text-[#71717a] border border-white/5 hover:bg-white/10 hover:text-white/60 transition-all cursor-pointer"
          >
            <OpenWithIcon size={22} />
          </button>
        </Tooltip>
      </div>

      {/* Scrollable area: tags + meta + code */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
      {/* Tags */}
      <div className="px-5 mb-1.5">
        <span className="text-[11px] font-bold uppercase tracking-widest text-white/20">{t("detail.tags")}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 px-5 mb-4">
        {displayedTags.map(tag => (
          <div key={tag} className="relative group/tag inline-flex items-center">
            <span className="text-sm font-bold px-4 h-[42px] rounded-2xl bg-[var(--bg-tertiary)] text-tertiary border border-white/5 cursor-default flex items-center justify-center">
              {tag}
            </span>
            <Tooltip text={t("context.delete_tag_simple", { tag })}>
              <button
                onClick={() => onRemoveTag(script, tag)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover/tag:opacity-100 transition-all shadow-lg hover:scale-125 active:scale-90 cursor-pointer z-50 border-none"
              >
                <MinusIcon />
              </button>
            </Tooltip>
          </div>
        ))}
        <Tooltip text={t("tooltips.add_tag")}>
          <button
            ref={addBtnRef}
            onClick={() => setIsEditingTags(!isEditingTags)}
            className="w-[42px] h-[42px] flex-shrink-0 flex items-center justify-center border border-dashed border-white/10 rounded-2xl transition-all cursor-pointer text-[#666] hover:text-[#aaa] hover:border-white/20 bg-[var(--bg-tertiary)]"
          >
            <PlusIcon />
          </button>
        </Tooltip>
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

      {/* Meta info */}
      <div className="px-5 mb-1.5">
        <span className="text-[11px] font-bold uppercase tracking-widest text-white/20">{t("detail.meta")}</span>
      </div>
      <div className="px-5 mb-4 space-y-1">
        <MetaRow label="ID" value={script.id} mono copiedLabel={t("detail.copied")} copyLabel={t("detail.copy")} />
        <MetaRow label={t("detail.size")} value={formatSize(script.size)} copiedLabel={t("detail.copied")} copyLabel={t("detail.copy")} />
        <MetaRow label="Hash" value={scriptMeta?.hash || "..."} mono copiedLabel={t("detail.copied")} copyLabel={t("detail.copy")} />
        <MetaRow label={t("detail.created")} value={formatDate(scriptMeta?.created || "")} copiedLabel={t("detail.copied")} copyLabel={t("detail.copy")} />
        <MetaRow label={t("detail.modified")} value={formatDate(scriptMeta?.modified || "")} copiedLabel={t("detail.copied")} copyLabel={t("detail.copy")} />
        {scriptMeta?.last_run && <MetaRow label={t("detail.last_run")} value={formatDate(scriptMeta.last_run)} copiedLabel={t("detail.copied")} copyLabel={t("detail.copy")} />}
      </div>

      {/* Divider */}
      <div className="mx-5 border-t border-white/[0.06] mb-3" />

      {/* Code Viewer */}
      <div className="px-2">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-white/20 text-sm">{t("detail.loading")}</div>
        ) : content === null ? (
          <div className="flex items-center justify-center h-32 text-red-400/60 text-sm">{t("detail.read_error")}</div>
        ) : (
          <pre className="text-[12px] leading-[1.6] font-mono text-white/60 select-text">
            <table className="border-collapse">
              <tbody>
                {highlightedLines.map((line, i) => (
                  <tr key={i} className="hover:bg-[var(--bg-tertiary)]">
                    <td className="text-right pr-4 text-white/15 select-none align-top w-[1%] whitespace-nowrap">{i + 1}</td>
                    <td className="whitespace-pre" dangerouslySetInnerHTML={{ __html: line || " " }} />
                  </tr>
                ))}
              </tbody>
            </table>
          </pre>
        )}
      </div>
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
    <div ref={panelRef} className="absolute right-3 top-3 bottom-3 z-[600] flex flex-col bg-black/20 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden" style={{ width: `${panelWidth - 12}px` }}>
      {panelContent}
    </div>
  );
}
