import { useState, ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { EditIcon, FolderIcon, OpenWithIcon, CopyIcon, PinIcon, UnpinIcon, PlusIcon, CloseIcon, EyeOffIcon, TagIcon } from "./ui/Icons";

interface ContextMenuState {
  x: number;
  y: number;
  type: "script" | "tag" | "folder" | "general";
  data: any;
}

interface ContextMenuProps {
  contextMenu: ContextMenuState | null;
  onClose: () => void;
  onStartRenameTag: (tag: string) => void;
  onRefresh: () => void;
  onChooseTagIcon?: (tag: string) => void;
  onDeleteTag?: (tag: string) => void;
  onToggleHideFolder?: (path: string) => void;
}

function ContextMenuItem({ label, icon, onClick, danger = false }: { label: string; icon: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`w-full px-4 py-2.5 text-xs font-bold flex items-center space-x-3 transition-all cursor-pointer group ${danger ? "text-red-400 hover:bg-red-500/10" : "text-secondary hover:bg-white/5 hover:text-white"}`}
    >
      <span className="w-[18px] h-[18px] flex items-center justify-center opacity-70 group-hover:opacity-100">{icon}</span>
      <span>{label}</span>
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

export default function ContextMenu({ contextMenu, onClose, onStartRenameTag, onRefresh, onChooseTagIcon, onDeleteTag, onToggleHideFolder }: ContextMenuProps) {
  const { t } = useTranslation();
  const [confirmTag, setConfirmTag] = useState<string | null>(null);

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
        {contextMenu.type === "script" && contextMenu.data && (
          <>
            {contextMenu.data.tags.some((tag: string) => ["hub", "fav", "favourites"].includes(tag.toLowerCase())) ? (
              <ContextMenuItem
                label={t("context.unpin")}
                icon={<UnpinIcon />}
                onClick={async () => {
                  const tagToRemove = contextMenu.data.tags.find((tag: string) => ["hub", "fav", "favourites"].includes(tag.toLowerCase()));
                  if (tagToRemove) await invoke("remove_script_tag", { id: contextMenu.data.id, tag: tagToRemove });
                  onClose();
                }}
              />
            ) : (
              <ContextMenuItem
                label={t("context.pin")}
                icon={<PinIcon />}
                onClick={async () => {
                  await invoke("add_script_tag", { id: contextMenu.data.id, tag: "hub" });
                  onClose();
                }}
              />
            )}
            <div className="h-[1px] bg-white/5 my-1" />
            <ContextMenuItem label={t("context.edit")} icon={<EditIcon />} onClick={() => { invoke("edit_script", { path: contextMenu.data.path }); onClose(); }} />
            <ContextMenuItem label={t("context.show_in_folder")} icon={<FolderIcon />} onClick={() => { invoke("open_in_explorer", { path: contextMenu.data.path }); onClose(); }} />
            <ContextMenuItem label={t("context.open_with")} icon={<OpenWithIcon />} onClick={() => { invoke("open_with", { path: contextMenu.data.path }); onClose(); }} />
            <div className="h-[1px] bg-white/5 my-1" />
            <ContextMenuItem label={t("context.copy_path")} icon={<CopyIcon size={18} />} onClick={() => { navigator.clipboard.writeText(contextMenu.data.path); onClose(); }} />
          </>
        )}

        {contextMenu.type === "tag" && (
          <>
            <ContextMenuItem
              label={t("context.choose_icon", "Choose icon")}
              icon={<TagIcon />}
              onClick={() => { onChooseTagIcon?.(contextMenu.data); onClose(); }}
            />
            <ContextMenuItem
              label={t("context.rename")}
              icon={<EditIcon />}
              onClick={() => { onStartRenameTag(contextMenu.data); onClose(); }}
            />
            <ContextMenuItem
              label={t("context.delete_tag")}
              icon={<CloseIcon size={18} />}
              danger
              onClick={() => setConfirmTag(contextMenu.data)}
            />
          </>
        )}

        {contextMenu.type === "folder" && (
          <>
            <ContextMenuItem label={t("context.show_in_folder")} icon={<FolderIcon />} onClick={() => { invoke("open_in_explorer", { path: contextMenu.data.fullName }); onClose(); }} />
            <div className="h-[1px] bg-white/5 my-1" />
            <ContextMenuItem label={t("context.expand_all")} icon={<PlusIcon size={18} />} onClick={() => { contextMenu.data.onExpandAll(); onClose(); }} />
            <ContextMenuItem
              label={contextMenu.data.is_hidden ? t("context.show_hidden") : t("context.hide_folder")}
              icon={<EyeOffIcon />}
              onClick={async () => {
                await invoke("toggle_hide_folder", { path: contextMenu.data.fullName });
                onClose();
                if (onToggleHideFolder) onToggleHideFolder(contextMenu.data.fullName);
                else onRefresh();
              }}
            />
            <div className="h-[1px] bg-white/5 my-1" />
            <ContextMenuItem label={t("context.copy_path")} icon={<CopyIcon size={18} />} onClick={() => { navigator.clipboard.writeText(contextMenu.data.fullName); onClose(); }} />
          </>
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
