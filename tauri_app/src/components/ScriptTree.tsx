import { useState, useEffect } from "react";
import { getScripts, Script, runScript, killScript } from "../api";

interface ScriptTreeProps {
    filterTag: string;
    onTagsLoaded: (tags: string[]) => void;
}

export default function ScriptTree({ filterTag, onTagsLoaded }: ScriptTreeProps) {
    const [allScripts, setAllScripts] = useState<Script[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        try {
            const data = await getScripts();
            setAllScripts(data);

            // Extract unique tags and notify App.tsx
            const tags = new Set<string>();
            data.forEach(s => s.tags.forEach(t => tags.add(t)));
            onTagsLoaded(Array.from(tags).sort());

        } catch (e) {
            console.error("Error fetching scripts:", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 3000);
        return () => clearInterval(interval);
    }, []);

    const handleToggle = async (script: Script) => {
        try {
            if (script.is_running) {
                await killScript(script.path);
            } else {
                await runScript(script.path);
            }
            fetchData(); // Immediate refresh attempt
        } catch (e) {
            console.error("Error toggling script:", e);
        }
    };

    // Filter logic
    let filtered = allScripts;
    if (filterTag === "Запущенные") {
        filtered = allScripts.filter(s => s.is_running);
    } else if (filterTag === "Без тегов") {
        filtered = allScripts.filter(s => s.tags.length === 0 && !s.is_hidden);
    } else if (filterTag === "Скрытые") {
        filtered = allScripts.filter(s => s.is_hidden);
    } else if (filterTag === "С тегами") {
        filtered = allScripts.filter(s => s.tags.length > 0 && !s.is_hidden);
    } else if (filterTag !== "Все скрипты" && filterTag !== "") {
        // Treat as individual tag
        filtered = allScripts.filter(s => s.tags.includes(filterTag));
    } else {
        // "Все скрипты" - show everything except hidden
        filtered = allScripts.filter(s => !s.is_hidden);
    }

    if (loading) {
        return <div className="p-8 text-center text-gray-500 animate-pulse">Инициализация бэкенда...</div>;
    }

    // Simple folder grouping for now (not full recursive tree yet, but organized)
    const grouped: Record<string, Script[]> = {};
    filtered.forEach(s => {
        if (!grouped[s.parent]) grouped[s.parent] = [];
        grouped[s.parent].push(s);
    });

    return (
        <div className="flex flex-col space-y-6">
            {Object.entries(grouped).map(([folder, scripts]) => (
                <div key={folder} className="flex flex-col">
                    <div className="flex items-center space-x-2 text-gray-400 mb-2 px-1">
                        <span className="text-xs font-bold uppercase tracking-widest">{folder || "Root / Desktop"}</span>
                        <div className="h-[1px] flex-1 bg-[#333]"></div>
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                        {scripts.map((s) => (
                            <div
                                key={s.path}
                                className={`flex items-center justify-between p-3 rounded-lg border transition-all group ${s.is_running
                                        ? "bg-green-500/5 border-green-500/10 hover:border-green-500/30"
                                        : "bg-[#252525] border-[#333] hover:border-[#444]"
                                    }`}
                            >
                                <div className="flex items-center space-x-4">
                                    <div className="flex-shrink-0">
                                        {s.is_running ? (
                                            <div className="w-3 h-3 bg-green-500 rounded-full shadow-[0_0_10px_rgba(34,197,94,0.5)]"></div>
                                        ) : (
                                            <div className="w-3 h-3 bg-[#444] rounded-full"></div>
                                        )}
                                    </div>
                                    <div className="flex flex-col overflow-hidden">
                                        <span className={`text-base font-semibold truncate ${s.is_running ? "text-green-400" : "text-gray-200"}`}>
                                            {s.filename}
                                        </span>
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {s.tags.map(t => (
                                                <span key={t} className="text-[10px] px-1.5 py-0.5 bg-[#333] text-gray-400 rounded-sm">
                                                    #{t}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex-shrink-0 ml-4">
                                    <button
                                        onClick={() => handleToggle(s)}
                                        className={`px-4 py-1.5 rounded-md text-xs font-bold tracking-tighter transition-all ${s.is_running
                                                ? "bg-red-600/10 text-red-500 border border-red-600/20 hover:bg-red-600 hover:text-white"
                                                : "bg-blue-600/10 text-blue-400 border border-blue-600/20 hover:bg-blue-600 hover:text-white"
                                            }`}
                                    >
                                        {s.is_running ? "ОСТАНОВИТЬ" : "ЗАПУСТИТЬ"}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
