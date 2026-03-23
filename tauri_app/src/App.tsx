import { useState } from "react";
import ScriptTree from "./components/ScriptTree";
import "./App.css";

function App() {
  const [activeTab, setActiveTab] = useState("Все скрипты");

  return (
    <div className="flex h-screen w-full bg-[#1A1A1A] text-white">
      {/* Sidebar */}
      <div className="w-56 flex flex-col p-4 space-y-4 border-r border-[#333]">
        <h2 className="text-xl font-bold tracking-tight mb-2">Обзор</h2>
        <ul className="space-y-1">
          {["Все скрипты", "Без тегов", "Скрытые"].map((item) => (
            <li
              key={item}
              className={`px-3 py-2 rounded-md cursor-pointer transition-colors ${activeTab === item ? "bg-blue-600 font-semibold" : "hover:bg-[#333]"
                }`}
              onClick={() => setActiveTab(item)}
            >
              {item}
            </li>
          ))}
        </ul>

        <h2 className="text-xl font-bold tracking-tight mt-6 mb-2 text-green-400">Статус</h2>
        <ul className="space-y-1">
          <li
            className={`px-3 py-2 rounded-md cursor-pointer transition-colors ${activeTab === "Запущенные" ? "bg-green-600 font-semibold" : "hover:bg-[#333]"
              }`}
            onClick={() => setActiveTab("Запущенные")}
          >
            Запущенные
          </li>
        </ul>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-8 flex flex-col">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">{activeTab}</h1>
          <button className="px-4 py-2 bg-[#333] hover:bg-[#444] rounded-md transition-colors text-sm font-medium">
            Обновить древо
          </button>
        </div>

        <div className="flex-1 bg-[#222] rounded-xl border border-[#333] p-4 flex flex-col overflow-y-auto">
          <ScriptTree filterTag={activeTab} />
        </div>
      </div>
    </div>
  );
}

export default App;
