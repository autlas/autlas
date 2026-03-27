import React, { useState, memo, useRef, useEffect } from "react";
import { ScriptRowProps } from "../types/script";
import TagPickerPopover from "./TagPickerPopover";
import { HighlightText } from "./HighlightText";
import { useTranslation } from "react-i18next";

const ScriptRow = memo(function ScriptRow({
    s, isDragging, draggedScriptPath, isEditing, isPending, pendingType, isContextMenuOpen, removingTagKeys,
    allUniqueTags, popoverRef, visibilityMode,
    onMouseDown, onDoubleClick, onToggle, onStartEditing, onAddTag, onRemoveTag, onCloseEditing,
    onScriptContextMenu, onShowUI, onRestart
}: ScriptRowProps) {
    const { t } = useTranslation();

    const [isLeftPressed, setIsLeftPressed] = useState(false);
    const [visibleCount, setVisibleCount] = useState(s.tags.length);
    const containerRef = useRef<HTMLDivElement>(null);
    const measureRef = useRef<HTMLDivElement>(null);
    const [tagWidths, setTagWidths] = useState<number[]>([]);
    const prevTagsRef = useRef<string[]>(s.tags);
    const newTagsSet = new Set(s.tags.filter(t => !prevTagsRef.current.includes(t)));
    const addBtnRef = useRef<HTMLButtonElement>(null);

    // Filtered tags for display (hide system tags)
    const displayedTags = s.tags.filter(t => !["hub", "fav", "favourites"].includes(t.toLowerCase()));

    useEffect(() => {
        prevTagsRef.current = s.tags;
        if (measureRef.current) {
            const children = Array.from(measureRef.current.children) as HTMLElement[];
            setTagWidths(children.map(c => c.offsetWidth + 8));
        }
    }, [s.tags]);

    useEffect(() => {
        if (!containerRef.current) return;

        const update = () => {
            if (!containerRef.current) return;
            const containerWidth = containerRef.current.offsetWidth;
            if (containerWidth < 30) return;

            const ADD_BTN_WIDTH = 36;
            const COUNTER_WIDTH = 42;
            const available = containerWidth - ADD_BTN_WIDTH;

            if (tagWidths.length === 0) {
                setVisibleCount(displayedTags.length);
                return;
            }

            if (tagWidths.length < displayedTags.length) {
                setVisibleCount(displayedTags.length);
                return;
            }

            let totalWidth = 0;
            let count = 0;

            for (let i = 0; i < tagWidths.length; i++) {
                const isLast = (i === tagWidths.length - 1);
                const reqSpace = totalWidth + tagWidths[i] + (isLast ? 0 : COUNTER_WIDTH);

                if (reqSpace > available) {
                    break;
                }
                totalWidth += tagWidths[i];
                count++;
            }

            if (count === 0 && tagWidths.length > 0) {
                count = 1;
            }

            setVisibleCount(count);
        };

        const observer = new ResizeObserver(() => {
            requestAnimationFrame(update);
        });

        observer.observe(containerRef.current);
        requestAnimationFrame(update);

        return () => observer.disconnect();
    }, [displayedTags, tagWidths, isDragging]);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button === 2) {
            e.preventDefault();
            onScriptContextMenu(e, s);
            return;
        }
        if (e.button === 0) {
            setIsLeftPressed(true);
        }
        onMouseDown(e, s);
    };

    const handleMouseUp = () => setIsLeftPressed(false);
    const handleMouseLeave = () => setIsLeftPressed(false);

    return (
        <div
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onDoubleClick={() => !isDragging && onDoubleClick(s)}
            className={`flex items-center justify-between h-[42px] px-3 rounded-lg transition-all duration-300 border border-transparent select-none relative
                ${isEditing ? 'z-[200] !opacity-100' : 'z-10'}
                ${!draggedScriptPath ? 'hover:z-[100] group hover:bg-white/5 cursor-grab active:cursor-grabbing' : ''}
                long-press-shrink has-[button:active]:scale-100

                ${s.path === draggedScriptPath ? 'opacity-0 pointer-events-none' : ''}
                ${s.is_hidden && visibilityMode !== 'only' ? 'opacity-40 grayscale-[0.5]' : ''}
                ${s.is_running ? 'border-green-500/10' : ''}
                ${isLeftPressed ? 'active-left' : ''}
                ${isContextMenuOpen ? 'bg-white/5 shadow-xl' : ''}
            `}
        >
            <div className="flex items-center space-x-4 overflow-visible flex-1 mr-4">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 transition-all duration-500
                    ${isPending ? 'bg-yellow-500 animate-pulse shadow-[0_0_10px_rgba(234,179,8,0.6)]' :
                        s.is_running ? 'bg-green-500 animate-status-glow shadow-[0_0_12px_rgba(34,197,94,0.8)]' : 'bg-white/10'}
                `}></div>
                <span className={`text-base font-medium tracking-tight truncate min-w-0 transition-colors stabilize-text ${!isDragging ? (isEditing || isContextMenuOpen ? 'text-indigo-400' : 'text-secondary/90 group-hover:text-white') : 'text-secondary/50'
                    }`}>
                    <HighlightText text={s.filename.replace(/\.ahk$/i, '')} variant="file" />
                </span>

                {!isDragging && (
                    <div ref={containerRef} className="flex-1 flex items-center pr-2 min-w-[130px] w-0">
                        {/* Hidden measuring container */}
                        <div ref={measureRef} className="absolute opacity-0 pointer-events-none flex whitespace-nowrap -z-50">
                            {displayedTags.map(t => (
                                <span key={t} className="text-xs font-bold px-3 h-7 rounded-lg mr-2 leading-none flex items-center bg-white/5 border border-white/5">{t}</span>
                            ))}
                        </div>

                        {/* Visible tags */}
                        {displayedTags.slice(0, visibleCount).map(tag => {
                            const isRemoving = removingTagKeys.includes(`${s.path}-${tag}`);
                            return (
                                <div key={tag}
                                    className="relative group/tag inline-flex items-center h-7 mr-2 flex-shrink-0 pointer-events-auto"
                                    onDoubleClick={(e) => e.stopPropagation()}
                                >
                                    <div className={isRemoving ? 'animate-tag-out' : (newTagsSet.has(tag) ? 'animate-tag-in' : '')}>
                                        <span className="text-xs font-bold px-3 h-7 rounded-lg bg-white/[0.03] text-tertiary border border-white/10 cursor-default shadow-lg flex items-center justify-center">
                                            {tag}
                                        </span>
                                    </div>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onRemoveTag(s, tag); }}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onDoubleClick={(e) => e.stopPropagation()}
                                        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover/tag:opacity-100 transition-all shadow-lg hover:scale-125 active:scale-90 cursor-pointer z-50 pointer-events-auto border-none"
                                        title={t("context.delete_tag_simple", { tag: tag })}
                                    >
                                        <svg width="8" height="2" viewBox="0 0 8 2" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M1 1h6" /></svg>
                                    </button>
                                </div>
                            );
                        })}
                        {displayedTags.length > visibleCount && (
                            <span className="h-7 px-2 rounded-lg bg-white/5 border border-white/10 text-[10px] font-black text-indigo-400 flex items-center justify-center mr-2 flex-shrink-0 cursor-default shadow-xl">
                                +{displayedTags.length - visibleCount}
                            </span>
                        )}

                        <button
                            ref={addBtnRef}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (isEditing) {
                                    onCloseEditing();
                                } else {
                                    onStartEditing(s);
                                }
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                            onDoubleClick={(e) => e.stopPropagation()}
                            className={`w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg bg-white/5 text-tertiary border border-white/5 hover:text-indigo-400 hover:bg-white/10 transition-all shadow-lg group/plus cursor-pointer pointer-events-auto ${isEditing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                        >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        </button>

                        {isEditing && (
                            <TagPickerPopover
                                script={s}
                                allUniqueTags={allUniqueTags}
                                popoverRef={popoverRef}
                                onAdd={onAddTag}
                                onClose={onCloseEditing}
                                variant="tree"
                                anchorRef={addBtnRef}
                            />
                        )}
                    </div>
                )}
            </div>

            {!isDragging && (
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center space-x-2 pointer-events-auto">
                    {s.is_running && !isPending && s.has_ui && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onShowUI(s); }}
                            onMouseDown={(e) => e.stopPropagation()}
                            className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg bg-white/5 text-tertiary border border-white/5 hover:bg-indigo-500/10 hover:text-indigo-400 hover:border-indigo-500/20 transition-all cursor-pointer pointer-events-auto"
                            title="Interface"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                <line x1="3" y1="9" x2="21" y2="9" />
                                <line x1="9" y1="21" x2="9" y2="9" />
                            </svg>
                        </button>
                    )}
                    {s.is_running && !isPending && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onRestart(s); }}
                            onMouseDown={(e) => e.stopPropagation()}
                            className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg bg-white/5 text-tertiary border border-white/5 hover:bg-yellow-500/10 hover:text-yellow-500 hover:border-yellow-500/20 transition-all cursor-pointer pointer-events-auto"
                            title="Restart"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M23 4v6h-6"></path>
                                <path d="M1 20v-6h6"></path>
                                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                            </svg>
                        </button>
                    )}
                    <button
                        onClick={(e) => { e.stopPropagation(); !isPending && onToggle(s); }}
                        onMouseDown={(e) => e.stopPropagation()}
                        className={`w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg transition-all transform cursor-pointer active:scale-95 pointer-events-auto border 
                            ${isPending ? (
                                pendingType === 'restart' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20 animate-pulse' :
                                    pendingType === 'kill' ? 'bg-red-500/10 text-red-500 border-red-500/20 animate-pulse' :
                                        'bg-green-500/10 text-green-500 border-green-500/20 animate-pulse'
                            ) : s.is_running ? 'bg-white/5 text-tertiary border-white/5 hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/20' : 'bg-white/5 text-tertiary border-white/5 hover:bg-green-500/10 hover:text-green-500 hover:border-green-500/20'}
                        `}
                        title={isPending ? (pendingType === 'restart' ? "Restarting..." : "Toggling...") : (s.is_running ? "Kill" : "Run")}
                    >
                        {isPending ? (
                            <div className="text-[10px] items-center justify-center flex font-bold h-full">...</div>
                        ) : s.is_running ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="5 3 19 12 5 21 5 3"></polygon>
                            </svg>
                        )}
                    </button>
                </div>
            )}
        </div>
    );
}, (prev, next) => {
    return prev.s.path === next.s.path &&
        prev.s.is_running === next.s.is_running &&
        prev.s.is_hidden === next.s.is_hidden &&
        prev.s.has_ui === next.s.has_ui &&
        prev.s.filename === next.s.filename &&
        prev.s.tags.join(',') === next.s.tags.join(',') &&
        prev.isDragging === next.isDragging &&
        prev.draggedScriptPath === next.draggedScriptPath &&
        prev.isEditing === next.isEditing &&
        prev.isPending === next.isPending &&
        prev.isContextMenuOpen === next.isContextMenuOpen &&
        prev.removingTagKeys.join(',') === next.removingTagKeys.join(',') &&
        prev.allUniqueTags.join(',') === next.allUniqueTags.join(',') &&
        prev.visibilityMode === next.visibilityMode &&
        prev.onShowUI === next.onShowUI &&
        prev.onRestart === next.onRestart;
});

export default ScriptRow;
