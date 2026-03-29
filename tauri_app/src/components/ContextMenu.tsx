import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";

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

function ContextMenuItem({ label, icon, onClick, danger = false }: { label: string; icon: string; onClick: () => void; danger?: boolean }) {
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

export default function ContextMenu({ contextMenu, onClose, onStartRenameTag, onRefresh }: ContextMenuProps) {
  const { t } = useTranslation();

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
                icon="✖"
                onClick={async () => {
                  const tagToRemove = contextMenu.data.tags.find((tag: string) => ["hub", "fav", "favourites"].includes(tag.toLowerCase()));
                  if (tagToRemove) await invoke("remove_script_tag", { path: contextMenu.data.path, tag: tagToRemove });
                  onClose();
                }}
              />
            ) : (
              <ContextMenuItem
                label={t("context.pin")}
                icon="📌"
                onClick={async () => {
                  await invoke("add_script_tag", { path: contextMenu.data.path, tag: "hub" });
                  onClose();
                }}
              />
            )}
            <div className="h-[1px] bg-white/5 my-1" />
            <ContextMenuItem label={t("context.edit")} icon="📝" onClick={() => { invoke("edit_script", { path: contextMenu.data.path }); onClose(); }} />
            <ContextMenuItem label={t("context.show_in_folder")} icon="📂" onClick={() => { invoke("open_in_explorer", { path: contextMenu.data.path }); onClose(); }} />
            <ContextMenuItem label={t("context.open_with")} icon="🪄" onClick={() => { invoke("open_with", { path: contextMenu.data.path }); onClose(); }} />
            <div className="h-[1px] bg-white/5 my-1" />
            <ContextMenuItem label={t("context.copy_path")} icon="🔗" onClick={() => { navigator.clipboard.writeText(contextMenu.data.path); onClose(); }} />
          </>
        )}

        {contextMenu.type === "tag" && (
          <>
            <ContextMenuItem
              label={t("context.rename")}
              icon="✏️"
              onClick={() => { onStartRenameTag(contextMenu.data); onClose(); }}
            />
            <ContextMenuItem
              label={t("context.delete_tag")}
              icon="🗑️"
              danger
              onClick={async () => {
                if (confirm(t("context.delete_tag_confirm", { tag: contextMenu.data }))) {
                  await invoke("delete_tag", { tag: contextMenu.data });
                  onClose();
                  onRefresh();
                }
              }}
            />
          </>
        )}

        {contextMenu.type === "folder" && (
          <>
            <ContextMenuItem label={t("context.show_in_folder")} icon="📂" onClick={() => { invoke("open_in_explorer", { path: contextMenu.data.fullName }); onClose(); }} />
            <div className="h-[1px] bg-white/5 my-1" />
            <ContextMenuItem label={t("context.expand_all")} icon="➕" onClick={() => { contextMenu.data.onExpandAll(); onClose(); }} />
            <ContextMenuItem
              label={contextMenu.data.is_hidden ? t("context.show_hidden") : t("context.hide_folder")}
              icon={contextMenu.data.is_hidden ? "👁️" : "👁️‍🗨️"}
              onClick={async () => {
                await invoke("toggle_hide_folder", { path: contextMenu.data.fullName });
                onClose();
                onRefresh();
              }}
            />
            <div className="h-[1px] bg-white/5 my-1" />
            <ContextMenuItem label={t("context.copy_path")} icon="🔗" onClick={() => { navigator.clipboard.writeText(contextMenu.data.fullName); onClose(); }} />
          </>
        )}
      </div>
    </>
  );
}
