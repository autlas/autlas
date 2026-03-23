import { useState } from "react";
import ScriptTree from "./components/ScriptTree";
import "./App.css";

function App() {
  const [activeTab, setActiveTab] = useState("ХАБ");
  const [userTags, setUserTags] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<"tree" | "hub">("hub");

  const handleTabClick = (tab: string) => {
    setActiveTab(tab);
    if (tab === "ХАБ") {
      setViewMode("hub");
    } else {
      setViewMode("tree");
    }
  };

  return (
    <div className="flex h-screen w-full bg-[#0A0A0A] text-white">
      {/* Sidebar */}
      <div className="w-60 flex flex-col p-6 space-y-8 border-r border-white/5 bg-[#0C0C0C] overflow-y-auto">
        <div>
          <h2 className="text-[10px] font-bold text-gray-600 uppercase tracking-[0.3em] mb-4">Главное</h2>
          <ul className="space-y-1">
            <li
              className={`px-4 py-3 rounded-xl cursor-pointer text-sm font-black transition-all flex items-center justify-between ${activeTab === "ХАБ"
                  ? "bg-gradient-to-r from-indigo-600 to-purple-600 shadow-lg shadow-indigo-900/40 text-white"
                  : "text-gray-500 hover:bg-white/5 hover:text-white"
                }`}
              onClick={() => handleTabClick("ХАБ")}
            >
              🚀 ХАБ
              {activeTab !== "ХАБ" && <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>}
            </li>
            <li
              className={`px-4 py-3 rounded-xl cursor-pointer text-sm font-medium transition-all ${activeTab === "Все скрипты"
                  ? "bg-blue-600/20 border border-blue-500/50 text-blue-400"
                  : "text-gray-500 hover:bg-white/5 hover:text-white"
                }`}
              onClick={() => handleTabClick("Все скрипты")}
            >
              📁 ДЕРЕВО
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-[10px] font-bold text-gray-600 uppercase tracking-[0.3em] mb-4">Фильтры</h2>
          <ul className="space-y-1">
            {["С тегами", "Без тегов", "Скрытые", "Запущенные"].map((item) => (
              <li
                key={item}
                className={`px-4 py-2 rounded-lg cursor-pointer text-xs font-medium transition-all ${activeTab === item
                    ? "bg-white/10 text-white border border-white/10 shadow-sm"
                    : "text-gray-600 hover:bg-white/5 hover:text-gray-300"
                  }`}
                onClick={() => handleTabClick(item)}
              >
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex-1">
          <h2 className="text-[10px] font-bold text-gray-600 uppercase tracking-[0.3em] mb-4">Теги из INI</h2>
          <ul className="space-y-1">
            {userTags.map((tag) => (
              <li
                key={tag}
                className={`px-4 py-2 rounded-lg cursor-pointer text-xs transition-all flex items-center space-x-2 truncate opacity-70 hover:opacity-100 ${activeTab === tag
                    ? "bg-blue-600/10 text-blue-400 font-bold border border-blue-500/20"
                    : "text-gray-600 hover:text-white"
                  }`}
                onClick={() => handleTabClick(tag)}
              >
                <div className="w-1 h-1 bg-current rounded-full"></div>
                <span>#{tag}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="pt-4 border-t border-white/5">
          <div className="p-4 bg-white/5 rounded-2xl border border-white/5 text-[10px] text-gray-500 italic">
            AHK Manager v2.0 <br />
            Tauri + React Stack
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-12 flex flex-col overflow-hidden bg-gradient-to-br from-[#0A0A0A] to-[#121212]">
        <div className="flex justify-between items-end mb-12">
          <div className="flex flex-col">
            <h1 className="text-5xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-500">
              {activeTab}
            </h1>
            <div className="flex items-center space-x-2 mt-2">
              <div className="h-1 w-12 bg-indigo-500 rounded-full"></div>
              <span className="text-[10px] text-gray-600 uppercase tracking-[0.4em] font-mono">Operations Hub</span>
            </div>
          </div>

          <div className="flex space-x-3">
            <button
              className="px-6 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-all text-xs font-bold tracking-widest uppercase active:scale-95"
              onClick={() => {
                const active = activeTab;
                setActiveTab("");
                setTimeout(() => setActiveTab(active), 10);
              }}
            >
              Sync
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-6 custom-scrollbar">
          <ScriptTree
            filterTag={activeTab}
            viewMode={viewMode}
            onTagsLoaded={(tags) => setUserTags(tags)}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
