import { useState, useEffect, useMemo } from "react";
import { getScripts, Script, runScript, killScript } from "../api";

interface ScriptTreeProps {
    filterTag: string;
    onTagsLoaded: (tags: string[]) => void;
    viewMode: "tree" | "hub";
}

interface TreeNode {
    name: string;
    fullName: string;
    scripts: Script[];
    children: Record<string, TreeNode>;
}

export default function ScriptTree({ filterTag, onTagsLoaded, viewMode }: ScriptTreeProps) {
    const [allScripts, setAllScripts] = useState<Script[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
    const [isAllExpanded, setIsAllExpanded] = useState(false);

    const fetchData = async () => {
        try {
            const data = await getScripts();
            setAllScripts(data);
            const tags = new Set<string>();
            data.forEach(s => s.tags.forEach(t => tags.add(t)));
            onTagsLoaded(Array.from(tags).sort());
        } catch (e) {
            // error silencer
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

    const filtered = useMemo(() => {
        if (viewMode === "hub") {
            return allScripts.filter(s => s.is_running || s.tags.some(t => t.toLowerCase() === "hub" || t.toLowerCase() === "fav"));
        }
        if (filterTag === "Запущенные") return allScripts.filter(s => s.is_running);
        if (filterTag === "Без тегов") return allScripts.filter(s => s.tags.length === 0 && !s.is_hidden);
        if (filterTag === "Скрытые") return allScripts.filter(s => s.is_hidden);
        if (filterTag === "С тегами") return allScripts.filter(s => s.tags.length > 0 && !s.is_hidden);
        if (filterTag !== "Все скрипты" && filterTag !== "ХАБ" && filterTag !== "") {
            return allScripts.filter(s => s.tags.includes(filterTag));
        }
        return allScripts.filter(s => !s.is_hidden);
    }, [allScripts, filterTag, viewMode]);

    const tree = useMemo(() => {
        const root: TreeNode = { name: "Root", fullName: "Root", scripts: [], children: {} };
        filtered.forEach(script => {
            const pathParts = script.path.split("\\");
            const desktopIdx = pathParts.findIndex(p => p === "Desktop");
            const startIdx = desktopIdx !== -1 ? desktopIdx : 0;
            let current = root;
            for (let i = startIdx; i < pathParts.length - 1; i++) {
                const part = pathParts[i];
                if (!current.children[part]) {
                    current.children[part] = { name: part, fullName: pathParts.slice(0, i + 1).join("\\"), scripts: [], children: {} };
                }
                current = current.children[part];
            }
            current.scripts.push(script);
        });
        return root;
    }, [filtered]);

    const toggleAll = () => {
        const nextState = !isAllExpanded;
        const next: Record<string, boolean> = {};
        const traverse = (node: TreeNode) => {
            if (node.name !== "Root") next[node.fullName] = nextState;
            Object.values(node.children).forEach(traverse);
        };
        traverse(tree);
        setExpandedFolders(next);
        setIsAllExpanded(nextState);
    };

    const renderNode = (node: TreeNode, depth: number = 0) => {
        const isExpanded = expandedFolders[node.fullName] || depth === 0;

        return (
            <div key={node.fullName} className="flex flex-col overflow-hidden">
                {node.name !== "Root" && (
                    <div
                        onClick={() => toggleFolder(node.fullName)}
                        className="flex items-center space-x-3 py-1.5 hover:bg-white/5 rounded-lg cursor-pointer group px-2 z-10 relative transition-colors"
                        style={{ backgroundColor: 'var(--bg-primary)' }}
                    >
                        <div className={`w-3 h-3 flex items-center justify-center transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`}>
                            <svg width="6" height="6" viewBox="0 0 6 6" className="fill-white/20 group-hover:fill-white transition-colors"><path d="M0 0L6 3L0 6V0Z" /></svg>
                        </div>
                        <span className={`text-[12px] font-black uppercase tracking-[0.2em] transition-colors ${isExpanded ? 'text-white' : 'text-white/20'} group-hover:text-white`}>{node.name}</span>
                    </div>
                )}

                {/* Animated container */}
                <div className={`grid transition-all duration-300 ease-in-out relative ${isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                    <div className="overflow-hidden">
                        {/* Clickable vertical line (Indentation Guide) */}
                        {node.name !== "Root" && isExpanded && (
                            <div
                                onClick={() => toggleFolder(node.fullName)}
                                className="absolute left-[13px] top-0 bottom-4 w-5 -ml-2.5 cursor-pointer group/line z-20 hover:bg-white/[0.05] transition-colors rounded-full"
                                title={`Collapse ${node.name}`}
                            >
                                <div
                                    className="absolute left-[9px] top-0 bottom-0 w-[1px] transition-colors shadow-2xl"
                                    style={{ backgroundColor: 'var(--border-color)' }}
                                ></div>
                            </div>
                        )}

                        <div className={`${node.name !== "Root" ? 'pl-6 ml-2.5 mb-1 mt-0.5' : ''} space-y-0.5 relative`}>
                            {Object.values(node.children).sort((a, b) => a.name.localeCompare(b.name)).map(child => renderNode(child, depth + 1))}
                            {node.scripts.sort((a, b) => a.filename.localeCompare(b.filename)).map(s => (
                                <div
                                    key={s.path}
                                    className="flex items-center justify-between p-2.5 px-3.5 hover:bg-white/10 rounded-xl group transition-all"
                                    title={s.path}
                                >
                                    <div className="flex items-center space-x-4 overflow-hidden">
                                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.is_running ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-white/10'}`}></div>
                                        <span className={`text-[13px] font-medium tracking-tight truncate ${s.is_running ? 'text-green-400 font-black' : 'text-white/50 group-hover:text-white'}`}>{s.filename}</span>
                                    </div>
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => handleToggle(s)} className={`text-[9px] font-black px-3 py-1.5 rounded-lg bg-white/5 border border-white/5 shadow-xl transition-all active:scale-90 tracking-widest ${s.is_running ? 'text-red-500 hover:bg-red-500 hover:text-white' : 'text-indigo-400 hover:bg-indigo-500 hover:text-white'}`}>
                                            {s.is_running ? "KILL" : "RUN"}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    if (loading) return <div className="p-10 text-center text-white/10 font-black text-xs tracking-[0.5em] animate-pulse uppercase">Syncing Uplink...</div>;

    return (
        <div className="flex flex-col space-y-4">
            {viewMode === "tree" && (
                <div className="flex justify-start pl-1 mb-2 pb-2 border-b" style={{ borderColor: 'var(--border-color)' }}>
                    <button
                        onClick={toggleAll}
                        className="p-2 hover:bg-white/10 rounded-xl transition-all group flex flex-col items-center justify-center space-y-1 h-12 w-12"
                    >
                        <svg width="22" height="12" viewBox="0 0 24 12" fill="none"
                            className={`stroke-white/30 group-hover:stroke-indigo-400 transition-all duration-400 transform 
                                  ${isAllExpanded ? 'rotate-180' : 'rotate-0'}`}
                            strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 9l7-7 7 7" />
                        </svg>
                        <svg width="22" height="12" viewBox="0 0 24 12" fill="none"
                            className={`stroke-white/30 group-hover:stroke-indigo-400 transition-all duration-400 transform 
                                  ${isAllExpanded ? 'rotate-180' : 'rotate-0'}`}
                            strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 3l7 7 7-7" />
                        </svg>
                    </button>
                </div>
            )}

            {viewMode === "hub" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                    {filtered.length === 0 && <div className="text-white/10 col-span-3 text-center py-40 italic tracking-[0.3em] text-xs uppercase font-black">Void Channel...</div>}
                    {filtered.map(s => (
                        <div
                            key={s.path}
                            className={`group p-6 rounded-[2rem] border transition-all flex flex-col justify-between h-52 backdrop-blur-xl ${s.is_running ? 'border-white/20' : 'hover:border-white/15'}`}
                            style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: s.is_running ? 'var(--accent-indigo)' : 'var(--border-color)' }}
                        >
                            <div className="flex justify-between items-start">
                                <div className="flex flex-col overflow-hidden">
                                    <span className="text-xl font-black truncate pr-4 text-white group-hover:text-indigo-400 transition-colors tracking-tight">{s.filename}</span>
                                    <span className="text-[10px] text-white/20 font-black uppercase tracking-[0.3em] mt-2 underline decoration-white/5 underline-offset-4">{s.parent}</span>
                                </div>
                                <div className={`w-3 h-3 rounded-full mt-2 transition-all ${s.is_running ? 'bg-green-500 shadow-[0_0_20px_rgba(34,197,94,0.6)]' : 'bg-white/5 border border-white/10'}`}></div>
                            </div>
                            <div className="flex flex-wrap gap-1.5 mt-2">
                                {s.tags.map(t => <span key={t} className="text-[10px] px-2.5 py-0.5 border rounded-full text-white/20 font-black uppercase tracking-widest group-hover:text-white/40" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}>#{t}</span>)}
                            </div>
                            <button onClick={() => handleToggle(s)} className={`w-full py-3.5 rounded-2xl text-[10px] font-black tracking-[0.3em] transition-all transform active:scale-95 mt-4 ${s.is_running ? "bg-red-600/10 text-red-500 border border-red-500/20 hover:bg-red-600 hover:text-white" : "bg-white text-black hover:bg-gray-100 shadow-xl"}`}>
                                {s.is_running ? "KILL" : "RUN"}
                            </button>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="flex flex-col space-y-0.5 select-none pr-4 scrollbar-hide">
                    {renderNode(tree)}
                </div>
            )}
        </div>
    );
}
