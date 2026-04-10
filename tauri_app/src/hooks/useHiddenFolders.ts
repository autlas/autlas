import { useState, useEffect, useCallback } from "react";
import { getHiddenFolders, toggleHideFolder } from "../api";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";

export function useHiddenFolders(onChanged: () => void) {
  const { t } = useTranslation();
  const [hiddenFolders, setHiddenFolders] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    const list = await getHiddenFolders();
    setHiddenFolders(list);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const unhideFolder = async (path: string) => {
    // toggle_hide_folder is an idempotent toggle — calling it on a path that
    // is currently hidden will unhide it.
    await toggleHideFolder(path);
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
          await toggleHideFolder(selected);
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
