import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { TAG_ICONS } from "../../data/tagIcons";
import { SearchIcon, CloseIcon } from "../ui/Icons";
import { useTreeStore } from "../../store/useTreeStore";

const ALL_ICON_NAMES = Object.keys(TAG_ICONS);

interface TagIconPickerProps {
    tag: string;
    currentIcon?: string;
    onSelect: (tag: string, iconName: string) => void;
    onReset: (tag: string) => void;
    onClose: () => void;
}

function IconButton({ name, viewBox, svgHtml, isSelected, isFocused, onClick, onMouseEnter, btnRef }: {
    name: string; viewBox: string; svgHtml: string; isSelected: boolean; isFocused?: boolean; onClick: () => void; onMouseEnter?: () => void; btnRef?: React.Ref<HTMLButtonElement>;
}) {
    return (
        <button
            ref={btnRef}
            title={name}
            onClick={onClick}
            onMouseEnter={onMouseEnter}
            className={`w-[42px] h-[42px] rounded-xl flex items-center justify-center cursor-pointer transition-all hover:scale-150 hover:z-10 relative group/icon
                ${isSelected
                    ? "bg-indigo-500/20 border-2 border-indigo-500 text-indigo-400"
                    : isFocused
                        ? "bg-indigo-500/15 border border-indigo-500/40 text-white ring-1 ring-indigo-500/30 scale-150 z-10"
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

    // Vim navigation
    const [focusIdx, setFocusIdx] = useState(-1);
    const [vimActive, setVimActive] = useState(false);
    const gridRef = useRef<HTMLDivElement>(null);
    const focusedBtnRef = useRef<HTMLButtonElement>(null);

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

    // `ref` must already be a fully-qualified library:name (e.g. "phosphor:acorn",
    // "si:github"). Caller is responsible for adding the prefix.
    const handleSelectApiIcon = (ref: string, paths: [string, string]) => {
        invoke("save_icon_to_cache", { name: ref, bold: paths[0], fill: paths[1] }).catch(() => {});
        onSelect(tag, ref);
        onClose();
    };

    const hasPhResults = phResults.some(n => phPaths[`phosphor:${n}`]);
    const hasSiResults = siResults.some(n => siPaths[`si:${n}`]);
    const isSearchingAny = phSearching || siSearching;

    // Build flat list of all navigable icons: { key, action }
    type NavItem = { key: string; action: () => void };
    const navItems = useMemo((): NavItem[] => {
        const items: NavItem[] = [];
        filtered.forEach(name => {
            const ref = `phosphor:${name}`;
            items.push({ key: ref, action: () => { onSelect(tag, ref); onClose(); } });
        });
        phResults.forEach(name => {
            const ref = `phosphor:${name}`;
            const paths = phPaths[ref];
            if (paths) items.push({ key: ref, action: () => handleSelectApiIcon(ref, paths) });
        });
        siResults.forEach(name => {
            const cacheKey = `si:${name}`;
            const paths = siPaths[cacheKey];
            if (paths) items.push({ key: cacheKey, action: () => handleSelectApiIcon(cacheKey, paths) });
        });
        return items;
    }, [filtered, phResults, phPaths, siResults, siPaths]);

    // Calculate columns from grid width
    const getColumns = useCallback(() => {
        if (!gridRef.current) return 10;
        const width = gridRef.current.clientWidth;
        return Math.max(1, Math.floor((width + 6) / (42 + 6))); // 42px icon + 6px gap (gap-1.5)
    }, []);

    // Scroll focused button into view
    useEffect(() => {
        if (focusIdx >= 0 && focusedBtnRef.current) {
            focusedBtnRef.current.scrollIntoView({ block: "nearest" });
        }
    }, [focusIdx]);

    // Reset focus when items change
    useEffect(() => { setFocusIdx(-1); setVimActive(false); }, [query]);

    // Keyboard handler
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            const isInput = document.activeElement === inputRef.current;
            const key = e.key;

            // Esc always closes
            if (key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); onClose(); return; }

            // When in input, let typing through but intercept navigation keys
            if (isInput) {
                if (key === "Enter" || key === "ArrowDown" || (key === "Tab" && !e.shiftKey)) {
                    if (navItems.length > 0) {
                        e.preventDefault();
                        e.stopImmediatePropagation();
                        setFocusIdx(0);
                        setVimActive(true);
                        inputRef.current?.blur();
                    }
                }
                // Block all keys from reaching ScriptTree while picker is open
                e.stopImmediatePropagation();
                return;
            }

            // Block all keys from reaching ScriptTree
            e.stopImmediatePropagation();

            // In grid navigation
            if (!vimActive) return;
            const cols = getColumns();
            const total = navItems.length;
            if (total === 0) return;
            const navMode = localStorage.getItem("ahk_vim_mode_nav") || "hjkl";
            const is2D = navMode === "hjkl";

            let next = focusIdx;
            if ((key === "h" || key === "ArrowLeft") && is2D) { next = Math.max(0, focusIdx - 1); }
            else if ((key === "l" || key === "ArrowRight") && is2D) { next = Math.min(total - 1, focusIdx + 1); }
            else if (key === "j" || key === "ArrowDown") { next = Math.min(total - 1, focusIdx + (is2D ? cols : 1)); }
            else if (key === "k" || key === "ArrowUp") { next = Math.max(0, focusIdx - (is2D ? cols : 1)); }
            else if (key === "g") { next = 0; }
            else if (key === "G") { next = total - 1; }
            else if (key === "Enter" || key === " ") {
                e.preventDefault();
                if (focusIdx >= 0 && focusIdx < total) navItems[focusIdx].action();
                return;
            }
            else if (key === "i" || key === "/") {
                e.preventDefault();
                setVimActive(false);
                setFocusIdx(-1);
                inputRef.current?.focus();
                return;
            }
            else return;

            e.preventDefault();
            setFocusIdx(next);
        };

        window.addEventListener("keydown", handleKey, true);
        return () => window.removeEventListener("keydown", handleKey, true);
    }, [vimActive, focusIdx, navItems, getColumns, onClose]);

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
                        <div ref={gridRef} className="grid grid-cols-[repeat(auto-fill,42px)] gap-1.5 justify-center">
                            {filtered.map((name, i) => {
                                const ref = `phosphor:${name}`;
                                return (
                                    <IconButton
                                        key={ref}
                                        name={name}
                                        viewBox="0 0 256 256"
                                        svgHtml={TAG_ICONS[name][0]}
                                        isSelected={ref === currentIcon}
                                        isFocused={vimActive && focusIdx === i}
                                        btnRef={vimActive && focusIdx === i ? focusedBtnRef : undefined}
                                        onClick={() => { onSelect(tag, ref); onClose(); }}
                                        onMouseEnter={() => { if (vimActive) { setVimActive(false); setFocusIdx(-1); } }}
                                    />
                                );
                            })}
                        </div>
                    )}

                    {/* Section 2: Phosphor API results */}
                    {query.length >= 2 && (hasPhResults || phSearching) && (
                        <>
                            <SectionDivider label="Phosphor" />
                            {phSearching && !hasPhResults && <Spinner label={t("icon_picker.searching", "Searching...")} />}
                            {hasPhResults && (
                                <div className={`grid grid-cols-[repeat(auto-fill,42px)] gap-1.5 justify-center transition-opacity ${phSearching ? "opacity-30 animate-pulse pointer-events-none" : ""}`}>
                                    {(() => { let offset = filtered.length; return phResults.map(name => {
                                        const ref = `phosphor:${name}`;
                                        const paths = phPaths[ref];
                                        if (!paths) return null;
                                        const idx = offset++;
                                        return (
                                            <IconButton
                                                key={ref}
                                                name={name}
                                                viewBox="0 0 256 256"
                                                svgHtml={paths[0]}
                                                isSelected={ref === currentIcon}
                                                isFocused={vimActive && focusIdx === idx}
                                                btnRef={vimActive && focusIdx === idx ? focusedBtnRef : undefined}
                                                onClick={() => handleSelectApiIcon(ref, paths)}
                                                onMouseEnter={() => { if (vimActive) { setVimActive(false); setFocusIdx(-1); } }}
                                            />
                                        );
                                    }); })()}
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
                                    {(() => { let offset = filtered.length + phResults.filter(n => phPaths[`phosphor:${n}`]).length; return siResults.map(name => {
                                        const cacheKey = `si:${name}`;
                                        const paths = siPaths[cacheKey];
                                        if (!paths) return null;
                                        const idx = offset++;
                                        return (
                                            <IconButton
                                                key={cacheKey}
                                                name={name}
                                                viewBox="0 0 24 24"
                                                svgHtml={paths[0]}
                                                isSelected={cacheKey === currentIcon}
                                                isFocused={vimActive && focusIdx === idx}
                                                btnRef={vimActive && focusIdx === idx ? focusedBtnRef : undefined}
                                                onClick={() => handleSelectApiIcon(cacheKey, paths)}
                                                onMouseEnter={() => { if (vimActive) { setVimActive(false); setFocusIdx(-1); } }}
                                            />
                                        );
                                    }); })()}
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
