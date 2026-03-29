import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import LanguageSelector from "./LanguageSelector";

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

  return (
    <div className="max-w-[1200px] mx-auto w-full space-y-12 py-8">
      <section className="space-y-8 bg-white/[0.02] p-10 rounded-[2.5rem] border border-white/5 shadow-2xl">
        <h3 className="text-sm font-bold tracking-widest text-tertiary uppercase">{t("settings.language", "Language")}</h3>
        <div className="flex justify-between items-center px-2">
          <div className="flex flex-col">
            <span className="text-base font-bold text-secondary">{t("settings.language", "Language")}</span>
            <span className="text-xs text-tertiary mt-1">{t("settings.language_desc", "Select application language")}</span>
          </div>
          <LanguageSelector />
        </div>
      </section>

      <section className="space-y-8 bg-white/[0.02] p-10 rounded-[2.5rem] border border-white/5 shadow-2xl">
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
      </section>

      <section className="space-y-8 bg-white/[0.02] p-10 rounded-[2.5rem] border border-white/5 shadow-2xl">
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
          <div className="flex bg-white/[0.03] border border-white/5 rounded-xl p-1 gap-1 h-[42px] flex-shrink-0 w-[145px]">
            <button
              onClick={() => { setVimModeNav("hjkl"); localStorage.setItem("ahk_vim_mode_nav", "hjkl"); }}
              className={`flex-1 h-full rounded-lg text-[10px] font-black tracking-widest uppercase transition-all flex items-center justify-center cursor-pointer ${vimModeNav === "hjkl" ? "bg-white/10 text-white shadow-lg shadow-white/5" : "text-tertiary hover:text-white hover:bg-white/5"}`}
            >
              hjkl
            </button>
            <button
              onClick={() => { setVimModeNav("jk"); localStorage.setItem("ahk_vim_mode_nav", "jk"); }}
              className={`flex-1 h-full rounded-lg text-[10px] font-black tracking-widest uppercase transition-all flex items-center justify-center cursor-pointer ${vimModeNav === "jk" ? "bg-white/10 text-white shadow-lg shadow-white/5" : "text-tertiary hover:text-white hover:bg-white/5"}`}
            >
              jk
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-8 bg-white/[0.02] p-10 rounded-[2.5rem] border border-white/5 shadow-2xl">
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
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => onRemovePath(path)}
                      className="p-2 text-tertiary hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all border-none bg-transparent cursor-pointer"
                      title={t("settings.remove_path")}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <button
            onClick={onAddPath}
            className="w-full h-12 bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white rounded-2xl text-xs font-bold tracking-widest transition-all shadow-xl hover:shadow-indigo-500/20 active:scale-[0.98] flex items-center justify-center gap-3 group border border-indigo-500/20 hover:border-indigo-500 cursor-pointer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="group-hover:scale-110 transition-transform">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {t("settings.add_path")}
          </button>
        </div>
      </section>
    </div>
  );
}
