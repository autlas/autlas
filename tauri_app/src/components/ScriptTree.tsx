import { useState, useEffect, useMemo } from "react";
import { getScripts, Script, runScript, killScript } from "../api";

interface ScriptTreeProps {
    filterTag: string;
    onTagsLoaded: (tags: string[]) => void;
    viewMode: "tree" | "hub";
}

interface TreeNode {
    name: string;
    scripts: Script[];
    children: Record<string, TreeNode>;
}

export default function ScriptTree({ filterTag, onTagsLoaded, viewMode }: ScriptTreeProps) {
    const [allScripts, setAllScripts] = useState<Script[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({ "Root": true });

    const fetchData = async () => {
        try {
            const data = await getScripts();
            setAllScripts(data);
            const tags = new Set<string>();
            data.forEach(s => s.tags.forEach(t => tags.add(t)));
            onTagsLoaded(Array.from(tags).sort());
        } catch (e) {
            console.error("Error:", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 3000);
        return () => clearInterval(interval);
    }, []);

    const toggleFolder = (path: string) => {
        setExpandedFolders(prev => ({ ...prev, [path]: !prev[path] }));
    };

    const handleToggle = async (script: Script) => {
        try {
            if (script.is_running) {
                await killScript(script.path);
            } else {
                await runScript(script.path);
            }
            fetchData();
        } catch (e) {
            console.error(e);
        }
    };

    // 1. Filter scripts
    const filtered = useMemo(() => {
        if (viewMode === "hub") {
            // Hub logic: All running OR Favorite (has #fav or #hub tag)
            return allScripts.filter(s => s.is_running || s.tags.some(t => t.toLowerCase() === "hub" || t.toLowerCase() === "fav"));
        }

        if (filterTag === "Запущенные") return allScripts.filter(s => s.is_running);
        if (filterTag === "Без тегов") return allScripts.filter(s => s.tags.length === 0 && !s.is_hidden);
        if (filterTag === "Скрытые") return allScripts.filter(s => s.is_hidden);
        if (filterTag === "С тегами") return allScripts.filter(s => s.tags.length > 0 && !s.is_hidden);
        if (filterTag !== "Все скрипты" && filterTag !== "") {
            return allScripts.filter(s => s.tags.includes(filterTag));
        }
        return allScripts.filter(s => !s.is_hidden);
    }, [allScripts, filterTag, viewMode]);

    // 2. Build Tree Structure
    const tree = useMemo(() => {
        const root: TreeNode = { name: "Root", scripts: [], children: {} };

        filtered.forEach(script => {
            // Very simple parent-based grouping for MVP, but can be expanded to full path splitted tree
            const folderName = script.parent || "Common";
            if (!root.children[folderName]) {
                root.children[folderName] = { name: folderName, scripts: [], children: {} };
            }
            root.children[folderName].scripts.push(script);
        });
        return root;
    }, [filtered]);

    if (loading) {
        return <div className="p-8 text-center text-gray-500 animate-pulse">Загрузка древа...</div>;
    }

    if (viewMode === "hub") {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.length === 0 && <div className="text-gray-600 col-span-3 text-center py-20 italic">Хаб пуст. Запустите скрипт или добавьте тег #hub.</div>}
                {filtered.map(s => (
                    <div key={s.path} className={`p-5 rounded-2xl border transition-all flex flex-col justify-between h-40 ${s.is_running ? 'bg-green-500/10 border-green-500/30' : 'bg-white/5 border-white/10'}`}>
                        <div className="flex justify-between items-start">
                            <div className="flex flex-col">
                                <span className="text-lg font-bold truncate pr-4">{s.filename}</span>
                                <span className="text-[10px] text-gray-500 uppercase tracking-widest">{s.parent}</span>
                            </div>
                            <div className={`w-3 h-3 rounded-full ${s.is_running ? 'bg-green-500 animate-pulse' : 'bg-gray-700'}`}></div>
                        </div>
                        <button
                            onClick={() => handleToggle(s)}
                            className={`w-full py-2.5 rounded-xl text-xs font-black tracking-widest transition-all ${s.is_running ? "bg-red-500 text-white hover:bg-red-600 shadow-lg shadow-red-900/20" : "bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-900/20"
                                }`}
                        >
                            {s.is_running ? "STOP" : "RUN"}
                        </button>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="flex flex-col space-y-2 select-none">
            {Object.values(tree.children).map(node => (
                <div key={node.name} className="flex flex-col">
                    <div
                        onClick={() => toggleFolder(node.name)}
                        className="flex items-center space-x-2 p-2 hover:bg-white/5 rounded-md cursor-pointer group"
                    >
                        <span className={`transition-transform duration-200 ${expandedFolders[node.name] ? 'rotate-90' : ''}`}>
                            ▶
                        </span>
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest group-hover:text-blue-400">
                            {node.name}
                        </span>
                        <span className="text-[10px] text-gray-600 font-mono">({node.scripts.length})</span>
                    </div>

                    {expandedFolders[node.name] && (
                        <div className="pl-6 border-l border-white/5 ml-3 mt-1 space-y-1">
                            {node.scripts.map(s => (
                                <div
                                    key={s.path}
                                    className="flex items-center justify-between p-2 hover:bg-white/5 rounded-md group transition-colors"
                                >
                                    <div className="flex items-center space-x-3 overflow-hidden">
                                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.is_running ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-gray-700'}`}></div>
                                        <span className={`text-sm truncate ${s.is_running ? 'text-green-400 font-medium' : 'text-gray-300'}`}>
                                            {s.filename}
                                        </span>
                                    </div>
                                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => handleToggle(s)}
                                            className={`text-[10px] font-bold px-3 py-1 rounded border transition-all ${s.is_running ? 'border-red-500/30 text-red-500 hover:bg-red-500 hover:text-white' : 'border-blue-500/30 text-blue-500 hover:bg-blue-500 hover:text-white'
                                                }`}
                                        >
                                            {s.is_running ? "OFF" : "ON"}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
