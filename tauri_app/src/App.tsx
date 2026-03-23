import { useState, useEffect } from "react";
import ScriptTree from "./components/ScriptTree";
import "./App.css";

function App() {
  const [activeTab, setActiveTab] = useState("ХАБ");
  const [userTags, setUserTags] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<"tree" | "hub" | "settings">("hub");

  // Brightness: 0 (AMOLED) to 100 (Grey #1F1F1F)
  const [brightness, setBrightness] = useState(() => {
    return parseInt(localStorage.getItem("app-brightness") || "20");
  });

  const [rootPath, setRootPath] = useState(() => {
    return localStorage.getItem("root-path") || "Desktop / Parent folder";
  });

  const updatePalette = (val: number) => {
    // Primary BG: from (0,0,0) to (31,31,31)
    const base = Math.floor((31 * val) / 100);
    // Secondary BG: slightly lighter (offset by ~4-6)
    const side = Math.floor((37 * val) / 100);

    document.documentElement.style.setProperty("--bg-primary", `rgb(${base}, ${base}, ${base})`);
    document.documentElement.style.setProperty("--bg-secondary", `rgb(${side}, ${side}, ${side})`);
    document.documentElement.style.setProperty("--bg-tertiary", val < 10 ? "rgba(255, 255, 255, 0.05)" : "rgba(255, 255, 255, 0.03)");
    document.documentElement.style.setProperty("--border-color", val < 10 ? "rgba(255, 255, 255, 0.1)" : "rgba(255, 255, 255, 0.05)");
  };

  useEffect(() => {
    updatePalette(brightness);
    localStorage.setItem("app-brightness", brightness.toString());
  }, [brightness]);

  const handleTabClick = (tab: string) => {
    setActiveTab(tab);
    if (tab === "ХАБ") {
      setViewMode("hub");
    } else if (tab === "НАСТРОЙКИ") {
      setViewMode("settings");
    } else {
      setViewMode("tree");
    }
  };

  return (
    <div className="flex h-screen w-full transition-colors duration-300" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Sidebar */}
      <div
        className="w-64 flex flex-col p-6 space-y-8 border-r overflow-y-auto scrollbar-hide transition-colors duration-300"
        style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
      >
        <div>
          <h2 className="text-[12px] font-black text-white/20 uppercase tracking-[0.3em] mb-4 pl-2">Главное</h2>
          <ul className="space-y-1">
            {["ХАБ", "Все скрипты", "НАСТРОЙКИ"].map((tab) => (
              <li
                key={tab}
                className={`px-5 py-3 rounded-xl cursor-pointer text-sm font-black transition-all flex items-center justify-between ${activeTab === tab
                    ? tab === "ХАБ" ? "bg-gradient-to-r from-indigo-500 to-purple-500 shadow-xl shadow-indigo-900/30 text-white" : "bg-white/10 text-white border border-white/10"
                    : "text-white/40 hover:bg-white/5 hover:text-white"
                  }`}
                onClick={() => handleTabClick(tab)}
              >
                {tab === "ХАБ" ? "🚀 ХАБ" : tab === "Все скрипты" ? "📁 ДЕРЕВО" : "⚙️ ТТИНГИ"}
                {tab === "ХАБ" && activeTab !== "ХАБ" && <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(79,70,229,0.5)]"></div>}
              </li>
            ))}
          </ul>
        </div>

        {viewMode !== "settings" && (
          <>
            <div>
              <h2 className="text-[12px] font-black text-white/20 uppercase tracking-[0.3em] mb-4 pl-2">Фильтры</h2>
              <ul className="space-y-1">
                {["С тегами", "Без тегов", "Скрытые", "Запущенные"].map((item) => (
                  <li
                    key={item}
                    className={`px-5 py-2.5 rounded-lg cursor-pointer text-xs font-bold transition-all ${activeTab === item
                        ? "bg-white/10 text-white border border-white/10"
                        : "text-white/30 hover:bg-white/5 hover:text-white/60"
                      }`}
                    onClick={() => handleTabClick(item)}
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex-1">
              <h2 className="text-[12px] font-black text-white/20 uppercase tracking-[0.3em] mb-4 pl-2">Теги из INI</h2>
              <ul className="space-y-0.5">
                {userTags.map((tag) => (
                  <li
                    key={tag}
                    className={`px-5 py-2 rounded-lg cursor-pointer text-sm transition-all flex items-center space-x-3 group ${activeTab === tag
                        ? "text-indigo-400 font-black"
                        : "text-white/30 hover:text-white/60"
                      }`}
                    onClick={() => handleTabClick(tag)}
                  >
                    <div className={`w-1 h-1 rounded-full transition-all ${activeTab === tag ? 'bg-indigo-400' : 'bg-current opacity-30'}`}></div>
                    <span>#{tag}</span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        <div className="pt-6 border-t border-white/5 opacity-20">
          <div className="text-[9px] text-white font-mono uppercase tracking-[0.3em] text-center">
            V-CON v2.0
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div
        className="flex-1 p-10 flex flex-col overflow-hidden transition-all duration-300"
        style={{ background: viewMode === "settings" ? 'var(--bg-primary)' : 'linear-gradient(to bottom right, var(--bg-primary), var(--bg-secondary))' }}
      >
        <div className="flex justify-between items-end mb-10">
          <div className="flex flex-col">
            <h1 className="text-4xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-white to-white/40 pb-1">
              {activeTab}
            </h1>
            <div className="flex items-center space-x-2.5 mt-2">
              <div className="h-1 w-10 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full w-1/2 bg-indigo-500"></div>
              </div>
              <span className="text-[10px] text-white/10 uppercase tracking-[0.4em] font-mono">Operations Unit Ready</span>
            </div>
          </div>

          <button
            className="px-8 py-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-all text-[10px] font-black tracking-[0.3em] uppercase active:scale-95 shadow-lg"
            onClick={() => window.location.reload()}
          >
            REFRESH
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pr-6 custom-scrollbar">
          {viewMode === "settings" ? (
            <div className="max-w-2xl space-y-12">
              <section className="space-y-6 bg-white/[0.02] p-8 rounded-3xl border border-white/5 shadow-2xl">
                <h3 className="text-lg font-black tracking-widest text-white/40 uppercase">Theme Controls</h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center px-2">
                    <span className="text-sm font-bold text-white/60">Interface Brightness</span>
                    <span className="text-xs font-mono text-indigo-400 font-bold bg-indigo-400/10 px-3 py-1 rounded-full uppercase tracking-tighter">{brightness}%</span>
                  </div>
                  <input
                    type="range"
                    min="0" max="100"
                    value={brightness}
                    onChange={(e) => setBrightness(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-white/5 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 transition-all"
                  />
                  <div className="flex justify-between text-[10px] text-white/10 font-bold uppercase tracking-widest pt-2 px-1">
                    <span>OLED black</span>
                    <span>Soft Grey</span>
                  </div>
                </div>
              </section>

              <section className="space-y-6 bg-white/[0.02] p-8 rounded-3xl border border-white/5 shadow-2xl">
                <h3 className="text-lg font-black tracking-widest text-white/40 uppercase">Directories</h3>
                <div className="flex flex-col space-y-4">
                  <span className="text-sm font-bold text-white/60 pl-2">Scripts Root Path</span>
                  <div className="flex items-center space-x-3 p-4 bg-white/[0.03] border border-white/5 rounded-2xl">
                    <span className="flex-1 text-xs font-bold text-white/30 truncate font-mono italic">{rootPath}</span>
                    <button
                      onClick={() => alert("Select folder interface - WIP")}
                      className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-[10px] font-black tracking-widest uppercase transition-all shadow-xl shadow-indigo-900/20 active:scale-95"
                    >
                      Browse
                    </button>
                  </div>
                  <p className="text-[10px] text-white/10 pl-2 max-w-sm italic">Application scans Desktop and Parent folder by default. Use Browse to define a custom module sector.</p>
                </div>
              </section>

              <section className="pt-10 border-t border-white/5">
                <button className="text-[10px] text-indigo-500 font-black uppercase tracking-[0.5em] hover:text-indigo-400 transition-colors"> Reset All Modules </button>
              </section>
            </div>
          ) : (
            <ScriptTree
              filterTag={activeTab}
              viewMode={viewMode === "hub" ? "hub" : "tree"}
              onTagsLoaded={(tags) => setUserTags(tags)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
