import { useState } from "react";
import ScriptTree from "./components/ScriptTree";
import "./App.css";

function App() {
  const [activeTab, setActiveTab] = useState("Все скрипты");
  const [userTags, setUserTags] = useState<string[]>([]);

  return (
    <div className="flex h-screen w-full bg-[#1A1A1A] text-white">
      {/* Sidebar */}
      <div className="w-64 flex flex-col p-6 space-y-6 border-r border-white/5 bg-[#141414] overflow-y-auto">
        <div>
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-[0.2em] mb-4">Обзор</h2>
          <ul className="space-y-1">
            {["Все скрипты", "С тегами", "Без тегов", "Скрытые"].map((item) => (
              <li
                key={item}
                className={`px-4 py-2.5 rounded-lg cursor-pointer text-sm font-medium transition-all ${activeTab === item
                    ? "bg-blue-600 shadow-lg shadow-blue-900/40 text-white"
                    : "text-gray-400 hover:bg-white/5 hover:text-white"
                  }`}
                onClick={() => setActiveTab(item)}
              >
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-[0.2em] mb-4">Ваши теги</h2>
          <ul className="space-y-1">
            {userTags.length === 0 && <li className="text-gray-600 text-xs italic px-4">Нет тегов</li>}
            {userTags.map((tag) => (
              <li
                key={tag}
                className={`px-4 py-2.5 rounded-lg cursor-pointer text-sm font-medium truncate transition-all ${activeTab === tag
                    ? "bg-indigo-600 shadow-lg shadow-indigo-900/20 text-white border border-white/10"
                    : "text-gray-500 hover:bg-white/5 hover:text-white"
                  }`}
                onClick={() => setActiveTab(tag)}
              >
                <span className="mr-2 text-indigo-400 font-mono">#</span>
                {tag}
              </li>
            ))}
          </ul>
        </div>

        <div className="pt-4 border-t border-white/5">
          <h2 className="text-xs font-bold text-green-500/60 uppercase tracking-[0.2em] mb-4">Статус</h2>
          <ul className="space-y-1">
            <li
              className={`px-4 py-2.5 rounded-lg cursor-pointer text-sm font-bold transition-all flex items-center justify-between ${activeTab === "Запущенные"
                  ? "bg-green-600 text-white"
                  : "text-gray-500 hover:bg-white/5 hover:text-green-400"
                }`}
              onClick={() => setActiveTab("Запущенные")}
            >
              Запущенные
              {activeTab !== "Запущенные" && <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-ping"></div>}
            </li>
          </ul>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-10 flex flex-col overflow-hidden bg-gradient-to-br from-[#1A1A1A] to-[#121212]">
        <div className="flex justify-between items-center mb-10">
          <div className="flex flex-col">
            <h1 className="text-4xl font-extrabold tracking-tight">{activeTab}</h1>
            <p className="text-sm text-gray-500 mt-1 uppercase tracking-widest font-mono">Workstation Management</p>
          </div>
          <button
            className="px-6 py-2.5 bg-white/5 hover:bg-white/10 rounded-full border border-white/10 transition-all text-xs font-bold tracking-widest uppercase hover:scale-105 active:scale-95"
            onClick={() => window.location.reload()}
          >
            Refresh
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pr-4 scrollbar-thin scrollbar-thumb-white/10">
          <ScriptTree filterTag={activeTab} onTagsLoaded={(tags) => setUserTags(tags)} />
        </div>
      </div>
    </div>
  );
}

export default App;
