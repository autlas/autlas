import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState, useCallback } from "react";
import { checkEverythingStatus, launchEverything, cleanupOrphans, resetDatabase } from "../../api";
import { useTranslation } from "react-i18next";
import LanguageSelector from "./LanguageSelector";
import ToggleGroup from "../ui/ToggleGroup";
import { PlusIcon, CloseIcon, FolderIcon } from "../ui/Icons";
import { Question } from "@phosphor-icons/react";
import Tooltip from "../ui/Tooltip";
import TruncatedTooltip from "../ui/TruncatedTooltip";
import SettingsSection from "../ui/SettingsSection";
import { useTreeStore } from "../../store/useTreeStore";
import { safeSetItem } from "../../utils/safeStorage";

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
  pathCounts?: Record<string, number>;
  onAddPath: () => void;
  onRemovePath: (path: string) => void;
  blacklist: string[];
  onAddBlacklist: () => void;
  onRemoveBlacklist: (path: string) => void;
  hiddenFolders: string[];
  onUnhideFolder: (path: string) => void;
  onAddHiddenFolder: () => void;
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
  scanPaths, pathCounts, onAddPath, onRemovePath, blacklist, onAddBlacklist, onRemoveBlacklist, hiddenFolders, onUnhideFolder, onAddHiddenFolder, onInstallEverything, orphanCount, onReviewOrphans, onRefresh,
}: SettingsPanelProps) {
  const { t } = useTranslation();

  const [closeToTray, setCloseToTray] = useState(true);
  const [vimEnabled, setVimEnabled] = useState<boolean>(() => localStorage.getItem("ahk_vim_enabled") !== "false");
  const [blacklistCounts, setBlacklistCounts] = useState<Record<string, number>>({});
  const [hiddenCounts, setHiddenCounts] = useState<Record<string, number>>({});

  // Walk each blacklist/hidden folder once and cache the .ahk count.
  // We can't reuse pathCounts (which is computed from in-memory scripts)
  // because blacklisted/hidden entries are filtered out before reaching here.
  useEffect(() => {
    if (blacklist.length === 0) { setBlacklistCounts({}); return; }
    invoke<number[]>("count_ahk_files", { paths: blacklist }).then(arr => {
      const map: Record<string, number> = {};
      blacklist.forEach((p, i) => { map[p] = arr[i] ?? 0; });
      setBlacklistCounts(map);
    }).catch(console.error);
  }, [blacklist]);

  useEffect(() => {
    if (hiddenFolders.length === 0) { setHiddenCounts({}); return; }
    invoke<number[]>("count_ahk_files", { paths: hiddenFolders }).then(arr => {
      const map: Record<string, number> = {};
      hiddenFolders.forEach((p, i) => { map[p] = arr[i] ?? 0; });
      setHiddenCounts(map);
    }).catch(console.error);
  }, [hiddenFolders]);

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

  const fuseThreshold = useTreeStore(s => s.fuseThreshold);
  const fuseMinMatchLen = useTreeStore(s => s.fuseMinMatchLen);
  const fuseFindAllMatches = useTreeStore(s => s.fuseFindAllMatches);
  const fuseSearchPath = useTreeStore(s => s.fuseSearchPath);
  const setFuseThreshold = useTreeStore(s => s.setFuseThreshold);
  const setFuseMinMatchLen = useTreeStore(s => s.setFuseMinMatchLen);
  const setFuseFindAllMatches = useTreeStore(s => s.setFuseFindAllMatches);
  const setFuseSearchPath = useTreeStore(s => s.setFuseSearchPath);


  return (
    <div className="max-w-[1200px] mx-auto w-full space-y-12 py-8">

      {/* ─── Appearance ─── */}
      <SettingsSection>
        <h3 className="text-sm font-bold tracking-widest text-tertiary uppercase">{t("settings.appearance", "Appearance")}</h3>

        <div className="flex justify-between items-center">
          <div className="flex flex-col">
            <span className="text-base font-bold text-secondary">{t("settings.language", "Language")}</span>
            <span className="text-xs text-tertiary mt-1">{t("settings.language_desc", "Select application language")}</span>
          </div>
          <LanguageSelector />
        </div>

        <div className="space-y-2 pt-4 border-t border-white/5">
          <div className="flex justify-between items-end">
            <span className="text-base font-bold text-secondary">{t("settings.brightness")}</span>
            <span className="text-xs font-mono text-indigo-400 font-bold bg-indigo-400/10 px-4 py-1.5 rounded-full tracking-widest uppercase">{brightness}%</span>
          </div>
          <input
            type="range" min="0" max="100" step="5"
            value={brightness}
            onChange={(e) => setBrightness(parseInt(e.target.value))}
            className="w-full h-2 bg-white/5 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 transition-all opacity-80 hover:opacity-100"
          />
          <div className="flex justify-between text-xs text-tertiary font-bold uppercase tracking-[0.3em]">
            <span>{t("settings.oled_black")}</span>
            <span>{t("settings.light_gray")}</span>
          </div>
        </div>

        <div className="space-y-2 pt-4 border-t border-white/5">
          <div className="flex justify-between items-end">
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
          <div className="flex justify-between text-xs text-tertiary font-bold uppercase tracking-[0.3em]">
            <span>{t("settings.standard")}</span>
            <span>{t("settings.maximum")}</span>
          </div>
        </div>

        <div className="space-y-2 pt-4 border-t border-white/5">
          <div className="flex justify-between items-end">
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
          <div className="flex justify-between text-xs text-tertiary font-bold uppercase tracking-[0.3em]">
            <span>0.75x</span>
            <span>1.5x</span>
          </div>
        </div>

        <div className="flex justify-between items-center pt-4 border-t border-white/5">
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
      </SettingsSection>

      {/* ─── Behavior ─── */}
      <SettingsSection>
        <h3 className="text-sm font-bold tracking-widest text-tertiary uppercase">{t("settings.behavior", "Behavior")}</h3>

        <div className="flex justify-between items-center pt-4 border-t border-white/5">
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

      {/* ─── Vim ─── */}
      <SettingsSection>
        <h3 className="text-sm font-bold tracking-widest text-tertiary uppercase">{t("settings.vim", "Vim")}</h3>

        <div className="flex justify-between items-center">
          <div className="flex flex-col">
            <span className="text-base font-bold text-secondary">{t("settings.vim_enabled", "Vim-режим")}</span>
            <span className="text-xs text-tertiary mt-1">{t("settings.vim_enabled_desc", "Включает hjkl-навигацию и все vim-хоткеи в дереве")}</span>
          </div>
          <button
            onClick={() => {
              const next = !vimEnabled;
              setVimEnabled(next);
              safeSetItem("ahk_vim_enabled", next ? "true" : "false");
              window.dispatchEvent(new CustomEvent("ahk-vim-enabled-changed"));
            }}
            className={`relative w-14 h-7 rounded-full transition-all duration-300 cursor-pointer border ${vimEnabled ? "bg-indigo-500/30 border-indigo-400/40 shadow-[0_0_12px_rgba(99,102,241,0.3)]" : "bg-white/5 border-white/10"}`}
          >
            <div className={`absolute top-[3px] w-5 h-5 rounded-full transition-all duration-300 shadow-lg ${vimEnabled ? "left-[30px] bg-indigo-400 shadow-indigo-500/50" : "left-[3px] bg-white/30"}`} />
          </button>
        </div>

        <div className={`flex justify-between items-center pt-4 border-t border-white/5 transition-opacity ${vimEnabled ? '' : 'opacity-40 pointer-events-none'}`}>
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

        <div className={`flex justify-between items-center pt-4 border-t border-white/5 transition-opacity ${vimEnabled ? '' : 'opacity-40 pointer-events-none'}`}>
          <div className="flex flex-col">
            <span className="text-base font-bold text-secondary">{t("settings.vim_cheatsheet", "Шпаргалка хоткеев")}</span>
            <span className="text-xs text-tertiary mt-1">{t("settings.vim_cheatsheet_desc", "Все горячие клавиши приложения. Также открывается клавишей ?")}</span>
          </div>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("ahk-open-cheatsheet"))}
            className="px-5 h-[42px] rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 text-sm font-bold border border-indigo-500/20 hover:border-indigo-500/40 transition-all cursor-pointer"
          >
            {t("settings.open_cheatsheet", "Открыть")}
          </button>
        </div>
      </SettingsSection>

      {/* ─── Search ─── */}
      <SettingsSection>
        <h3 className="text-sm font-bold tracking-widest text-tertiary uppercase">{t("settings.search", "Search")}</h3>

        {/* Threshold slider */}
        <div className="space-y-2">
          <div className="flex justify-between items-end">
            <div className="flex flex-col">
              <span className="text-base font-bold text-secondary inline-flex items-center gap-1.5">
                {t("settings.fuse_threshold", "Толерантность к опечаткам")}
                <Tooltip text={t("settings.fuse_threshold_info", "Бюджет ошибок относительно длины запроса. 0.0 — только точное совпадение, 1.0 — почти любое слово засчитается. На практике 0.3 строго, 0.4 прощает одну опечатку в коротких словах, 0.5+ начинает ловить ложные совпадения.")}>
                  <span className="text-tertiary hover:text-secondary transition-colors cursor-help inline-flex translate-y-[2px]">
                    <Question size={16} weight="bold" />
                  </span>
                </Tooltip>
              </span>
            </div>
            <span className="text-xs font-mono text-indigo-400 font-bold bg-indigo-400/10 px-4 py-1.5 rounded-full tracking-widest uppercase">{fuseThreshold.toFixed(2)}</span>
          </div>
          <input
            type="range" min="0" max="1" step="0.05"
            value={fuseThreshold}
            onChange={(e) => setFuseThreshold(parseFloat(e.target.value))}
            className="w-full h-2 bg-white/5 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 transition-all opacity-80 hover:opacity-100"
          />
          <div className="flex justify-between text-xs text-tertiary font-bold uppercase tracking-[0.3em]">
            <span>{t("settings.fuse_strict", "Строго")}</span>
            <span>{t("settings.fuse_loose", "Свободно")}</span>
          </div>
        </div>

        {/* Min match length */}
        <div className="space-y-2 pt-4 border-t border-white/5">
          <div className="flex justify-between items-end">
            <div className="flex flex-col">
              <span className="text-base font-bold text-secondary inline-flex items-center gap-1.5">
                {t("settings.fuse_min_match", "Минимальная длина совпадения")}
                <Tooltip text={t("settings.fuse_min_match_info", "Минимальная длина непрерывной подпоследовательности букв запроса, которая засчитывается. Меньше — ловит больше фрагментированных совпадений, но добавляет шума. 2 — разумный баланс, 3 — почти отключает короткие случайные матчи.")}>
                  <span className="text-tertiary hover:text-secondary transition-colors cursor-help inline-flex translate-y-[2px]">
                    <Question size={16} weight="bold" />
                  </span>
                </Tooltip>
              </span>
            </div>
            <span className="text-xs font-mono text-indigo-400 font-bold bg-indigo-400/10 px-4 py-1.5 rounded-full tracking-widest uppercase">{fuseMinMatchLen}</span>
          </div>
          <input
            type="range" min="1" max="5" step="1"
            value={fuseMinMatchLen}
            onChange={(e) => setFuseMinMatchLen(parseInt(e.target.value))}
            className="w-full h-2 bg-white/5 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 transition-all opacity-80 hover:opacity-100"
          />
          <div className="flex justify-between text-xs text-tertiary font-bold uppercase tracking-[0.3em]">
            <span>1</span>
            <span>5</span>
          </div>
        </div>

        {/* Find all matches toggle */}
        <div className="flex justify-between items-center pt-4 border-t border-white/5">
          <div className="flex flex-col">
            <span className="text-base font-bold text-secondary inline-flex items-center gap-1.5">
              {t("settings.fuse_find_all", "Все совпадения в имени")}
              <Tooltip text={t("settings.fuse_find_all_info", "Если включено — fuse находит все вхождения запроса в имени файла, а не только первое. Лучше для подсветки и ранжирует выше файлы где запрос встречается несколько раз. Если выключить — чуть быстрее, но подсветка обрывается на первом совпадении.")}>
                <span className="text-tertiary hover:text-secondary transition-colors cursor-help inline-flex translate-y-[2px]">
                  <Question size={16} weight="bold" />
                </span>
              </Tooltip>
            </span>
          </div>
          <button
            onClick={() => setFuseFindAllMatches(!fuseFindAllMatches)}
            className={`relative w-14 h-7 rounded-full transition-all duration-300 cursor-pointer border ${fuseFindAllMatches ? "bg-indigo-500/30 border-indigo-400/40 shadow-[0_0_12px_rgba(99,102,241,0.3)]" : "bg-white/5 border-white/10"}`}
          >
            <div className={`absolute top-[3px] w-5 h-5 rounded-full transition-all duration-300 shadow-lg ${fuseFindAllMatches ? "left-[30px] bg-indigo-400 shadow-indigo-500/50" : "left-[3px] bg-white/30"}`} />
          </button>
        </div>

        {/* Search path toggle */}
        <div className="flex justify-between items-center pt-4 border-t border-white/5">
          <div className="flex flex-col">
            <span className="text-base font-bold text-secondary inline-flex items-center gap-1.5">
              {t("settings.fuse_search_path", "Искать по пути папок")}
              <Tooltip text={t("settings.fuse_search_path_info", "Если включено — кроме имени файла поиск также пробегает по названию папок (без fuzzy, только точное вхождение подстроки). Полезно чтобы найти все скрипты в папке `automation`. Если выключить — поиск только по именам файлов, без шума из системных путей.")}>
                <span className="text-tertiary hover:text-secondary transition-colors cursor-help inline-flex translate-y-[2px]">
                  <Question size={16} weight="bold" />
                </span>
              </Tooltip>
            </span>
          </div>
          <button
            onClick={() => setFuseSearchPath(!fuseSearchPath)}
            className={`relative w-14 h-7 rounded-full transition-all duration-300 cursor-pointer border ${fuseSearchPath ? "bg-indigo-500/30 border-indigo-400/40 shadow-[0_0_12px_rgba(99,102,241,0.3)]" : "bg-white/5 border-white/10"}`}
          >
            <div className={`absolute top-[3px] w-5 h-5 rounded-full transition-all duration-300 shadow-lg ${fuseSearchPath ? "left-[30px] bg-indigo-400 shadow-indigo-500/50" : "left-[3px] bg-white/30"}`} />
          </button>
        </div>
      </SettingsSection>

      {/* ─── Script Library ─── */}
      <SettingsSection>
        <h3 className="text-sm font-bold tracking-widest text-tertiary uppercase">{t("settings.script_library", "Script Library")}</h3>

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
                  <TruncatedTooltip text={path}><span className="flex-1 text-[16px] font-bold text-secondary truncate font-mono tracking-tight">{path}</span></TruncatedTooltip>
                  <span className="text-[14px] font-normal tracking-wide text-tertiary opacity-50 flex-shrink-0">
                    {(pathCounts?.[path] ?? 0)} {t("settings.scripts_count", "scripts")}
                  </span>
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

          {/* Blacklist */}
          <div className="pt-6 mt-2 border-t border-white/5 space-y-2">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold tracking-widest text-tertiary uppercase">
                {t("settings.blacklist", "Excluded folders")}
              </span>
              <Tooltip text={t("settings.blacklist_info", "Folders skipped during scan. Useful for nested junk inside a scanned root.")}>
                <span className="text-tertiary hover:text-secondary transition-colors cursor-help inline-flex">
                  <Question size={16} weight="bold" />
                </span>
              </Tooltip>
            </div>

            {blacklist.length === 0 ? (
              <div className="p-6 border border-dashed border-white/5 rounded-2xl flex items-center justify-center text-tertiary">
                <span className="text-[11px] font-bold opacity-40 uppercase tracking-widest">
                  {t("settings.no_blacklist", "No excluded folders")}
                </span>
              </div>
            ) : (
              blacklist.map((path) => (
                <div key={path} className="flex items-center space-x-4 p-2.5 px-4 bg-white/[0.03] border border-white/10 rounded-2xl hover:bg-white/[0.05] transition-all group">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500/50 group-hover:bg-red-500 shadow-lg shadow-red-500/20" />
                  <TruncatedTooltip text={path}><span className="flex-1 text-[16px] font-bold text-secondary truncate font-mono tracking-tight">{path}</span></TruncatedTooltip>
                  <span className="text-[14px] font-normal tracking-wide text-tertiary opacity-50 flex-shrink-0">
                    {(blacklistCounts[path] ?? 0)} {t("settings.scripts_count", "scripts")}
                  </span>
                  <div className="flex items-center gap-1">
                    <Tooltip text={t("context.show_in_folder")}>
                      <button
                        onClick={() => invoke("open_in_explorer", { path })}
                        className="p-2 text-tertiary hover:text-white hover:bg-white/10 rounded-xl transition-all border-none bg-transparent cursor-pointer"
                      >
                        <FolderIcon />
                      </button>
                    </Tooltip>
                    <Tooltip text={t("settings.remove_blacklist", "Убрать из исключений")}>
                      <button
                        onClick={() => onRemoveBlacklist(path)}
                        className="p-2 text-tertiary hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all border-none bg-transparent cursor-pointer"
                      >
                        <CloseIcon />
                      </button>
                    </Tooltip>
                  </div>
                </div>
              ))
            )}

            <button
              onClick={onAddBlacklist}
              className="w-full h-12 bg-red-600/10 hover:bg-red-600 text-red-400 hover:text-white rounded-2xl text-xs font-bold tracking-widest transition-all shadow-xl hover:shadow-red-500/20 active:scale-[0.98] flex items-center justify-center gap-3 group border border-red-500/20 hover:border-red-500 cursor-pointer"
            >
              <PlusIcon size={18} className="group-hover:scale-110 transition-transform" />
              {t("settings.add_blacklist", "Exclude folder")}
            </button>
          </div>

          {/* Hidden folders */}
          <div className="pt-6 mt-2 border-t border-white/5 space-y-2">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold tracking-widest text-tertiary uppercase">
                {t("settings.hidden_folders", "Hidden folders")}
              </span>
              <Tooltip text={t("settings.hidden_folders_info", "Folders hidden from the script tree. They are still scanned, just not shown in the UI by default.")}>
                <span className="text-tertiary hover:text-secondary transition-colors cursor-help inline-flex">
                  <Question size={16} weight="bold" />
                </span>
              </Tooltip>
            </div>

            {hiddenFolders.length === 0 ? (
              <div className="p-6 border border-dashed border-white/5 rounded-2xl flex items-center justify-center text-tertiary">
                <span className="text-[11px] font-bold opacity-40 uppercase tracking-widest">
                  {t("settings.no_hidden_folders", "No hidden folders")}
                </span>
              </div>
            ) : (
              hiddenFolders.map((path) => (
                <div key={path} className="flex items-center space-x-4 p-2.5 px-4 bg-white/[0.03] border border-white/10 rounded-2xl hover:bg-white/[0.05] transition-all group">
                  <div className="w-1.5 h-1.5 rounded-full bg-white/20 group-hover:bg-white/40" />
                  <TruncatedTooltip text={path}><span className="flex-1 text-[16px] font-bold text-secondary truncate font-mono tracking-tight opacity-60">{path}</span></TruncatedTooltip>
                  <span className="text-[14px] font-normal tracking-wide text-tertiary opacity-50 flex-shrink-0">
                    {(hiddenCounts[path] ?? 0)} {t("settings.scripts_count", "scripts")}
                  </span>
                  <div className="flex items-center gap-1">
                    <Tooltip text={t("context.show_in_folder")}>
                      <button
                        onClick={() => invoke("open_in_explorer", { path })}
                        className="p-2 text-tertiary hover:text-white hover:bg-white/10 rounded-xl transition-all border-none bg-transparent cursor-pointer"
                      >
                        <FolderIcon />
                      </button>
                    </Tooltip>
                    <Tooltip text={t("settings.unhide_folder", "Показать в дереве")}>
                      <button
                        onClick={() => onUnhideFolder(path)}
                        className="p-2 text-tertiary hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all border-none bg-transparent cursor-pointer"
                      >
                        <CloseIcon />
                      </button>
                    </Tooltip>
                  </div>
                </div>
              ))
            )}

            <button
              onClick={onAddHiddenFolder}
              className="w-full h-12 bg-white/5 hover:bg-white/15 text-tertiary hover:text-white rounded-2xl text-xs font-bold tracking-widest transition-all shadow-xl active:scale-[0.98] flex items-center justify-center gap-3 group border border-white/10 hover:border-white/20 cursor-pointer"
            >
              <PlusIcon size={18} className="group-hover:scale-110 transition-transform" />
              {t("settings.add_hidden_folder", "Скрыть папку")}
            </button>
          </div>
        </div>

        {/* Everything integration */}
        <div className="flex justify-between items-center pt-4 border-t border-white/5">
          <div className="flex flex-col">
            <span className="text-base font-bold text-secondary inline-flex items-center gap-1.5">
              {t("settings.everything_integration")}
              <Tooltip text={t("settings.everything_info", "Everything by voidtools indexes every file on your NTFS drives in real time. With it, script scanning is 30–100x faster than a regular disk walk.")}>
                <span className="text-tertiary hover:text-secondary transition-colors cursor-help inline-flex translate-y-[2px]">
                  <Question size={18} weight="bold" />
                </span>
              </Tooltip>
            </span>
            <span className="text-xs text-tertiary mt-1">
              {everythingStatus === "running"
                ? t("settings.everything_running")
                : everythingStatus === "installed"
                  ? t("settings.everything_installed")
                  : t("settings.everything_not_installed")}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${everythingStatus === "running"
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

        {/* Auto-refresh */}
        <div className="flex justify-between items-center pt-4 border-t border-white/5">
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

      {/* ─── Data & Maintenance ─── */}
      <SettingsSection>
        <h3 className="text-sm font-bold tracking-widest text-tertiary uppercase">{t("settings.data_management", "Data & Maintenance")}</h3>

        {/* Orphan reconciliation */}
        {orphanCount != null && orphanCount > 0 && (
          <div className="flex justify-between items-center">
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

        {/* Cleanup orphans */}
        <div className="flex justify-between items-center">
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

        {/* Reset database */}
        <div className="flex justify-between items-center pt-4 border-t border-white/5">
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
