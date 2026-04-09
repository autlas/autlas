import { useState, useEffect, useRef, useCallback, startTransition } from "react";
import { getScripts, Script } from "../api";
import { invoke } from "@tauri-apps/api/core";
import { useTreeStore } from "../store/useTreeStore";

let _cachedScripts: Script[] = [];
let _scanPromise: Promise<Script[]> | null = null; // dedup concurrent scans
let _autoRefreshDone = false; // guard: one auto-refresh per app lifetime

/** @internal — test-only reset */
export function __resetCachedScripts() {
    _cachedScripts = [];
    _scanPromise = null;
    _autoRefreshDone = false;
}

export function getCachedScripts() { return _cachedScripts; }
export function setCachedScripts(s: Script[]) { _cachedScripts = s; }

interface UseScriptDataOptions {
    onTagsLoaded: (tags: string[]) => void;
    onRunningCountChange?: (count: number) => void;
    refreshKey?: number;
    onScanComplete?: (timestamp: number, count?: number, durationMs?: number) => void;
}

export function useScriptData({ onTagsLoaded, onRunningCountChange, refreshKey, onScanComplete }: UseScriptDataOptions) {
    const [allScripts, setAllScripts] = useState<Script[]>(_cachedScripts);
    const [loading, setLoading] = useState(_cachedScripts.length === 0);
    const [isFetching, setIsFetching] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const lastTagsKeyRef = useRef<string>('');
    const burstIntervalsRef = useRef<Set<number>>(new Set());
    const storeSetTagIcons = useTreeStore(s => s.setTagIcons);

    const fetchData = useCallback(async (forceScan = false) => {
        setIsFetching(true);
        try {
            let data: Script[];
            let scanDurationMs = 0;
            if (forceScan && _scanPromise) {
                data = await _scanPromise;
            } else {
                const t0 = performance.now();
                const promise = getScripts(forceScan);
                if (forceScan) _scanPromise = promise;
                data = await promise;
                if (forceScan) _scanPromise = null;
                scanDurationMs = performance.now() - t0;
                console.log(`[Scan] ${forceScan ? 'Full scan' : 'Cache load'}: ${data.length} scripts in ${scanDurationMs.toFixed(0)}ms`);
            }
            _cachedScripts = data;
            if (forceScan && onScanComplete) {
                onScanComplete(Date.now(), data.length, scanDurationMs);
            }
            setAllScripts(prev => {
                const prevMap = new Map(prev.map(s => [s.path, s]));
                // Length mismatch = at least one removal/addition. Without
                // this we'd silently keep blacklisted/deleted scripts on
                // screen until something else changed.
                let anyChanged = prev.length !== data.length;

                const merged = data.map(d => {
                    const p = prevMap.get(d.path);
                    if (!p) { anyChanged = true; return d; }
                    const tagsMatch = p.tags.length === d.tags.length && p.tags.every((t, i) => t === d.tags[i]);
                    if (p.id === d.id && p.is_running === d.is_running && p.has_ui === d.has_ui
                        && p.is_hidden === d.is_hidden && p.size === d.size && tagsMatch
                        && p.is_hub === d.is_hub) return p;
                    anyChanged = true;
                    return { ...p, ...d };
                });

                return anyChanged ? merged : prev;
            });
            setError(null);
        } catch (e) {
            // Backend returns "scan superseded" when this scan was overtaken
            // by a newer one (e.g. slow WalkDir overtaken by fast Everything
            // after the user installs Everything mid-scan). The newer scan
            // will populate state on its own — we silently drop this result
            // instead of surfacing it as an error.
            const msg = e instanceof Error ? e.message : String(e);
            if (msg.includes("scan superseded")) {
                console.log("[Scan] superseded by newer scan, discarding");
            } else {
                console.error("[useScriptTree] fetchData error:", e);
                setError(msg);
            }
        } finally {
            setLoading(false);
            setIsFetching(false);
        }
    }, [onScanComplete]);

    useEffect(() => {
        const tagsKey = allScripts.flatMap(s => s.tags).sort().join(',');
        if (tagsKey !== lastTagsKeyRef.current) {
            lastTagsKeyRef.current = tagsKey;
            const tags = new Set<string>();
            allScripts.forEach(s => s.tags.forEach(t => tags.add(t)));
            onTagsLoaded(Array.from(tags).sort());
        }
    }, [allScripts, onTagsLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

    const onRunningCountChangeRef = useRef(onRunningCountChange);
    onRunningCountChangeRef.current = onRunningCountChange;
    const prevRunningCountRef = useRef(-1);

    useEffect(() => {
        const count = allScripts.filter(s => s.is_running).length;
        if (count !== prevRunningCountRef.current) {
            prevRunningCountRef.current = count;
            onRunningCountChangeRef.current?.(count);
        }
    }, [allScripts]);

    useEffect(() => {
        invoke<Record<string, string>>("get_tag_icons").then(storeSetTagIcons).catch(() => {});
        invoke<Record<string, [string, string]>>("load_icon_cache").then(cache => {
            useTreeStore.getState().setIconCache(cache);
        }).catch(() => {});
    }, [storeSetTagIcons]);

    useEffect(() => {
        if (_cachedScripts.length === 0) {
            fetchData();
        }
        if (!_autoRefreshDone && localStorage.getItem("ahk_auto_refresh") === "true") {
            _autoRefreshDone = true;
            fetchData(true);
        }

        let unlisten: (() => void) | null = null;
        let unlistenStatus: (() => void) | null = null;
        let unlistenHub: (() => void) | null = null;
        let localHubHandler: ((e: Event) => void) | null = null;
        let mounted = true;

        import('@tauri-apps/api/event').then(({ listen }) => {
            if (!mounted) return;

            listen<{ id: string; tags: string[]; path?: string }>('script-tags-changed', (event) => {
                const { id, tags, path } = event.payload;
                const pathLower = path?.toLowerCase();
                const matches = (s: Script) => s.id === id || (pathLower && s.path.toLowerCase() === pathLower);
                _cachedScripts = _cachedScripts.map(s => matches(s) ? { ...s, id, tags } : s);
                setAllScripts(prev => prev.map(s =>
                    matches(s) ? { ...s, id, tags } : s
                ));
            }).then(fn => {
                if (mounted) { unlisten = fn; } else { fn(); }
            });

            const pendingStatus = new Map<string, { is_running: boolean; has_ui: boolean }>();
            let statusTimer: number | null = null;

            const flushStatusUpdates = () => {
                statusTimer = null;
                if (pendingStatus.size === 0) return;
                const updates = new Map(pendingStatus);
                pendingStatus.clear();

                _cachedScripts = _cachedScripts.map(s => {
                    const u = updates.get(s.path.toLowerCase());
                    return u ? { ...s, is_running: u.is_running, has_ui: u.has_ui } : s;
                });

                startTransition(() => {
                    setAllScripts(prev => {
                        let changed = false;
                        const updated = prev.map(s => {
                            const u = updates.get(s.path.toLowerCase());
                            if (!u) return s;
                            if (s.is_running === u.is_running && s.has_ui === u.has_ui) return s;
                            changed = true;
                            return { ...s, is_running: u.is_running, has_ui: u.has_ui };
                        });
                        return changed ? updated : prev;
                    });
                });

                const store = useTreeStore.getState();
                for (const [pathLower, { is_running }] of updates) {
                    const key = Object.keys(store.pendingScripts).find(k => k.toLowerCase() === pathLower);
                    if (key) {
                        const pending = store.pendingScripts[key];
                        if ((pending === "run" && is_running) || (pending === "kill" && !is_running) || (pending === "restart" && is_running)) {
                            store.clearPendingScript(key);
                        }
                    }
                }
            };

            const applyHubChange = (id: string, hub: boolean) => {
                _cachedScripts = _cachedScripts.map(s => s.id === id ? { ...s, is_hub: hub } : s);
                setAllScripts(prev => prev.map(s => s.id === id ? { ...s, is_hub: hub } : s));
            };
            listen<{ id: string; hub: boolean }>('script-hub-changed', (event) => {
                applyHubChange(event.payload.id, event.payload.hub);
            }).then(fn => {
                if (mounted) { unlistenHub = fn; } else { fn(); }
            });
            // Optimistic local update — call sites dispatch это сразу после
            // invoke (или до), чтобы звезда мгновенно меняла weight, не
            // дожидаясь round-trip к Rust + listener.
            localHubHandler = (e: Event) => {
                const d = (e as CustomEvent).detail as { id: string; hub: boolean };
                applyHubChange(d.id, d.hub);
            };
            window.addEventListener('ahk-hub-changed-local', localHubHandler);

            listen<{ path: string; is_running: boolean; has_ui: boolean }>('script-status-changed', (event) => {
                const { path, is_running, has_ui } = event.payload;
                const pathLower = path.toLowerCase();
                const newHasUi = is_running ? has_ui : false;
                pendingStatus.set(pathLower, { is_running, has_ui: newHasUi });
                if (statusTimer) clearTimeout(statusTimer);
                statusTimer = window.setTimeout(flushStatusUpdates, 150);
            }).then(fn => {
                if (mounted) { unlistenStatus = fn; } else { fn(); }
            });
        });

        return () => {
            mounted = false;
            if (unlisten) unlisten();
            if (unlistenStatus) unlistenStatus();
            if (unlistenHub) unlistenHub();
            if (localHubHandler) window.removeEventListener('ahk-hub-changed-local', localHubHandler);
            burstIntervalsRef.current.forEach(id => clearInterval(id));
            burstIntervalsRef.current.clear();
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const prevRefreshKey = useRef(refreshKey);
    useEffect(() => {
        if (refreshKey !== undefined && refreshKey !== prevRefreshKey.current) {
            prevRefreshKey.current = refreshKey;
            fetchData(true);
        }
    }, [refreshKey, fetchData]);

    const toggleHiddenByPath = useCallback((_folderPath: string) => {
        fetchData();
    }, [fetchData]);

    return {
        allScripts, setAllScripts,
        loading, isFetching, error,
        burstIntervalsRef,
        fetchData,
        toggleHiddenByPath,
    };
}
