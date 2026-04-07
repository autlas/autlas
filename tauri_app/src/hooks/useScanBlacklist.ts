import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";

export function useScanBlacklist(onPathsChanged: () => void) {
  const { t } = useTranslation();
  const [blacklist, setBlacklist] = useState<string[]>([]);

  useEffect(() => {
    invoke<string[]>("get_scan_blacklist").then(setBlacklist);
  }, []);

  const handleAddBlacklist = async () => {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: t("settings.select_folder"),
      });
      if (selected && typeof selected === "string") {
        if (!blacklist.includes(selected)) {
          const next = [...blacklist, selected];
          setBlacklist(next);
          await invoke("set_scan_blacklist", { paths: next });
          onPathsChanged();
        }
      }
    } catch (err) {
      console.error("Failed to open dialog:", err);
    }
  };

  const handleRemoveBlacklist = async (path: string) => {
    const next = blacklist.filter(p => p !== path);
    setBlacklist(next);
    await invoke("set_scan_blacklist", { paths: next });
    onPathsChanged();
  };

  const addBlacklistPath = async (path: string) => {
    if (blacklist.includes(path)) return;
    const next = [...blacklist, path];
    setBlacklist(next);
    await invoke("set_scan_blacklist", { paths: next });
    onPathsChanged();
  };

  return { blacklist, handleAddBlacklist, handleRemoveBlacklist, addBlacklistPath };
}
