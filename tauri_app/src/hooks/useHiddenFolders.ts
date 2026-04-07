import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";

export function useHiddenFolders(onChanged: () => void) {
  const { t } = useTranslation();
  const [hiddenFolders, setHiddenFolders] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    const list = await invoke<string[]>("get_hidden_folders");
    setHiddenFolders(list);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const unhideFolder = async (path: string) => {
    // toggle_hide_folder is an idempotent toggle — calling it on a path that
    // is currently hidden will unhide it.
    await invoke("toggle_hide_folder", { path });
    await refresh();
    onChanged();
  };

  const handleAddHiddenFolder = async () => {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: t("settings.select_folder"),
      });
      if (selected && typeof selected === "string") {
        // toggle_hide_folder is idempotent: only call when not already hidden,
        // otherwise it would unhide the freshly-added entry.
        if (!hiddenFolders.includes(selected)) {
          await invoke("toggle_hide_folder", { path: selected });
          await refresh();
          onChanged();
        }
      }
    } catch (err) {
      console.error("Failed to open dialog:", err);
    }
  };

  return { hiddenFolders, unhideFolder, refreshHiddenFolders: refresh, handleAddHiddenFolder };
}
