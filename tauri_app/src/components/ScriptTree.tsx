import { useState, useEffect } from "react";
import { scanScripts, getRunningScripts, runScript, killScript } from "../api";

interface ScriptTreeProps {
    filterTag: string;
}

export default function ScriptTree({ filterTag }: ScriptTreeProps) {
    const [scripts, setScripts] = useState<string[]>([]);
    const [runningCmds, setRunningCmds] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchScripts = async () => {
        try {
            // Hardcoded path for prototype
            const found = await scanScripts(["C:\\Users\\Heavym\\Desktop\\AutoHotkeys"]);
            setScripts(found.sort());
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const fetchRunning = async () => {
        try {
            const running = await getRunningScripts();
            setRunningCmds(running);
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        fetchScripts();
        fetchRunning();
        const interval = setInterval(fetchRunning, 2000);
        return () => clearInterval(interval);
    }, []);

    const isRunning = (path: string) => {
        return runningCmds.some((cmd) => cmd.includes(path));
    };

    const handleToggle = async (path: string, running: boolean) => {
        try {
            if (running) {
                await killScript(path);
            } else {
                await runScript(path);
            }
            setTimeout(fetchRunning, 500); // Check again shortly after
        } catch (e) {
            console.error(e);
        }
    };

    let displayedScripts = scripts;
    if (filterTag === "Запущенные") {
        displayedScripts = scripts.filter((s) => isRunning(s));
    }

    if (loading) {
        return <div className="text-gray-400 p-4">Сканирование...</div>;
    }

    return (
        <div className="w-full flex flex-col space-y-2">
            {displayedScripts.length === 0 && (
                <div className="text-gray-500 italic p-4">Нет скриптов для отображения.</div>
            )}
            {displayedScripts.map((path) => {
                const parts = path.split("\\");
                const filename = parts.pop() || path;
                const dir = parts.pop() || "";
                const running = isRunning(path);

                return (
                    <div
                        key={path}
                        className="flex items-center justify-between p-3 bg-[#2A2A2A] hover:bg-[#333] rounded-lg border border-[#3A3A3A] transition-all group"
                    >
                        <div className="flex items-center space-x-3">
                            <div className="w-4 flex justify-center">
                                {running ? (
                                    <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
                                ) : (
                                    <div className="w-2 h-2 bg-gray-600 rounded-full"></div>
                                )}
                            </div>
                            <div className="flex flex-col">
                                <span className={`text-base font-medium ${running ? 'text-white' : 'text-gray-300'}`}>
                                    {filename}
                                </span>
                                <span className="text-xs text-gray-500">{dir}</span>
                            </div>
                        </div>
                        <div className="flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                                onClick={() => handleToggle(path, running)}
                                className={`px-3 py-1.5 rounded text-xs font-semibold ${running
                                    ? "bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20"
                                    : "bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 border border-blue-500/20"
                                    }`}
                            >
                                {running ? "ОСТАНОВИТЬ" : "ЗАПУСТИТЬ"}
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
