import React, { useState, useEffect, useMemo, memo } from "react";
import { TagPickerProps } from "../types/script";

const TagPickerPopover = memo(function TagPickerPopover({ script, allUniqueTags, popoverRef, onAdd, onClose, variant }: TagPickerProps) {
    const [query, setQuery] = useState("");
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => { setSelectedIndex(0); }, [query]);

    const availableTags = useMemo(
        () => allUniqueTags.filter(t => t.toLowerCase().includes(query.toLowerCase()) && !script.tags.includes(t)),
        [allUniqueTags, query, script.tags]
    );
    const showCreate = query && !allUniqueTags.some(t => t.toLowerCase() === query.toLowerCase());
    const totalCount = availableTags.length + (showCreate ? 1 : 0);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex(p => totalCount > 0 ? (p + 1) % totalCount : 0); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex(p => totalCount > 0 ? (p - 1 + totalCount) % totalCount : 0); }
        else if (e.key === "Enter") {
            e.preventDefault();
            if (totalCount > 0) {
                if (selectedIndex < availableTags.length) onAdd(script, availableTags[selectedIndex]);
                else if (showCreate) onAdd(script, query);
            }
        } else if (e.key === "Escape") { onClose(); }
    };

    if (variant === "tree") return (
        <div
            ref={popoverRef}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            className="absolute right-0 top-9 w-64 bg-[#1a1a1c]/95 border border-white/10 rounded-2xl shadow-[0_0_30px_rgba(0,0,0,0.8)] z-[1000] p-3 backdrop-blur-3xl pointer-events-auto !cursor-default opacity-100"
        >
            <input
                className="w-full bg-white/5 border border-white/5 rounded-xl px-4 py-2.5 text-xs text-white outline-none focus:border-indigo-500/50 transition-all font-bold mb-3"
                placeholder="Имя нового тега..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
                onKeyDown={handleKeyDown}
            />
            <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-1">
                {availableTags.map((tag, index) => (
                    <button key={tag} onClick={(e) => { e.stopPropagation(); onAdd(script, tag); }} onMouseDown={(e) => e.stopPropagation()}
                        className={`cursor-pointer w-full text-left px-4 py-2 rounded-xl transition-all flex items-center justify-between group/suggest ${selectedIndex === index ? 'bg-white/10 text-primary' : 'hover:bg-white/5 text-xs text-secondary hover:text-primary'}`}>
                        <span>{tag}</span>
                        <span className={`text-indigo-400 font-bold ${selectedIndex === index ? 'opacity-100' : 'opacity-0 group-hover/suggest:opacity-100'}`}>+</span>
                    </button>
                ))}
                {showCreate && (
                    <button onClick={(e) => { e.stopPropagation(); onAdd(script, query); }} onMouseDown={(e) => e.stopPropagation()}
                        className={`cursor-pointer w-full text-left px-4 py-2.5 rounded-xl text-xs transition-all flex items-center justify-between ${selectedIndex === availableTags.length ? 'bg-indigo-500/30 text-indigo-300 font-bold' : 'bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 font-bold'}`}>
                        <span>Создать "{query}"</span>
                        <span className="text-xl leading-none">+</span>
                    </button>
                )}
            </div>
            <button onClick={(e) => { e.stopPropagation(); onClose(); }} onMouseDown={(e) => e.stopPropagation()}
                className="w-full mt-3 py-2 text-xs text-tertiary hover:text-secondary transition-all font-bold uppercase tracking-widest cursor-pointer">
                Отмена
            </button>
        </div>
    );

    // hub variant
    return (
        <div
            ref={popoverRef}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            className="absolute inset-x-0 bottom-0 top-0 bg-[#1a1a1c]/95 border border-white/10 rounded-[2.5rem] shadow-[0_0_30px_rgba(0,0,0,0.8)] z-[1000] p-6 backdrop-blur-3xl pointer-events-auto flex flex-col !cursor-default opacity-100"
        >
            <input
                className="w-full bg-white/5 border border-white/5 rounded-2xl px-6 py-4 text-sm text-white outline-none focus:border-indigo-500/50 transition-all font-bold mb-4"
                placeholder="Поиск или новый тег..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
                onKeyDown={handleKeyDown}
            />
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 mb-4">
                {availableTags.map((tag, index) => (
                    <button key={tag} onClick={(e) => { e.stopPropagation(); onAdd(script, tag); }} onMouseDown={(e) => e.stopPropagation()}
                        className={`cursor-pointer w-full text-left px-6 py-3 rounded-2xl transition-all flex items-center justify-between group/suggest ${selectedIndex === index ? 'bg-white/10 text-primary' : 'hover:bg-white/5 text-sm text-secondary hover:text-primary'}`}>
                        <span>{tag}</span>
                        <span className={`text-indigo-400 font-bold ${selectedIndex === index ? 'opacity-100' : 'opacity-0 group-hover/suggest:opacity-100'}`}>+</span>
                    </button>
                ))}
                {showCreate && (
                    <button onClick={(e) => { e.stopPropagation(); onAdd(script, query); }} onMouseDown={(e) => e.stopPropagation()}
                        className={`cursor-pointer w-full text-left px-6 py-3 rounded-2xl transition-all flex items-center justify-between ${selectedIndex === availableTags.length ? 'bg-indigo-500/30 text-indigo-300 font-bold' : 'bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 font-bold'}`}>
                        <span>Создать "{query}"</span>
                        <span className="text-xl leading-none">+</span>
                    </button>
                )}
            </div>
            <button onClick={(e) => { e.stopPropagation(); onClose(); }} onMouseDown={(e) => e.stopPropagation()}
                className="w-full py-4 text-xs text-tertiary hover:text-secondary transition-all font-bold uppercase tracking-[0.2em] cursor-pointer">
                Закрыть
            </button>
        </div>
    );
});

export default TagPickerPopover;
