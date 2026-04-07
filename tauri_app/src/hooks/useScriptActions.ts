import { useCallback } from "react";
import { Script, runScript, killScript } from "../api";
import { invoke } from "@tauri-apps/api/core";
import { useTreeStore } from "../store/useTreeStore";
import { getCachedScripts, setCachedScripts } from "./useScriptData";

interface UseScriptActionsOptions {
    setAllScripts: React.Dispatch<React.SetStateAction<Script[]>>;
    burstIntervalsRef: React.MutableRefObject<Set<number>>;
}

export function useScriptActions({ setAllScripts, burstIntervalsRef }: UseScriptActionsOptions) {
    const pendingScripts = useTreeStore(s => s.pendingScripts);
    const removingTags = useTreeStore(s => s.removingTags);

    const clearPending = useCallback((path: string) => {
        useTreeStore.getState().clearPendingScript(path);
    }, []);

    const startBurst = useCallback((path: string, expectedRunning: boolean) => {
        let attempts = 0;
        let verifyCount = 0;
        let found = false;
        const fname = path.split(/[\\\/]/).pop() || path;
        console.log(`[Burst] START polling "${fname}" expecting=${expectedRunning}`);
        const id = window.setInterval(async () => {
            attempts++;
            try {
                const status = await invoke<{ is_running: boolean; has_ui: boolean }>("get_script_status", { path });
                if (!found && status.is_running === expectedRunning) {
                    found = true;
                    verifyCount = 0;
                    clearPending(path);
                    console.log(`[Burst] FOUND "${fname}" is_running=${status.is_running} at attempt #${attempts} (${attempts * 300}ms). Starting verification...`);
                    const updateState = (is_running: boolean, has_ui: boolean) => {
                        setCachedScripts(getCachedScripts().map(s =>
                            s.path === path ? { ...s, is_running, has_ui: is_running ? has_ui : false } : s
                        ));
                        setAllScripts(prev => prev.map(s =>
                            s.path === path ? { ...s, is_running, has_ui: is_running ? has_ui : false } : s
                        ));
                    };
                    updateState(status.is_running, status.has_ui);
                } else if (found) {
                    verifyCount++;
                    if (status.is_running !== expectedRunning) {
                        console.log(`[Burst] VERIFY CAUGHT EXIT "${fname}" is_running=${status.is_running} at verify #${verifyCount} (${(attempts) * 300}ms). Watcher would have missed this!`);
                        setCachedScripts(getCachedScripts().map(s =>
                            s.path === path ? { ...s, is_running: status.is_running, has_ui: status.is_running ? status.has_ui : false } : s
                        ));
                        setAllScripts(prev => prev.map(s =>
                            s.path === path ? { ...s, is_running: status.is_running, has_ui: status.is_running ? status.has_ui : false } : s
                        ));
                        clearInterval(id);
                        burstIntervalsRef.current.delete(id);
                    } else if (verifyCount >= 5) {
                        console.log(`[Burst] VERIFIED STABLE "${fname}" after ${verifyCount} checks (${(attempts) * 300}ms)`);
                        clearInterval(id);
                        burstIntervalsRef.current.delete(id);
                    }
                } else if (attempts >= 33) {
                    console.log(`[Burst] TIMEOUT "${fname}" after ${attempts} attempts — never saw expected state`);
                    clearInterval(id);
                    burstIntervalsRef.current.delete(id);
                    clearPending(path);
                }
            } catch {
                clearInterval(id);
                burstIntervalsRef.current.delete(id);
                if (!found) clearPending(path);
            }
        }, 300);
        burstIntervalsRef.current.add(id);
    }, [clearPending, setAllScripts, burstIntervalsRef]);

    const handleToggle = useCallback(async (script: Script, force?: boolean) => {
        if (pendingScripts[script.path]) return;
        const type = script.is_running ? "kill" : "run";
        useTreeStore.getState().setPendingScript(script.path, type);
        try {
            if (script.is_running && !force) {
                await killScript(script.path);
            } else {
                await runScript(script.path);
            }
            startBurst(script.path, !script.is_running);
        } catch (e) {
            console.error(e);
            clearPending(script.path);
        }
    }, [pendingScripts, startBurst, clearPending]);

    const handleRestart = useCallback(async (script: Script) => {
        if (pendingScripts[script.path]) return;
        useTreeStore.getState().setPendingScript(script.path, "restart");
        try {
            await invoke("restart_script", { path: script.path });
            startBurst(script.path, true);
        } catch (e) {
            console.error(e);
            clearPending(script.path);
        }
    }, [pendingScripts, startBurst, clearPending]);

    const stopEditing = useCallback(() => useTreeStore.getState().setEditingScript(null), []);
    const startEditing = useCallback((s: Script) => useTreeStore.getState().setEditingScript(s.path), []);

    const addTag = useCallback(async (script: Script, newTag: string) => {
        const trimmed = newTag.trim();
        if (!trimmed) return;
        if (script.tags.includes(trimmed)) {
            useTreeStore.getState().setEditingScript(null);
            return;
        }
        const updatedTags = [...script.tags, trimmed];
        setCachedScripts(getCachedScripts().map(s => s.id === script.id ? { ...s, tags: updatedTags } : s));
        setAllScripts(prev => prev.map(s => s.id === script.id ? { ...s, tags: updatedTags } : s));
        useTreeStore.getState().setEditingScript(null);
        try {
            await invoke("save_script_tags", { id: script.id, tags: updatedTags });
        } catch (e) {
            console.error(e);
            setCachedScripts(getCachedScripts().map(s => s.id === script.id ? { ...s, tags: script.tags } : s));
            setAllScripts(prev => prev.map(s => s.id === script.id ? { ...s, tags: script.tags } : s));
        }
    }, [setAllScripts]);

    const removeTag = useCallback(async (script: Script, tagToRemove: string) => {
        const tagId = `${script.path}-${tagToRemove}`;
        if (removingTags.has(tagId)) return;
        useTreeStore.getState().addRemovingTag(tagId);
        await new Promise(r => setTimeout(r, 90));
        const newTags = script.tags.filter(t => t !== tagToRemove);
        setCachedScripts(getCachedScripts().map(s => s.id === script.id ? { ...s, tags: newTags } : s));
        setAllScripts(prev => prev.map(s => s.id === script.id ? { ...s, tags: newTags } : s));
        useTreeStore.getState().clearRemovingTag(tagId);
        try {
            await invoke("save_script_tags", { id: script.id, tags: newTags });
        } catch (e) {
            console.error(e);
            setCachedScripts(getCachedScripts().map(s => s.id === script.id ? { ...s, tags: script.tags } : s));
            setAllScripts(prev => prev.map(s => s.id === script.id ? { ...s, tags: script.tags } : s));
        }
    }, [removingTags, setAllScripts]);

    const deleteTagFromAll = useCallback((tag: string) => {
        setCachedScripts(getCachedScripts().map(s => ({
            ...s, tags: s.tags.filter(t => t.toLowerCase() !== tag.toLowerCase())
        })));
        setAllScripts(prev => prev.map(s => ({
            ...s, tags: s.tags.filter(t => t.toLowerCase() !== tag.toLowerCase())
        })));
    }, [setAllScripts]);

    /**
     * Переименование тега. Backend `rename_tag` уже обновляет БД,
     * но локальный кеш `allScripts` хранит старое имя — без оптимистичного апдейта
     * скрипты "пропадают" из активной вкладки до следующего scan.
     */
    const renameTag = useCallback(async (oldTag: string, newTag: string) => {
        const lo = oldTag.toLowerCase();
        const rewrite = (tags: string[]) => tags.map(t => t.toLowerCase() === lo ? newTag : t);
        setCachedScripts(getCachedScripts().map(s => ({ ...s, tags: rewrite(s.tags) })));
        setAllScripts(prev => prev.map(s => ({ ...s, tags: rewrite(s.tags) })));
        // Перенести иконку тега под новое имя — иначе после rename иконка
        // в Sidebar/picker пропадает (store индексирует по имени тега).
        const store = useTreeStore.getState();
        const existingIcon = store.tagIcons[oldTag];
        if (existingIcon !== undefined) {
            store.removeTagIcon(oldTag);
            store.setTagIcon(newTag, existingIcon);
        }
        try {
            await invoke("rename_tag", { oldTag, newTag });
        } catch (e) {
            console.error(e);
        }
    }, [setAllScripts]);

    const setTagIcon = useCallback(async (tag: string, iconName: string) => {
        useTreeStore.getState().setTagIcon(tag, iconName);
        try {
            await invoke("save_tag_icon", { tag, icon: iconName });
        } catch (e) {
            console.error(e);
        }
    }, []);

    const removeTagIcon = useCallback(async (tag: string) => {
        useTreeStore.getState().removeTagIcon(tag);
        try {
            await invoke("save_tag_icon", { tag, icon: "" });
        } catch (e) {
            console.error(e);
        }
    }, []);

    return {
        handleToggle, handleRestart,
        startEditing, stopEditing,
        addTag, removeTag, deleteTagFromAll, renameTag,
        setTagIcon, removeTagIcon,
    };
}
