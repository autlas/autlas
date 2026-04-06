import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { TAG_ICONS } from "../data/tagIcons";
import { SearchIcon, CloseIcon } from "./ui/Icons";
import { useTreeStore } from "../store/useTreeStore";

const ALL_ICON_NAMES = Object.keys(TAG_ICONS);

interface TagIconPickerProps {
    tag: string;
    currentIcon?: string;
    onSelect: (tag: string, iconName: string) => void;
    onReset: (tag: string) => void;
    onClose: () => void;
}

function IconButton({ name, viewBox, svgHtml, isSelected, onClick }: {
    name: string; viewBox: string; svgHtml: string; isSelected: boolean; onClick: () => void;
}) {
    return (
        <button
            title={name}
            onClick={onClick}
            className={`w-[42px] h-[42px] rounded-xl flex items-center justify-center cursor-pointer transition-all hover:scale-150 hover:z-10 relative group/icon
                ${isSelected
                    ? "bg-indigo-500/20 border-2 border-indigo-500 text-indigo-400"
                    : "bg-white/[0.03] border border-transparent text-white/60 hover:bg-white/10 hover:text-white hover:border-white/10"
                }`}
        >
            <svg
                className="transition-transform group-hover/icon:scale-[1.3]"
                width={22}
                height={22}
                viewBox={viewBox}
                fill="currentColor"
                dangerouslySetInnerHTML={{ __html: svgHtml }}
            />
        </button>
    );
}

function SectionDivider({ label }: { label: string }) {
    return (
        <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-white/5" />
            <span className="text-[11px] font-bold text-white/20 uppercase tracking-widest">{label}</span>
            <div className="flex-1 h-px bg-white/5" />
        </div>
    );
}

function Spinner({ label }: { label: string }) {
    return (
        <div className="flex items-center justify-center py-4 gap-2">
            <div className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
            <span className="text-xs text-white/30">{label}</span>
        </div>
    );
}

export default function TagIconPicker({ tag, currentIcon, onSelect, onClose }: TagIconPickerProps) {
    const { t } = useTranslation();
    const [query, setQuery] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    // Phosphor API state
    const [phResults, setPhResults] = useState<string[]>([]);
    const [phPaths, setPhPaths] = useState<Record<string, [string, string]>>({});
    const [phSearching, setPhSearching] = useState(false);

    // Simple Icons API state
    const [siResults, setSiResults] = useState<string[]>([]);
    const [siPaths, setSiPaths] = useState<Record<string, [string, string]>>({});
    const [siSearching, setSiSearching] = useState(false);

    const [isOffline, setIsOffline] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

    useEffect(() => { inputRef.current?.focus(); }, []);

    // Local filter
    const filtered = useMemo(() => {
        if (!query) return ALL_ICON_NAMES;
        const q = query.toLowerCase();
        return ALL_ICON_NAMES.filter(name => name.includes(q));
    }, [query]);

    // Debounced parallel API search
    const searchApi = useCallback(async (q: string) => {
        if (q.length < 2) {
            setPhResults([]); setPhPaths({});
            setSiResults([]); setSiPaths({});
            setPhSearching(false); setSiSearching(false);
            return;
        }
        setIsOffline(false);
        setPhSearching(true);
        setSiSearching(true);

        // Search both in parallel
        const phPromise = (async () => {
            try {
                const baseNames = await invoke<string[]>("search_icons", { query: q, prefix: "ph" });
                const newNames = baseNames.filter(n => !TAG_ICONS[n]);
                setPhResults(newNames);
                if (newNames.length > 0) {
                    const paths = await invoke<Record<string, [string, string]>>("fetch_icon_paths", { names: newNames, prefix: "ph" });
                    setPhPaths(paths);
                    const store = useTreeStore.getState();
                    for (const [name, p] of Object.entries(paths)) {
                        store.addToIconCache(name, p);
                    }
                } else {
                    setPhPaths({});
                }
            } catch {
                setIsOffline(true);
                setPhResults([]); setPhPaths({});
            } finally {
                setPhSearching(false);
            }
        })();

        const siPromise = (async () => {
            try {
                const names = await invoke<string[]>("search_icons", { query: q, prefix: "simple-icons" });
                setSiResults(names);
                if (names.length > 0) {
                    const paths = await invoke<Record<string, [string, string]>>("fetch_icon_paths", { names, prefix: "simple-icons" });
                    setSiPaths(paths);
                    const store = useTreeStore.getState();
                    for (const [name, p] of Object.entries(paths)) {
                        store.addToIconCache(name, p);
                    }
                } else {
                    setSiPaths({});
                }
            } catch {
                setSiResults([]); setSiPaths({});
            } finally {
                setSiSearching(false);
            }
        })();

        await Promise.all([phPromise, siPromise]);
    }, []);

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (!query || query.length < 2) {
            setPhResults([]); setPhPaths({});
            setSiResults([]); setSiPaths({});
            setPhSearching(false); setSiSearching(false);
            return;
        }
        setPhSearching(true); setSiSearching(true);
        debounceRef.current = setTimeout(() => searchApi(query), 300);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [query, searchApi]);

    const handleSelectApiIcon = (name: string, paths: [string, string]) => {
        invoke("save_icon_to_cache", { name, bold: paths[0], fill: paths[1] }).catch(() => {});
        onSelect(tag, name);
        onClose();
    };

    const hasPhResults = phResults.some(n => phPaths[n]);
    const hasSiResults = siResults.some(n => siPaths[`si:${n}`]);
    const isSearchingAny = phSearching || siSearching;

    return createPortal(
        <div
            className="fixed inset-0 z-[99999] flex justify-center bg-black/60 backdrop-blur-md"
            onClick={onClose}
        >
            <div
                className="bg-black/30 backdrop-blur-lg border border-white/15 rounded-[32px] shadow-2xl w-[50vw] min-w-[520px] max-w-[1024px] h-[70vh] flex flex-col relative overflow-hidden"
                style={{ marginTop: "15vh" }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-6 pt-6 flex-shrink-0">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-black text-white">
                            {t("icon_picker.title", { tag })}
                        </h2>
                        <button
                            onClick={onClose}
                            className="text-white/30 hover:text-white/60 transition-colors cursor-pointer p-1"
                        >
                            <CloseIcon size={18} />
                        </button>
                    </div>

                    {/* Search */}
                    <div className="relative">
                        <SearchIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder={t("icon_picker.search", "Search icons...")}
                            className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-indigo-500/50"
                        />
                    </div>
                </div>

                {/* Grid */}
                <div className="pl-6 pr-[14px] py-6 overflow-y-auto flex-1 min-h-0 custom-scrollbar">
                    {/* Section 1: Static/loaded icons */}
                    {filtered.length > 0 && (
                        <div className="grid grid-cols-[repeat(auto-fill,42px)] gap-1.5 justify-center">
                            {filtered.map(name => (
                                <IconButton
                                    key={name}
                                    name={name}
                                    viewBox="0 0 256 256"
                                    svgHtml={TAG_ICONS[name][0]}
                                    isSelected={name === currentIcon}
                                    onClick={() => { onSelect(tag, name); onClose(); }}
                                />
                            ))}
                        </div>
                    )}

                    {/* Section 2: Phosphor API results */}
                    {query.length >= 2 && (hasPhResults || phSearching) && (
                        <>
                            <SectionDivider label="Phosphor" />
                            {phSearching && !hasPhResults && <Spinner label={t("icon_picker.searching", "Searching...")} />}
                            {hasPhResults && (
                                <div className={`grid grid-cols-[repeat(auto-fill,42px)] gap-1.5 justify-center transition-opacity ${phSearching ? "opacity-30 animate-pulse pointer-events-none" : ""}`}>
                                    {phResults.map(name => {
                                        const paths = phPaths[name];
                                        if (!paths) return null;
                                        return (
                                            <IconButton
                                                key={`ph:${name}`}
                                                name={name}
                                                viewBox="0 0 256 256"
                                                svgHtml={paths[0]}
                                                isSelected={name === currentIcon}
                                                onClick={() => handleSelectApiIcon(name, paths)}
                                            />
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    )}

                    {/* Section 3: Simple Icons API results */}
                    {query.length >= 2 && (hasSiResults || siSearching) && (
                        <>
                            <SectionDivider label="Simple Icons" />
                            {siSearching && !hasSiResults && <Spinner label={t("icon_picker.searching", "Searching...")} />}
                            {hasSiResults && (
                                <div className={`grid grid-cols-[repeat(auto-fill,42px)] gap-1.5 justify-center transition-opacity ${siSearching ? "opacity-30 animate-pulse pointer-events-none" : ""}`}>
                                    {siResults.map(name => {
                                        const cacheKey = `si:${name}`;
                                        const paths = siPaths[cacheKey];
                                        if (!paths) return null;
                                        return (
                                            <IconButton
                                                key={cacheKey}
                                                name={name}
                                                viewBox="0 0 24 24"
                                                svgHtml={paths[0]}
                                                isSelected={cacheKey === currentIcon}
                                                onClick={() => handleSelectApiIcon(cacheKey, paths)}
                                            />
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    )}

                    {isOffline && (
                        <p className="text-center text-white/20 text-xs py-4">{t("icon_picker.offline", "Offline")}</p>
                    )}

                    {filtered.length === 0 && !hasPhResults && !hasSiResults && !isSearchingAny && (
                        <p className="text-center text-white/30 text-sm py-8">{t("icon_picker.no_results", "Nothing found")}</p>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}
