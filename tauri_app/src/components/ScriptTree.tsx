import { useState, useEffect, useMemo } from "react";
import { getScripts, Script, runScript, killScript } from "../api";
import { invoke } from "@tauri-apps/api/core";

interface ScriptTreeProps {
    filterTag: string;
    onTagsLoaded: (tags: string[]) => void;
    viewMode: "tree" | "hub";
    onCustomDragStart: (script: { path: string, filename: string, x: number, y: number }) => void;
    isDragging: boolean;
}

interface TreeNode {
    name: string;
    fullName: string;
    scripts: Script[];
    children: Record<string, TreeNode>;
}

export default function ScriptTree({ filterTag, onTagsLoaded, viewMode, onCustomDragStart, isDragging }: ScriptTreeProps) {
    const [allScripts, setAllScripts] = useState<Script[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
    const [isAllExpanded, setIsAllExpanded] = useState(true);
    const [editingScript, setEditingScript] = useState<string | null>(null);
    const [tempTags, setTempTags] = useState("");

    const fetchData = async () => {
        try {
            const data = await getScripts();
            setAllScripts(data);
            const tags = new Set<string>();
            data.forEach(s => s.tags.forEach(t => tags.add(t)));
            onTagsLoaded(Array.from(tags).sort());
        } catch (e) {
            // silence
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
        setExpandedFolders(prev => {
            const current = prev[path] !== false;
            return { ...prev, [path]: !current };
        });
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

    const startEditing = (s: Script) => {
        setEditingScript(s.path);
        setTempTags(s.tags.join(", "));
    };

    const saveTags = async (path: string) => {
        const tagsArr = tempTags.split(",").map(t => t.trim()).filter(t => t !== "");
        try {
            await invoke("save_script_tags", { path, tags: tagsArr });
            setEditingScript(null);
            fetchData();
        } catch (e) {
            console.error(e);
        }
    };

    const handleCustomMouseDown = (e: React.MouseEvent, s: Script) => {
        if (e.button !== 0) return;
        const target = e.target as HTMLElement;
        if (target.closest('button') || target.closest('input')) return;

        e.preventDefault();
        onCustomDragStart({ path: s.path, filename: s.filename, x: e.clientX, y: e.clientY });
    };

    const filtered = useMemo(() => {
        if (viewMode === "hub") {
            return allScripts.filter(s => s.is_running || s.tags.some(t => t.toLowerCase() === "hub" || t.toLowerCase() === "fav"));
        }

        let list = [...allScripts];
        const tag = filterTag.toLowerCase();

        if (tag === "запущенные") list = list.filter(s => s.is_running);
        else if (tag === "без тегов") list = list.filter(s => s.tags.length === 0 && !s.is_hidden);
        else if (tag === "скрытые") list = list.filter(s => s.is_hidden);
        else if (tag === "с тегами") list = list.filter(s => s.tags.length > 0 && !s.is_hidden);
        else if (tag !== "все скрипты" && tag !== "дерево" && tag !== "хаб" && tag !== "") {
            list = list.filter(s => s.tags.includes(filterTag));
        } else {
            list = list.filter(s => !s.is_hidden);
        }
        return list;
    }, [allScripts, filterTag, viewMode]);

    const tree = useMemo(() => {
        const root: TreeNode = { name: "Root", fullName: "Root", scripts: [], children: {} };
        filtered.forEach(script => {
            const pathParts = script.path.split(/[\\/]/);
            const desktopIdx = pathParts.findIndex(p => p === "Desktop");
            const ahkIdx = pathParts.findIndex(p => p === "AHKmanager");

            let startIdx = 0;
            if (desktopIdx !== -1) startIdx = desktopIdx;
            else if (ahkIdx !== -1) startIdx = ahkIdx;

            let current = root;
            for (let i = startIdx; i < pathParts.length - 1; i++) {
                const part = pathParts[i];
                if (!part) continue;
                if (!current.children[part]) {
                    current.children[part] = {
                        name: part,
                        fullName: pathParts.slice(0, i + 1).join("\\"),
                        scripts: [],
                        children: {}
                    };
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
        const isExpanded = depth === 0 || expandedFolders[node.fullName] !== false;

        return (
            <div key={node.fullName} className="flex flex-col overflow-hidden">
                {node.name !== "Root" && (
                    <div
                        onClick={() => !isDragging && toggleFolder(node.fullName)}
                        className={`flex items-center space-x-2 h-[32px] rounded-lg z-10 relative transition-all mb-0.5 border border-transparent
              ${!isDragging ? 'bg-white/[0.015] hover:bg-white/[0.05] cursor-pointer group' : 'bg-transparent text-white/30 cursor-default'}
            `}
                    >
                        <div className={`w-4 h-4 flex items-center justify-center transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`}>
                            <svg width="6" height="6" viewBox="0 0 6 6" className={`transition-colors ${isExpanded && !isDragging ? 'fill-white/20' : 'fill-white/5'} ${!isDragging && 'group-hover:fill-white'}`}><path d="M0 0L6 3L0 6V0Z" /></svg>
                        </div>
                        <span className={`text-[14px] font-bold transition-colors ${isExpanded && !isDragging ? 'text-white' : 'text-white/20'} ${!isDragging && 'group-hover:text-white'}`}>{node.name}</span>
                    </div>
                )}

                <div className={`grid transition-all duration-300 ease-in-out relative ${isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                    <div className="overflow-hidden">
                        {node.name !== "Root" && isExpanded && (
                            <div
                                onClick={() => !isDragging && toggleFolder(node.fullName)}
                                className={`absolute left-[13px] top-0 bottom-4 w-5 -ml-2.5 z-20 transition-colors rounded-full ${!isDragging ? 'cursor-pointer group/line hover:bg-white/[0.05]' : ''}`}
                            >
                                <div className={`absolute left-[9px] top-0 bottom-0 w-[1px] transition-colors shadow-2xl ${isDragging ? 'bg-white/5' : 'bg-white/10'}`}></div>
                            </div>
                        )}

                        <div className={`${node.name !== "Root" ? 'pl-5 ml-2.5 mb-0.5 mt-0.5' : ''} space-y-0.5 relative`}>
                            {Object.values(node.children).sort((a, b) => a.name.localeCompare(b.name)).map(child => renderNode(child, depth + 1))}
                            {node.scripts.sort((a, b) => a.filename.localeCompare(b.filename)).map(s => (
                                <div
                                    key={s.path}
                                    onMouseDown={(e) => handleCustomMouseDown(e, s)}
                                    className={`flex items-center justify-between h-[32px] px-3 rounded-lg transition-all border border-transparent select-none
                    ${!isDragging ? 'hover:bg-white/5 group cursor-grab active:cursor-grabbing active:scale-[0.99]' : 'bg-transparent cursor-default opacity-40'}
                  `}
                                >
                                    <div className="flex items-center space-x-4 overflow-hidden flex-1 mr-4 pointer-events-none">
                                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.is_running ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.6)]' : 'bg-white/10'}`}></div>
                                        <span className={`text-[15px] font-medium tracking-tight truncate flex-1 ${s.is_running ? 'text-green-400 font-bold' : 'text-white/50 group-hover:text-white'}`}>{s.filename}</span>

                                        {!isDragging && (
                                            editingScript === s.path ? (
                                                <div className="flex items-center space-x-2 flex-shrink-0 pointer-events-auto">
                                                    <input
                                                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-1 text-xs text-white outline-none w-[150px]"
                                                        value={tempTags}
                                                        onChange={(e) => setTempTags(e.target.value)}
                                                        autoFocus
                                                        onKeyDown={(e) => e.key === "Enter" && saveTags(s.path)}
                                                    />
                                                    <button onClick={() => saveTags(s.path)} className="text-[12px] font-bold text-indigo-400">Сохранить</button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center space-x-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity pr-2">
                                                    {s.tags.map(t => (
                                                        <span key={t} className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-white/5 text-indigo-400 border border-white/5 cursor-default shadow-lg pointer-events-auto">
                                                            {t}
                                                        </span>
                                                    ))}
                                                    <button onClick={() => startEditing(s)} className="w-[30px] h-[30px] ml-1 flex items-center justify-center rounded-lg bg-white/5 text-white/20 border border-white/5 hover:text-indigo-400 hover:bg-white/10 transition-colors shadow-lg group/plus cursor-pointer pointer-events-auto">
                                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                                    </button>
                                                </div>
                                            )
                                        )}
                                    </div>

                                    {!isDragging && (
                                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center space-x-2 pointer-events-auto">
                                            <button onClick={() => handleToggle(s)} className={`text-[12px] font-bold px-4 py-1.5 rounded-lg bg-white/5 border border-white/5 shadow-xl transition-all cursor-pointer active:scale-95 ${s.is_running ? 'text-red-500 hover:bg-red-500 hover:text-white' : 'text-indigo-400 hover:bg-indigo-500 hover:text-white'}`}>
                                                {s.is_running ? "Kill" : "Run"}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    if (loading) return <div className="p-10 text-center text-white/10 font-bold text-xs tracking-[0.5em] animate-pulse uppercase">Syncing Uplink...</div>;

    const hasContent = Object.keys(tree.children).length > 0 || tree.scripts.length > 0;

    return (
        <div className="flex flex-col space-y-1">
            {viewMode === "tree" && (
                <div className="flex justify-start pl-1 mb-2 pb-2 border-b" style={{ borderColor: 'var(--border-color)' }}>
                    <button
                        onClick={toggleAll}
                        className={`p-2 transition-all h-12 w-12 flex flex-col items-center justify-center border-none shadow-none bg-transparent focus:outline-none relative cursor-pointer ${!isDragging ? 'group/toggle' : 'opacity-10 cursor-default'}`}
                    >
                        <div className="flex flex-col items-center space-y-[5px]">
                            <svg width="22" height="10" viewBox="0 0 24 10" fill="none"
                                className={`transition-all duration-500 ease-in-out stroke-white/20 ${!isDragging && 'group-hover/toggle:stroke-indigo-400'} ${isAllExpanded ? 'rotate-180' : ''}`}
                                strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M5 8l7-7 7 7" />
                            </svg>
                            <svg width="22" height="10" viewBox="0 0 24 10" fill="none"
                                className={`transition-all duration-500 ease-in-out stroke-white/20 ${!isDragging && 'group-hover/toggle:stroke-indigo-400'} ${isAllExpanded ? 'rotate-180' : ''}`}
                                strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M5 2l7 7 7-7" />
                            </svg>
                        </div>
                    </button>
                </div>
            )}

            {viewMode === "hub" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                    {filtered.length === 0 && <div className="text-white/10 col-span-3 text-center py-40 italic tracking-[0.3em] text-[14px] font-bold">Пустой канал...</div>}
                    {filtered.map(s => (
                        <div
                            key={s.path}
                            onMouseDown={(e) => handleCustomMouseDown(e, s)}
                            className={`p-6 rounded-[2.5rem] border transition-all flex flex-col justify-between h-64 select-none backdrop-blur-xl
                ${!isDragging
                                    ? 'group cursor-grab active:cursor-grabbing active:scale-[0.98] hover:shadow-2xl'
                                    : 'opacity-30 border-transparent shadow-none cursor-default'}
                ${s.is_running && !isDragging ? 'border-indigo-500/30 shadow-indigo-900/10' : ''}
              `}
                            style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: s.is_running && !isDragging ? 'var(--accent-indigo)' : 'var(--border-color)' }}
                        >
                            <div className="flex justify-between items-start pointer-events-none">
                                <div className="flex flex-col overflow-hidden flex-1">
                                    <span className={`text-xl font-black truncate pr-4 transition-colors tracking-tight ${!isDragging ? 'text-white group-hover:text-indigo-400' : 'text-white/40'}`}>{s.filename}</span>
                                    <span className="text-[12px] text-white/20 font-bold tracking-[0.4em] mt-2">{s.parent}</span>
                                </div>
                                <div className={`w-3 h-3 rounded-full mt-2 transition-opacity ${s.is_running ? 'bg-green-500' : 'bg-white/5 border border-white/10'} ${isDragging ? 'opacity-20' : ''}`}></div>
                            </div>

                            <div className="mt-4 flex-1">
                                {editingScript === s.path && !isDragging ? (
                                    <div className="flex flex-col space-y-2 pointer-events-auto">
                                        <input
                                            className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white outline-none w-full"
                                            value={tempTags}
                                            onChange={(e) => setTempTags(e.target.value)}
                                            autoFocus
                                            onKeyDown={(e) => e.key === "Enter" && saveTags(s.path)}
                                        />
                                        <div className="flex space-x-3">
                                            <button onClick={() => saveTags(s.path)} className="text-[12px] font-bold text-indigo-400">Сохранить</button>
                                            <button onClick={() => setEditingScript(null)} className="text-[12px] font-bold text-white/20">Отмена</button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-wrap gap-2 pointer-events-none">
                                        {s.tags.map(t => <span key={t} className={`text-[11px] px-5 py-3.5 bg-white/5 border border-white/5 text-indigo-400 font-bold rounded-xl shadow-lg leading-none flex items-center transition-opacity ${isDragging ? 'opacity-20' : ''}`}>#{t}</span>)}
                                        {!isDragging && (
                                            <button onClick={() => startEditing(s)} className="w-[42px] h-[42px] flex items-center justify-center border border-dashed border-white/10 rounded-xl text-white/10 hover:text-white/40 hover:border-white/20 transition-all cursor-pointer pointer-events-auto">
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>

                            {!isDragging && (
                                <button onClick={() => handleToggle(s)} className={`w-full py-3.5 rounded-2xl text-[12px] font-bold tracking-[0.1em] transition-all transform cursor-pointer active:scale-95 mt-4 pointer-events-auto shadow-xl ${s.is_running ? "bg-red-600/10 text-red-500 border border-red-500/20" : "bg-white text-black"}`}>
                                    {s.is_running ? "Kill" : "Run"}
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                <div className="flex flex-col space-y-0.5 select-none pr-6">
                    {!hasContent ? (
                        <div className="text-white/10 text-center py-40 italic tracking-[0.3em] text-[14px] font-bold">Пустой раздел дерева...</div>
                    ) : (
                        renderNode(tree)
                    )}
                </div>
            )}
        </div>
    );
}
