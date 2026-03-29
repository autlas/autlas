import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import LanguageSelector from "./LanguageSelector";
import ToggleGroup from "./ui/ToggleGroup";
import { PlusIcon, CloseIcon, FolderIcon } from "./ui/Icons";
import SettingsSection from "./ui/SettingsSection";

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
}

export default function SettingsPanel({
  brightness, setBrightness,
  textContrast, setTextContrast,
  fontScale, setFontScale,
  animationsEnabled, toggleAnimations,
  vimModeNav, setVimModeNav,
  scanPaths, onAddPath, onRemovePath,
}: SettingsPanelProps) {
  const { t } = useTranslation();

  const [closeToTray, setCloseToTray] = useState(true);
  const [clickToToggle, setClickToToggle] = useState(true);

  useEffect(() => {
    invoke<{ close_to_tray: boolean; click_to_toggle: boolean }>("get_tray_settings").then((s) => {
      setCloseToTray(s.close_to_tray);
      setClickToToggle(s.click_to_toggle);
    });
  }, []);

  const updateTraySetting = (key: string, val: boolean) => {
    const settings = { close_to_tray: closeToTray, click_to_toggle: clickToToggle, [key]: val };
    invoke("set_tray_settings", { settings });
  };

  const toggleCloseToTray = () => {
    const next = !closeToTray;
    setCloseToTray(next);
    updateTraySetting("close_to_tray", next);
  };

  const toggleClickToToggle = () => {
    const next = !clickToToggle;
    setClickToToggle(next);
    updateTraySetting("click_to_toggle", next);
  };

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
            <span className="text-base font-bold text-secondary">Vim Navigation Style</span>
            <span className="text-xs text-tertiary mt-1">hjkl (2D grid) vs jk (1D list)</span>
          </div>
          <ToggleGroup
              options={vimNavOptions}
              value={vimModeNav}
              onChange={(v) => { setVimModeNav(v); localStorage.setItem("ahk_vim_mode_nav", v); }}
              className="flex-shrink-0 w-[145px]"
          />
        </div>
      </SettingsSection>

      <SettingsSection>
        <h3 className="text-sm font-bold tracking-widest text-tertiary uppercase">System Tray</h3>
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

        <div className="flex justify-between items-center px-2 pt-4 border-t border-white/5">
          <div className="flex flex-col">
            <span className="text-base font-bold text-secondary">{t("settings.click_to_toggle", "Click to toggle window")}</span>
            <span className="text-xs text-tertiary mt-1">{t("settings.click_to_toggle_desc", "Left-click tray icon to show/hide window")}</span>
          </div>
          <button
            onClick={toggleClickToToggle}
            className={`relative w-14 h-7 rounded-full transition-all duration-300 cursor-pointer border ${clickToToggle ? "bg-indigo-500/30 border-indigo-400/40 shadow-[0_0_12px_rgba(99,102,241,0.3)]" : "bg-white/5 border-white/10"}`}
          >
            <div className={`absolute top-[3px] w-5 h-5 rounded-full transition-all duration-300 shadow-lg ${clickToToggle ? "left-[30px] bg-indigo-400 shadow-indigo-500/50" : "left-[3px] bg-white/30"}`} />
          </button>
        </div>
      </SettingsSection>

      <SettingsSection>
        <div className="flex flex-col">
          <h3 className="text-sm font-bold tracking-widest text-tertiary uppercase">{t("settings.script_paths")}</h3>
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
                    <button
                      onClick={() => invoke("open_in_explorer", { path })}
                      className="p-2 text-tertiary hover:text-white hover:bg-white/10 rounded-xl transition-all border-none bg-transparent cursor-pointer"
                      title={t("context.show_in_folder")}
                    >
                      <FolderIcon />
                    </button>
                    <button
                      onClick={() => onRemovePath(path)}
                      className="p-2 text-tertiary hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all border-none bg-transparent cursor-pointer"
                      title={t("settings.remove_path")}
                    >
                      <CloseIcon />
                    </button>
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
            <PlusIcon size={16} strokeWidth={3} className="group-hover:scale-110 transition-transform" />
            {t("settings.add_path")}
          </button>
        </div>
      </SettingsSection>
    </div>
  );
}
