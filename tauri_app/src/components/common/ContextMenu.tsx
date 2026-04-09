import { useState, useEffect, useMemo, ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { EditIcon, FolderIcon, OpenWithIcon, CopyIcon, PlusIcon, CloseIcon, EyeOffIcon, TagIcon, StarIcon, BlockIcon } from "../ui/Icons";
import { useVimEnabled } from "../../hooks/useVimEnabled";
import { useTreeStore } from "../../store/useTreeStore";
import { appToast } from "../ui/AppToast";

interface ContextMenuState {
  x: number;
  y: number;
  type: "script" | "tag" | "folder" | "general";
  data: any;
  fromKeyboard?: boolean;
}

interface ContextMenuProps {
  contextMenu: ContextMenuState | null;
  onClose: () => void;
  onStartRenameTag: (tag: string) => void;
  onRefresh: () => void;
  onChooseTagIcon?: (tag: string) => void;
  onDeleteTag?: (tag: string) => void;
  onToggleHideFolder?: (path: string) => void;
  onBlacklistFolder?: (path: string) => void;
}

type Action = {
  id: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  shortcut?: string;
};
type Item = Action | "separator";

function ContextMenuItem({ action, focused }: { action: Action; focused: boolean }) {
  const vimEnabled = useVimEnabled();
  const showShortcut = vimEnabled && !!action.shortcut;
  const { label, icon, onClick, danger = false, disabled = false, shortcut } = action;
  return (
    <button
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (disabled) return;
        onClick();
      }}
      className={`w-full px-4 py-2.5 text-xs font-bold flex items-center space-x-3 transition-all group ${disabled ? "text-white/20 cursor-not-allowed" : danger ? `text-red-400 ${focused ? "bg-red-500/10" : "hover:bg-red-500/10"} cursor-pointer` : `text-secondary ${focused ? "bg-white/5 text-white" : "hover:bg-white/5 hover:text-white"} cursor-pointer`}`}
    >
      <span className={`w-[18px] h-[18px] flex items-center justify-center ${disabled ? "opacity-30" : "opacity-70 group-hover:opacity-100"}`}>{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {showShortcut && <kbd className="px-1.5 py-0.5 rounded-md bg-white/10 border border-white/15 text-[14px] font-bold text-white/60 leading-none">{shortcut}</kbd>}
    </button>
  );
}

function ConfirmDialog({ tag, onConfirm, onCancel }: { tag: string; onConfirm: () => void; onCancel: () => void }) {
  const { t } = useTranslation();
  return (
    <>
      <div className="fixed inset-0 z-[100001] bg-black/40 backdrop-blur-sm" onMouseDown={onCancel} />
      <div
        className="fixed z-[100002] bg-black/30 backdrop-blur-lg border border-white/15 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.6)] p-6 w-[300px]"
        style={{ left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-bold text-white">{t("context.delete_tag")}</span>
            <span className="text-xs text-tertiary leading-relaxed">
              {t("context.delete_tag_confirm", { tag })}
            </span>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-xs font-bold text-tertiary hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-all cursor-pointer border border-white/5"
            >
              {t("context.cancel", "Cancel")}
            </button>
            <button
              onClick={onConfirm}
              className="px-4 py-2 text-xs font-bold text-red-400 hover:text-white bg-red-500/10 hover:bg-red-500 rounded-xl transition-all cursor-pointer border border-red-500/20 hover:border-red-500"
            >
              {t("context.delete", "Delete")}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default function ContextMenu({ contextMenu, onClose, onStartRenameTag, onRefresh, onChooseTagIcon, onDeleteTag, onToggleHideFolder, onBlacklistFolder }: ContextMenuProps) {
  const { t } = useTranslation();
  const [confirmTag, setConfirmTag] = useState<string | null>(null);
  const [focusIdx, setFocusIdx] = useState(-1);
  const setModalOpen = useTreeStore(s => s.setModalOpen);

  // Build a flat actions list per context type so keyboard navigation can
  // operate on a single array (separators are kept for visual rhythm but
  // skipped during j/k stepping).
  const items = useMemo<Item[]>(() => {
    if (!contextMenu) return [];
    if (contextMenu.type === "script" && contextMenu.data) {
      const d = contextMenu.data;
      return [
        { id: "copy", shortcut: "c", label: t("context.copy_path"), icon: <CopyIcon size={18} />, onClick: () => { navigator.clipboard.writeText(d.path); appToast.success(t("toast.path_copied", "Путь скопирован")); onClose(); } },
        { id: "show", shortcut: "f", label: t("context.show_in_folder"), icon: <FolderIcon />, onClick: () => { invoke("open_in_explorer", { path: d.path }); onClose(); } },
        "separator",
        { id: "edit", shortcut: "e", label: t("context.edit"), icon: <EditIcon />, onClick: () => { invoke("edit_script", { path: d.path }); onClose(); } },
        { id: "open_with", shortcut: "o", label: t("context.open_with"), icon: <OpenWithIcon />, onClick: () => { invoke("open_with", { path: d.path }); onClose(); } },
        "separator",
        d.is_hub
          ? { id: "hub_remove", shortcut: "m", label: t("context.remove_from_hub", "Удалить из хаба"), icon: <StarIcon size={16} weight="fill" />, onClick: async () => { window.dispatchEvent(new CustomEvent('ahk-hub-changed-local', { detail: { id: d.id, hub: false } })); await invoke("set_script_hub", { id: d.id, hub: false }); appToast.success(t("toast.removed_from_hub", "Удалено из хаба")); onClose(); } }
          : { id: "hub_add", shortcut: "m", label: t("context.add_to_hub", "Добавить в хаб"), icon: <StarIcon size={16} weight="bold" />, onClick: async () => { window.dispatchEvent(new CustomEvent('ahk-hub-changed-local', { detail: { id: d.id, hub: true } })); await invoke("set_script_hub", { id: d.id, hub: true }); appToast.success(t("toast.added_to_hub", "Добавлено в хаб")); onClose(); } },
      ];
    }
    if (contextMenu.type === "tag") {
      return [
        { id: "icon", label: t("context.choose_icon", "Choose icon"), icon: <TagIcon />, onClick: () => { onChooseTagIcon?.(contextMenu.data); onClose(); } },
        { id: "rename", label: t("context.rename"), icon: <EditIcon />, onClick: () => { onStartRenameTag(contextMenu.data); onClose(); } },
        { id: "delete_tag", label: t("context.delete_tag"), icon: <CloseIcon size={18} />, danger: true, onClick: () => setConfirmTag(contextMenu.data) },
      ];
    }
    if (contextMenu.type === "folder") {
      const d = contextMenu.data;
      return [
        { id: "copy", shortcut: "c", label: t("context.copy_path"), icon: <CopyIcon size={18} />, onClick: () => { navigator.clipboard.writeText(d.fullName); onClose(); } },
        { id: "show", shortcut: "f", label: t("context.show_in_folder"), icon: <FolderIcon />, onClick: () => { invoke("open_in_explorer", { path: d.fullName }); onClose(); } },
        "separator",
        { id: "expand", label: t("context.expand_all"), icon: <PlusIcon size={18} />, disabled: !!d.isAllExpanded || !d.onExpandAll, onClick: () => { d.onExpandAll?.(); onClose(); } },
        { id: "hide", label: d.is_hidden ? t("context.show_hidden") : t("context.hide_folder"), icon: <EyeOffIcon />, onClick: async () => {
          await invoke("toggle_hide_folder", { path: d.fullName });
          onClose();
          if (onToggleHideFolder) onToggleHideFolder(d.fullName);
          else onRefresh();
        } },
        { id: "blacklist", label: t("context.blacklist_folder", "Exclude from scan"), icon: <BlockIcon />, danger: true, onClick: () => { onBlacklistFolder?.(d.fullName); onClose(); } },
      ];
    }
    return [];
  }, [contextMenu, onChooseTagIcon, onStartRenameTag, onClose, onToggleHideFolder, onBlacklistFolder, onRefresh, t]);

  // Indices of items that are actually navigable (skip separators + disabled).
  const navIdx = useMemo<number[]>(() =>
    items.flatMap((it, i) => (it !== "separator" && !(it as Action).disabled ? [i] : [])),
    [items]
  );

  // Reset focus to first navigable on every (re)open. Also block tree
  // hotkeys via the global modalOpen flag while the menu is alive.
  useEffect(() => {
    if (!contextMenu) return;
    setFocusIdx(contextMenu.fromKeyboard ? (navIdx[0] ?? -1) : -1);
    setModalOpen(true);
    return () => setModalOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextMenu]);

  // j/k/↑/↓/Enter/Esc — operate over `navIdx`. Capture phase so this wins
  // against tree-level handlers; the modalOpen flag also gates them.
  useEffect(() => {
    if (!contextMenu) return;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key, c = e.code;
      const isDown = k === "ArrowDown" || c === "KeyJ";
      const isUp = k === "ArrowUp" || c === "KeyK";
      const isAccept = k === "Enter" || k === " ";
      const isClose = k === "Escape";
      // Letter-shortcut: пользователь видит подсказку справа от пункта
      // (например "f" у "Show in folder") и жмёт её сразу, не наводясь
      // через j/k. Работает только если ровно одна буква без модификаторов.
      if (!isDown && !isUp && !isAccept && !isClose) {
        if (e.ctrlKey || e.altKey || e.metaKey) return;
        // e.code === "KeyM" → "m" — независимо от ru/en раскладки
        const codeLetter = c.startsWith("Key") ? c.slice(3).toLowerCase() : null;
        if (!codeLetter) return;
        const match = items.find(it => it !== "separator" && (it as Action).shortcut === codeLetter) as Action | undefined;
        if (!match || match.disabled) return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        match.onClick();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (isClose) { onClose(); return; }
      if (navIdx.length === 0) return;
      const cur = navIdx.indexOf(focusIdx);
      if (isDown) setFocusIdx(cur < 0 ? navIdx[0] : navIdx[(cur + 1) % navIdx.length]);
      else if (isUp) setFocusIdx(cur < 0 ? navIdx[navIdx.length - 1] : navIdx[(cur - 1 + navIdx.length) % navIdx.length]);
      else if (isAccept) {
        if (focusIdx < 0) return;
        const it = items[focusIdx];
        if (it && it !== "separator") (it as Action).onClick();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [contextMenu, focusIdx, navIdx, items, onClose]);

  if (!contextMenu) return null;

  return (
    <>
      <div className="fixed inset-0 z-[99999]" onMouseDown={onClose} />
      <div
        className="fixed z-[100000] min-w-[200px] bg-black/20 backdrop-blur-md border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] py-2 animate-scale-in overflow-hidden"
        style={{
          left: Math.min(contextMenu.x + 15, window.innerWidth - 220),
          top: Math.min(contextMenu.y + 15, window.innerHeight - 300),
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {items.map((it, i) => it === "separator"
          ? <div key={`sep-${i}`} className="h-[1px] bg-white/5 my-1" />
          : <ContextMenuItem key={(it as Action).id} action={it as Action} focused={i === focusIdx} />
        )}
      </div>

      {confirmTag && (
        <ConfirmDialog
          tag={confirmTag}
          onConfirm={async () => {
            await invoke("delete_tag", { tag: confirmTag });
            setConfirmTag(null);
            onClose();
            if (onDeleteTag) onDeleteTag(confirmTag);
            else onRefresh();
          }}
          onCancel={() => setConfirmTag(null)}
        />
      )}
    </>
  );
}
