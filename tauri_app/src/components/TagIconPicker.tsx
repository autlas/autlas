import { useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { TAG_ICONS } from "../data/tagIcons";
import { SearchIcon, CloseIcon } from "./ui/Icons";

const ALL_ICON_NAMES = Object.keys(TAG_ICONS);

interface TagIconPickerProps {
    tag: string;
    currentIcon?: string;
    onSelect: (tag: string, iconName: string) => void;
    onReset: (tag: string) => void;
    onClose: () => void;
}

export default function TagIconPicker({ tag, currentIcon, onSelect, onReset, onClose }: TagIconPickerProps) {
    const { t } = useTranslation();
    const [query, setQuery] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const filtered = useMemo(() => {
        if (!query) return ALL_ICON_NAMES;
        const q = query.toLowerCase();
        return ALL_ICON_NAMES.filter(name => name.includes(q));
    }, [query]);

    return createPortal(
        <div
            className="fixed inset-0 z-[99999] flex justify-center bg-black/60 backdrop-blur-md"
            onClick={onClose}
        >
            <div
                className="bg-[#0a0a0c] border border-white/10 rounded-[32px] shadow-2xl w-[50vw] min-w-[520px] max-w-[1024px] h-[70vh] flex flex-col relative overflow-hidden"
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
                    <div className="grid grid-cols-[repeat(auto-fill,42px)] gap-1.5 justify-center">
                        {filtered.map(name => {
                            const isSelected = name === currentIcon;
                            return (
                                <button
                                    key={name}
                                    title={name}
                                    onClick={() => { onSelect(tag, name); onClose(); }}
                                    className={`w-[42px] h-[42px] rounded-xl flex items-center justify-center cursor-pointer transition-all hover:scale-166 hover:z-10 relative group/icon
                                        ${isSelected
                                            ? "bg-indigo-500/20 border-2 border-indigo-500 text-indigo-400"
                                            : "bg-white/[0.03] border border-transparent text-white/60 hover:bg-white/10 hover:text-white hover:border-white/10"
                                        }`}
                                >
                                    <svg
                                        className="transition-transform group-hover/icon:scale-[1.3]"
                                        width={22}
                                        height={22}
                                        viewBox="0 0 256 256"
                                        fill="currentColor"
                                        dangerouslySetInnerHTML={{ __html: TAG_ICONS[name][0] }}
                                    />
                                </button>
                            );
                        })}
                    </div>
                    {filtered.length === 0 && (
                        <p className="text-center text-white/30 text-sm py-8">{t("icon_picker.no_results", "Nothing found")}</p>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}
