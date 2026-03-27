import React, { useState, useEffect, useMemo, useRef, memo } from "react";
import { createPortal } from "react-dom";
import { TagPickerProps } from "../types/script";

const TagPickerPopover = memo(function TagPickerPopover({ script, allUniqueTags, popoverRef, onAdd, onClose, variant, anchorRef }: TagPickerProps) {
    const [query, setQuery] = useState("");
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [pos, setPos] = useState({ top: -9999, right: 0 });
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => { setSelectedIndex(0); }, [query]);

    // Portal coordinate calculation
    useEffect(() => {
        if (variant === "tree" && anchorRef?.current) {
            const rect = anchorRef.current.getBoundingClientRect();
            setPos({
                top: rect.bottom + 8,
                right: window.innerWidth - rect.right
            });
        }
    }, [variant, anchorRef]);

    // Auto-scroll logic
    useEffect(() => {
        if (!listRef.current) return;
        const container = listRef.current;
        const selectedElement = container.children[selectedIndex] as HTMLElement;
        if (selectedElement) {
            selectedElement.scrollIntoView({
                block: "nearest",
                behavior: "smooth"
            });
        }
    }, [selectedIndex]);

    const availableTags = useMemo(
        () => allUniqueTags.filter(t => t.toLowerCase().includes(query.toLowerCase()) && !script.tags.includes(t)),
        [allUniqueTags, query, script.tags]
    );
    const showCreate = query && !allUniqueTags.some(t => t.toLowerCase() === query.toLowerCase());
    const totalCount = availableTags.length + (showCreate ? 1 : 0);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelectedIndex(p => totalCount > 0 ? (p + 1) % totalCount : 0);
        }
        else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelectedIndex(p => totalCount > 0 ? (p - 1 + totalCount) : 0);
        }
        else if (e.key === "Enter") {
            e.preventDefault();
            if (totalCount > 0) {
                if (selectedIndex < availableTags.length) onAdd(script, availableTags[selectedIndex]);
                else if (showCreate) onAdd(script, query);
            }
        } else if (e.key === "Escape") { onClose(); }
    };

    if (variant === "tree") return createPortal(
        <div
            ref={popoverRef}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            className="fixed w-64 bg-[#1a1a1c] border border-white/10 rounded-2xl shadow-[0_0_40px_rgba(0,0,0,0.9)] z-[99999] overflow-hidden backdrop-blur-3xl pointer-events-auto !cursor-default !opacity-100 flex flex-col"
            style={{ top: pos.top !== -9999 ? `${pos.top}px` : '-9999px', right: `${pos.right}px` }}
        >
            <div className="p-3 pb-0">
                <input
                    className="w-full bg-white/5 border border-white/5 rounded-xl px-4 py-2.5 text-xs text-white outline-none focus:border-indigo-500/50 transition-all font-bold mb-3 flex-shrink-0"
                    placeholder="Имя нового тега..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    autoFocus
                    onKeyDown={handleKeyDown}
                />
            </div>
            <div
                ref={listRef}
                className="max-h-52 overflow-y-auto custom-scrollbar pl-3 pr-1 pb-3 space-y-0.5 w-full"
            >
                {availableTags.map((tag, index) => (
                    <button key={tag} onClick={(e) => { e.stopPropagation(); onAdd(script, tag); }} onMouseDown={(e) => e.stopPropagation()}
                        className={`cursor-pointer w-full text-left px-4 py-2.5 rounded-xl transition-all flex items-center justify-between group/suggest ${selectedIndex === index ? 'bg-white/10 text-primary' : 'hover:bg-white/5 text-xs text-secondary hover:text-primary'}`}>
                        <span className="font-medium">{tag}</span>
                        <span className={`text-indigo-400 font-bold ${selectedIndex === index ? 'opacity-100' : 'opacity-0 group-hover/suggest:opacity-100'}`}>+</span>
                    </button>
                ))}
                {showCreate && (
                    <button onClick={(e) => { e.stopPropagation(); onAdd(script, query); }} onMouseDown={(e) => e.stopPropagation()}
                        className={`cursor-pointer w-full text-left px-4 py-3 rounded-xl transition-all flex items-center justify-between ${selectedIndex === availableTags.length ? 'bg-indigo-500/30 text-indigo-300 font-bold' : 'bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 font-bold'}`}>
                        <span className="text-xs font-bold">Создать "{query}"</span>
                        <span className="text-xl leading-none">+</span>
                    </button>
                )}
            </div>
        </div>,
        document.body
    );

    // hub variant (compact & scroll fixed)
    return (
        <div
            ref={popoverRef}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            className="absolute inset-0 bg-[#1a1a1c] border border-white/10 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.9)] z-[1000] overflow-hidden backdrop-blur-3xl pointer-events-auto flex flex-col !cursor-default !opacity-100"
        >
            <div className="p-4 pb-0">
                <input
                    className="w-full bg-white/5 border border-white/5 rounded-xl px-5 py-3 text-xs text-white outline-none focus:border-indigo-500/50 transition-all font-bold mb-3 flex-shrink-0"
                    placeholder="Поиск или новый тег..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    autoFocus
                    onKeyDown={handleKeyDown}
                />
            </div>
            <div
                ref={listRef}
                className="flex-1 overflow-y-auto custom-scrollbar pl-4 pr-1 pb-4 space-y-0.5 w-full"
            >
                {availableTags.map((tag, index) => (
                    <button key={tag} onClick={(e) => { e.stopPropagation(); onAdd(script, tag); }} onMouseDown={(e) => e.stopPropagation()}
                        className={`cursor-pointer w-full text-left px-5 py-2.5 rounded-xl transition-all flex items-center justify-between group/suggest ${selectedIndex === index ? 'bg-white/10 text-primary' : 'hover:bg-white/5 text-xs text-secondary hover:text-primary'}`}>
                        <span className="font-bold">{tag}</span>
                        <span className={`text-indigo-400 font-bold ${selectedIndex === index ? 'opacity-100' : 'opacity-0 group-hover/suggest:opacity-100'}`}>+</span>
                    </button>
                ))}
                {showCreate && (
                    <button onClick={(e) => { e.stopPropagation(); onAdd(script, query); }} onMouseDown={(e) => e.stopPropagation()}
                        className={`cursor-pointer w-full text-left px-5 py-2.5 rounded-xl transition-all flex items-center justify-between ${selectedIndex === availableTags.length ? 'bg-indigo-500/30 text-indigo-300 font-bold' : 'bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 font-bold'}`}>
                        <span className="text-xs font-bold">Создать "{query}"</span>
                        <span className="text-xl leading-none">+</span>
                    </button>
                )}
            </div>
        </div>
    );
});

export default TagPickerPopover;
