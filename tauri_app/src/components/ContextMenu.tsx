import { useState, ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { EditIcon, FolderIcon, OpenWithIcon, CopyIcon, PinIcon, UnpinIcon, PlusIcon, CloseIcon } from "./ui/Icons";

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
      <span className="w-4 h-4 flex items-center justify-center opacity-70 group-hover:opacity-100">{icon}</span>
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
        className="fixed z-[100002] bg-[#1a1a1c]/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.6)] p-6 w-[300px]"
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

export default function ContextMenu({ contextMenu, onClose, onStartRenameTag, onRefresh }: ContextMenuProps) {
  const { t } = useTranslation();
  const [confirmTag, setConfirmTag] = useState<string | null>(null);

  if (!contextMenu) return null;

  return (
    <>
      <div className="fixed inset-0 z-[99999]" onMouseDown={onClose} />
      <div
        className="fixed z-[100000] min-w-[200px] bg-[#1a1a1c]/80 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] py-2 animate-scale-in overflow-hidden"
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
                icon={<UnpinIcon size={14} />}
                onClick={async () => {
                  const tagToRemove = contextMenu.data.tags.find((tag: string) => ["hub", "fav", "favourites"].includes(tag.toLowerCase()));
                  if (tagToRemove) await invoke("remove_script_tag", { path: contextMenu.data.path, tag: tagToRemove });
                  onClose();
                }}
              />
            ) : (
              <ContextMenuItem
                label={t("context.pin")}
                icon={<PinIcon size={14} />}
                onClick={async () => {
                  await invoke("add_script_tag", { path: contextMenu.data.path, tag: "hub" });
                  onClose();
                }}
              />
            )}
            <div className="h-[1px] bg-white/5 my-1" />
            <ContextMenuItem label={t("context.edit")} icon={<EditIcon size={14} />} onClick={() => { invoke("edit_script", { path: contextMenu.data.path }); onClose(); }} />
            <ContextMenuItem label={t("context.show_in_folder")} icon={<FolderIcon size={14} />} onClick={() => { invoke("open_in_explorer", { path: contextMenu.data.path }); onClose(); }} />
            <ContextMenuItem label={t("context.open_with")} icon={<OpenWithIcon size={14} />} onClick={() => { invoke("open_with", { path: contextMenu.data.path }); onClose(); }} />
            <div className="h-[1px] bg-white/5 my-1" />
            <ContextMenuItem label={t("context.copy_path")} icon={<CopyIcon size={14} />} onClick={() => { navigator.clipboard.writeText(contextMenu.data.path); onClose(); }} />
          </>
        )}

        {contextMenu.type === "tag" && (
          <>
            <ContextMenuItem
              label={t("context.rename")}
              icon={<EditIcon size={14} />}
              onClick={() => { onStartRenameTag(contextMenu.data); onClose(); }}
            />
            <ContextMenuItem
              label={t("context.delete_tag")}
              icon={<CloseIcon size={14} />}
              danger
              onClick={() => setConfirmTag(contextMenu.data)}
            />
          </>
        )}

        {contextMenu.type === "folder" && (
          <>
            <ContextMenuItem label={t("context.show_in_folder")} icon={<FolderIcon size={14} />} onClick={() => { invoke("open_in_explorer", { path: contextMenu.data.fullName }); onClose(); }} />
            <div className="h-[1px] bg-white/5 my-1" />
            <ContextMenuItem label={t("context.expand_all")} icon={<PlusIcon size={12} strokeWidth={3} />} onClick={() => { contextMenu.data.onExpandAll(); onClose(); }} />
            <ContextMenuItem
              label={contextMenu.data.is_hidden ? t("context.show_hidden") : t("context.hide_folder")}
              icon={<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>}
              onClick={async () => {
                await invoke("toggle_hide_folder", { path: contextMenu.data.fullName });
                onClose();
                onRefresh();
              }}
            />
            <div className="h-[1px] bg-white/5 my-1" />
            <ContextMenuItem label={t("context.copy_path")} icon={<CopyIcon size={14} />} onClick={() => { navigator.clipboard.writeText(contextMenu.data.fullName); onClose(); }} />
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
            onRefresh();
          }}
          onCancel={() => setConfirmTag(null)}
        />
      )}
    </>
  );
}
