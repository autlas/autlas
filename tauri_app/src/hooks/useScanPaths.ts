import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";

export function useScanPaths(onPathsChanged: () => void) {
  const { t } = useTranslation();
  const [scanPaths, setScanPaths] = useState<string[]>([]);

  useEffect(() => {
    invoke<string[]>("get_scan_paths").then(setScanPaths);
  }, []);

  const handleAddScanPath = async () => {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: t("settings.select_folder"),
      });
      if (selected && typeof selected === "string") {
        if (!scanPaths.includes(selected)) {
          const next = [...scanPaths, selected];
          setScanPaths(next);
          await invoke("set_scan_paths", { paths: next });
          onPathsChanged();
        }
      }
    } catch (err) {
      console.error("Failed to open dialog:", err);
    }
  };

  const handleRemoveScanPath = async (path: string) => {
    const next = scanPaths.filter(p => p !== path);
    setScanPaths(next);
    await invoke("set_scan_paths", { paths: next });
    onPathsChanged();
  };

  return { scanPaths, handleAddScanPath, handleRemoveScanPath };
}
