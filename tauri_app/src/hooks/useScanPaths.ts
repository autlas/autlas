import { useState, useEffect } from "react";
import { getScanPaths, setScanPaths as apiSetScanPaths } from "../api";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";

export function useScanPaths(onPathsChanged: () => void) {
  const { t } = useTranslation();
  const [scanPaths, setScanPaths] = useState<string[]>([]);

  useEffect(() => {
    getScanPaths().then(setScanPaths);
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
          await apiSetScanPaths(next);
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
    await apiSetScanPaths(next);
    onPathsChanged();
  };

  return { scanPaths, handleAddScanPath, handleRemoveScanPath };
}
