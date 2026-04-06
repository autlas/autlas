import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState, useCallback } from "react";
import { checkEverythingStatus, launchEverything, cleanupOrphans, resetDatabase } from "../api";
import { useTranslation } from "react-i18next";
import LanguageSelector from "./LanguageSelector";
import ToggleGroup from "./ui/ToggleGroup";
import { PlusIcon, CloseIcon, FolderIcon } from "./ui/Icons";
import Tooltip from "./ui/Tooltip";
import SettingsSection from "./ui/SettingsSection";
import { useTreeStore } from "../store/useTreeStore";
import { safeSetItem } from "../utils/safeStorage";

interface SettingsPanelProps {
  brightness: number;
  setBrightness: (v: number) => void;
  textContrast: number;
  setTextContrast: (v: number) => void;
  fontScale: number;
  setFontScale: (v: number) => void;
  animationsEnabled: boolean;
  toggleAnimations: () => void;
  vimModeNav: "hjkl" | "jk";
  setVimModeNav: (v: "hjkl" | "jk") => void;
  scanPaths: string[];
  onAddPath: () => void;
  onRemovePath: (path: string) => void;
  onInstallEverything?: () => void;
  orphanCount?: number;
  onReviewOrphans?: () => void;
  onRefresh?: () => void;
}

export default function SettingsPanel({
  brightness, setBrightness,
  textContrast, setTextContrast,
  fontScale, setFontScale,
  animationsEnabled, toggleAnimations,
  vimModeNav, setVimModeNav,
  scanPaths, onAddPath, onRemovePath, onInstallEverything, orphanCount, onReviewOrphans, onRefresh,
}: SettingsPanelProps) {
  const { t } = useTranslation();
  const showFileSize = useTreeStore(s => s.showFileSize);
  const toggleShowFileSize = useTreeStore(s => s.toggleShowFileSize);

  const [closeToTray, setCloseToTray] = useState(true);

  useEffect(() => {
    invoke<{ close_to_tray: boolean }>("get_tray_settings").then((s) => {
      setCloseToTray(s.close_to_tray);
    });
  }, []);

  const toggleCloseToTray = () => {
    const next = !closeToTray;
    setCloseToTray(next);
    invoke("set_tray_settings", { settings: { close_to_tray: next } });
  };

  const [everythingStatus, setEverythingStatus] = useState<"running" | "installed" | "not_installed" | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(() => localStorage.getItem("ahk_auto_refresh") === "true");
  const [everythingLoading, setEverythingLoading] = useState(false);
  const [confirmCleanup, setConfirmCleanup] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<number | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  useEffect(() => {
    checkEverythingStatus().then(setEverythingStatus);
  }, []);

  // Auto-detect when Everything starts running
  useEffect(() => {
    if (everythingStatus !== "installed") return;
    const interval = setInterval(async () => {
      const status = await checkEverythingStatus();
      if (status === "running") setEverythingStatus("running");
    }, 3000);
    return () => clearInterval(interval);
  }, [everythingStatus]);

  const handleLaunchEverything = useCallback(async () => {
    setEverythingLoading(true);
    try {
      await launchEverything();
      setEverythingStatus("running");
    } catch (e) { console.error(e); }
    setEverythingLoading(false);
  }, []);

  const vimNavOptions = useMemo(() => [
    { id: "hjkl" as const, label: "hjkl" },
    { id: "jk" as const, label: "jk" },
  ], []);

  return (
    <div className="max-w-[1200px] mx-auto w-full space-y-12 py-8">
      <SettingsSection>
        <h3 className="text-sm font-bold tracking-widest text-tertiary uppercase">{t("settings.language", "Language")}</h3>
        <div className="flex justify-between items-center px-2">
          <div className="flex flex-col">
            <span className="text-base font-bold text-secondary">{t("settings.language", "Language")}</span>
            <span className="text-xs text-tertiary mt-1">{t("settings.language_desc", "Select application language")}</span>
          </div>
          <LanguageSelector />
        </div>
      </SettingsSection>

      <SettingsSection>
        <h3 className="text-sm font-bold tracking-widest text-tertiary uppercase">{t("settings.theme_settings")}</h3>
        <div className="space-y-6">
          <div className="flex justify-between items-center px-2">
            <span className="text-base font-bold text-secondary">{t("settings.brightness")}</span>
            <span className="text-xs font-mono text-indigo-400 font-bold bg-indigo-400/10 px-4 py-1.5 rounded-full tracking-widest uppercase">{brightness}%</span>
          </div>
          <input
            type="range" min="0" max="100"
            value={brightness}
            onChange={(e) => setBrightness(parseInt(e.target.value))}
            className="w-full h-2 bg-white/5 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 transition-all opacity-80 hover:opacity-100"
          />
          <div className="flex justify-between text-xs text-tertiary font-bold uppercase tracking-[0.3em] pt-2 px-1">
            <span>{t("settings.oled_black")}</span>
            <span>{t("settings.light_gray")}</span>
          </div>
        </div>

        <div className="space-y-6 pt-4 border-t border-white/5">
          <div className="flex justify-between items-center px-2">
            <div className="flex flex-col">
              <span className="text-base font-bold text-secondary">{t("settings.contrast")}</span>
              <span className="text-xs text-tertiary mt-1">{t("settings.contrast_desc")}</span>
            </div>
            <span className="text-xs font-mono text-indigo-400 font-bold bg-indigo-400/10 px-4 py-1.5 rounded-full tracking-widest uppercase">{textContrast.toFixed(1)}x</span>
          </div>
          <input
            type="range" min="1" max="3" step="0.1"
            value={textContrast}
            onChange={(e) => setTextContrast(parseFloat(e.target.value))}
            className="w-full h-2 bg-white/5 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 transition-all opacity-80 hover:opacity-100"
          />
          <div className="flex justify-between text-xs text-tertiary font-bold uppercase tracking-[0.3em] pt-2 px-1">
            <span>{t("settings.standard")}</span>
            <span>{t("settings.maximum")}</span>
          </div>
        </div>

        <div className="space-y-6 pt-4 border-t border-white/5">
          <div className="flex justify-between items-center px-2">
            <div className="flex flex-col">
              <span className="text-base font-bold text-secondary">{t("settings.font_scale")}</span>
              <span className="text-xs text-tertiary mt-1">{t("settings.font_scale_desc")}</span>
            </div>
            <span className="text-xs font-mono text-indigo-400 font-bold bg-indigo-400/10 px-4 py-1.5 rounded-full tracking-widest uppercase">{fontScale.toFixed(2)}x</span>
          </div>
          <input
            type="range" min="0.75" max="1.5" step="0.05"
            value={fontScale}
            onChange={(e) => setFontScale(parseFloat(e.target.value))}
            className="w-full h-2 bg-white/5 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 transition-all opacity-80 hover:opacity-100"
          />
          <div className="flex justify-between text-xs text-tertiary font-bold uppercase tracking-[0.3em] pt-2 px-1">
            <span>0.75x</span>
            <span>1.5x</span>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection>
        <h3 className="text-sm font-bold tracking-widest text-tertiary uppercase">{t("settings.interface")}</h3>
        <div className="flex justify-between items-center px-2">
          <div className="flex flex-col">
            <span className="text-base font-bold text-secondary">{t("settings.animations_ui")}</span>
            <span className="text-xs text-tertiary mt-1">{t("settings.animations_ui_sub")}</span>
          </div>
          <button
            onClick={toggleAnimations}
            className={`relative w-14 h-7 rounded-full transition-all duration-300 cursor-pointer border ${animationsEnabled ? "bg-indigo-500/30 border-indigo-400/40 shadow-[0_0_12px_rgba(99,102,241,0.3)]" : "bg-white/5 border-white/10"}`}
          >
            <div className={`absolute top-[3px] w-5 h-5 rounded-full transition-all duration-300 shadow-lg ${animationsEnabled ? "left-[30px] bg-indigo-400 shadow-indigo-500/50" : "left-[3px] bg-white/30"}`} />
          </button>
        </div>

        <div className="flex justify-between items-center px-2 mt-8">
          <div className="flex flex-col">
            <span className="text-base font-bold text-secondary">{t("settings.vim_nav")}</span>
            <span className="text-xs text-tertiary mt-1">{t("settings.vim_nav_desc")}</span>
          </div>
          <ToggleGroup
              options={vimNavOptions}
              value={vimModeNav}
              onChange={(v) => { setVimModeNav(v); safeSetItem("ahk_vim_mode_nav", v); }}
              className="flex-shrink-0 w-[145px]"
          />
        </div>

        <div className="flex justify-between items-center px-2 pt-4 border-t border-white/5">
          <div className="flex flex-col">
            <span className="text-base font-bold text-secondary">{t("settings.show_file_size")}</span>
            <span className="text-xs text-tertiary mt-1">{t("settings.show_file_size_desc")}</span>
          </div>
          <button
            onClick={toggleShowFileSize}
            className={`relative w-14 h-7 rounded-full transition-all duration-300 cursor-pointer border ${showFileSize ? "bg-indigo-500/30 border-indigo-400/40 shadow-[0_0_12px_rgba(99,102,241,0.3)]" : "bg-white/5 border-white/10"}`}
          >
            <div className={`absolute top-[3px] w-5 h-5 rounded-full transition-all duration-300 shadow-lg ${showFileSize ? "left-[30px] bg-indigo-400 shadow-indigo-500/50" : "left-[3px] bg-white/30"}`} />
          </button>
        </div>

        <div className="flex justify-between items-center px-2 pt-4 border-t border-white/5">
          <div className="flex flex-col">
            <span className="text-base font-bold text-secondary">{t("settings.auto_refresh", "Auto-refresh on startup")}</span>
            <span className="text-xs text-tertiary mt-1">{t("settings.auto_refresh_desc", "Scan disk for changes when app opens")}</span>
          </div>
          <button
            onClick={() => { const v = localStorage.getItem("ahk_auto_refresh") !== "true"; safeSetItem("ahk_auto_refresh", String(v)); setAutoRefresh(v); }}
            className={`relative w-14 h-7 rounded-full transition-all duration-300 cursor-pointer border ${autoRefresh ? "bg-indigo-500/30 border-indigo-400/40 shadow-[0_0_12px_rgba(99,102,241,0.3)]" : "bg-white/5 border-white/10"}`}
          >
            <div className={`absolute top-[3px] w-5 h-5 rounded-full transition-all duration-300 shadow-lg ${autoRefresh ? "left-[30px] bg-indigo-400 shadow-indigo-500/50" : "left-[3px] bg-white/30"}`} />
          </button>
        </div>
      </SettingsSection>

      <SettingsSection>
        <h3 className="text-sm font-bold tracking-widest text-tertiary uppercase">{t("settings.system_tray")}</h3>
        <div className="flex justify-between items-center px-2">
          <div className="flex flex-col">
            <span className="text-base font-bold text-secondary">{t("settings.close_to_tray", "Close to tray")}</span>
            <span className="text-xs text-tertiary mt-1">{t("settings.close_to_tray_desc", "Hide window instead of quitting when closing")}</span>
          </div>
          <button
            onClick={toggleCloseToTray}
            className={`relative w-14 h-7 rounded-full transition-all duration-300 cursor-pointer border ${closeToTray ? "bg-indigo-500/30 border-indigo-400/40 shadow-[0_0_12px_rgba(99,102,241,0.3)]" : "bg-white/5 border-white/10"}`}
          >
            <div className={`absolute top-[3px] w-5 h-5 rounded-full transition-all duration-300 shadow-lg ${closeToTray ? "left-[30px] bg-indigo-400 shadow-indigo-500/50" : "left-[3px] bg-white/30"}`} />
          </button>
        </div>

      </SettingsSection>

      <SettingsSection>
        <h3 className="text-sm font-bold tracking-widest text-tertiary uppercase">{t("settings.script_library", "Script Library")}</h3>

        {/* Everything integration */}
        <div className="flex justify-between items-center px-2">
          <div className="flex flex-col">
            <span className="text-base font-bold text-secondary">{t("settings.everything_integration")}</span>
            <span className="text-xs text-tertiary mt-1">
              {everythingStatus === "running"
                ? t("settings.everything_running")
                : everythingStatus === "installed"
                ? t("settings.everything_installed")
                : t("settings.everything_not_installed")}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${
              everythingStatus === "running"
                ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]"
                : everythingStatus === "installed"
                ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]"
                : "bg-red-500/50 shadow-[0_0_8px_rgba(239,68,68,0.4)]"
            }`} />
            {everythingStatus === "running" && (
              <span className="text-xs font-mono text-green-400 font-bold bg-green-400/10 px-4 py-1.5 rounded-full tracking-widest uppercase">{t("settings.everything_active")}</span>
            )}
            {everythingStatus === "installed" && (
              <button
                onClick={handleLaunchEverything}
                disabled={everythingLoading}
                className="text-xs font-mono text-amber-400 font-bold bg-amber-400/10 px-4 py-1.5 rounded-full tracking-widest uppercase hover:bg-amber-400/20 transition-colors cursor-pointer disabled:opacity-50"
              >
                {everythingLoading ? t("settings.everything_starting") : t("settings.everything_launch")}
              </button>
            )}
            {everythingStatus === "not_installed" && (
              <button
                onClick={() => onInstallEverything?.()}
                className="text-xs font-mono text-red-400 font-bold bg-red-400/10 px-4 py-1.5 rounded-full tracking-widest uppercase hover:bg-red-400/20 transition-colors cursor-pointer"
              >
                {t("settings.everything_install")}
              </button>
            )}
          </div>
        </div>

        {/* Orphan reconciliation */}
        {orphanCount != null && orphanCount > 0 && (
          <div className="flex justify-between items-center px-2">
            <div className="flex flex-col">
              <span className="text-base font-bold text-secondary">{t("settings.orphan_title", "Moved Scripts")}</span>
              <span className="text-xs text-tertiary mt-1">
                {orphanCount === 1 ? t("orphan.subtitle_one") : t("orphan.subtitle_many", { count: orphanCount })}
              </span>
            </div>
            <button
              onClick={() => onReviewOrphans?.()}
              className="text-xs font-mono text-amber-400 font-bold bg-amber-400/10 px-4 py-1.5 rounded-full tracking-widest uppercase hover:bg-amber-400/20 transition-colors cursor-pointer"
            >
              {t("orphan.review")}
            </button>
          </div>
        )}

        {/* Divider */}
        <div className="h-px bg-white/5" />

        {/* Scan paths */}
        <div className="flex flex-col">
          <span className="text-base font-bold text-secondary">{t("settings.script_paths")}</span>
          <span className="text-xs text-tertiary mt-1">{t("settings.folder_picker_desc")}</span>
        </div>

        <div className="flex flex-col space-y-4">
          <div className="space-y-2">
            {scanPaths.length === 0 ? (
              <div className="p-10 border border-dashed border-white/5 rounded-3xl flex flex-col items-center justify-center text-tertiary">
                <span className="text-3xl opacity-20 mb-4">📂</span>
                <span className="text-xs font-bold opacity-50 uppercase tracking-widest text-center">{t("settings.no_paths")}</span>
              </div>
            ) : (
              scanPaths.map((path) => (
                <div key={path} className="flex items-center space-x-4 p-2.5 px-4 bg-white/[0.03] border border-white/10 rounded-2xl hover:bg-white/[0.05] transition-all group">
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-500/50 group-hover:bg-indigo-500 shadow-lg shadow-indigo-500/20" />
                  <span className="flex-1 text-[16px] font-bold text-secondary truncate font-mono tracking-tight">{path}</span>
                  <div className="flex items-center gap-1">
                    <Tooltip text={t("context.show_in_folder")}>
                      <button
                        onClick={() => invoke("open_in_explorer", { path })}
                        className="p-2 text-tertiary hover:text-white hover:bg-white/10 rounded-xl transition-all border-none bg-transparent cursor-pointer"
                      >
                        <FolderIcon />
                      </button>
                    </Tooltip>
                    <Tooltip text={t("settings.remove_path")}>
                      <button
                        onClick={() => onRemovePath(path)}
                        className="p-2 text-tertiary hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all border-none bg-transparent cursor-pointer"
                      >
                        <CloseIcon />
                      </button>
                    </Tooltip>
                  </div>
                </div>
              ))
            )}
          </div>

          <button
            id="settings-add-folder-btn"
            onClick={onAddPath}
            className="w-full h-12 bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white rounded-2xl text-xs font-bold tracking-widest transition-all shadow-xl hover:shadow-indigo-500/20 active:scale-[0.98] flex items-center justify-center gap-3 group border border-indigo-500/20 hover:border-indigo-500 cursor-pointer"
          >
            <PlusIcon size={18} className="group-hover:scale-110 transition-transform" />
            {t("settings.add_path")}
          </button>
        </div>
      </SettingsSection>

      <SettingsSection>
        <h3 className="text-sm font-bold tracking-widest text-tertiary uppercase">{t("settings.data_management", "Data Management")}</h3>

        <div className="flex justify-between items-center px-2">
          <div className="flex flex-col">
            <span className="text-base font-bold text-secondary">{t("settings.cleanup_orphans", "Clean Up Orphans")}</span>
            <span className="text-xs text-tertiary mt-1">{t("settings.cleanup_orphans_desc", "Remove all orphaned script records that were not reconciled")}</span>
          </div>
          {cleanupResult != null ? (
            <span className="text-xs font-mono text-green-400 font-bold tracking-widest uppercase">{t("settings.cleanup_done", "Deleted: {{count}}", { count: cleanupResult })}</span>
          ) : !confirmCleanup ? (
            <button
              onClick={() => setConfirmCleanup(true)}
              className="text-xs font-mono text-amber-400 font-bold bg-amber-400/10 px-4 py-1.5 rounded-full tracking-widest uppercase hover:bg-amber-400/20 transition-colors cursor-pointer"
            >
              {t("settings.cleanup_btn", "Clean Up")}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  const count = await cleanupOrphans();
                  setConfirmCleanup(false);
                  setCleanupResult(count);
                  setTimeout(() => setCleanupResult(null), 3000);
                }}
                className="text-xs font-mono text-amber-400 font-bold bg-amber-500/20 px-4 py-1.5 rounded-full tracking-widest uppercase hover:bg-amber-500/30 transition-colors cursor-pointer border border-amber-500/30"
              >
                {t("settings.reset_confirm", "Confirm")}
              </button>
              <button
                onClick={() => setConfirmCleanup(false)}
                className="text-xs font-mono text-tertiary font-bold bg-white/5 px-4 py-1.5 rounded-full tracking-widest uppercase hover:bg-white/10 transition-colors cursor-pointer"
              >
                {t("settings.reset_cancel", "Cancel")}
              </button>
            </div>
          )}
        </div>

        <div className="flex justify-between items-center px-2 pt-4 border-t border-white/5">
          <div className="flex flex-col">
            <span className="text-base font-bold text-secondary">{t("settings.reset_database", "Reset Database")}</span>
            <span className="text-xs text-tertiary mt-1">{t("settings.reset_database_desc", "Clear all tags, metadata, and icon cache. Files on disk are not affected.")}</span>
          </div>
          {!confirmReset ? (
            <button
              onClick={() => setConfirmReset(true)}
              className="text-xs font-mono text-red-400 font-bold bg-red-400/10 px-4 py-1.5 rounded-full tracking-widest uppercase hover:bg-red-400/20 transition-colors cursor-pointer"
            >
              {t("settings.reset_btn", "Reset")}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  await resetDatabase();
                  setConfirmReset(false);
                  setResetDone(true);
                  onRefresh?.();
                  setTimeout(() => setResetDone(false), 3000);
                }}
                className="text-xs font-mono text-red-400 font-bold bg-red-500/20 px-4 py-1.5 rounded-full tracking-widest uppercase hover:bg-red-500/30 transition-colors cursor-pointer border border-red-500/30"
              >
                {t("settings.reset_confirm", "Confirm")}
              </button>
              <button
                onClick={() => setConfirmReset(false)}
                className="text-xs font-mono text-tertiary font-bold bg-white/5 px-4 py-1.5 rounded-full tracking-widest uppercase hover:bg-white/10 transition-colors cursor-pointer"
              >
                {t("settings.reset_cancel", "Cancel")}
              </button>
            </div>
          )}
          {resetDone && (
            <span className="text-xs font-mono text-green-400 font-bold tracking-widest uppercase">{t("settings.reset_done", "Done!")}</span>
          )}
        </div>
      </SettingsSection>
    </div>
  );
}
