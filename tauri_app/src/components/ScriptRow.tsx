import React, { useState, memo, useRef, useLayoutEffect } from "react";
import { ScriptRowProps } from "../types/script";
import TagPickerPopover from "./TagPickerPopover";
import { HighlightText } from "./HighlightText";
import { useTreeStore } from "../store/useTreeStore";
import { useTranslation } from "react-i18next";
import { PlusIcon, CloseIcon, RestartIcon, PlayIcon, InterfaceIcon } from "./ui/Icons";
import ActionButton from "./ui/ActionButton";

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ScriptRow = memo(function ScriptRow({
    s, isDragging, draggedScriptPath, isEditing, isPending, pendingType, isContextMenuOpen, removingTagKeys,
    allUniqueTags, popoverRef, visibilityMode,
    onMouseDown, onDoubleClick, onToggle, onStartEditing, onAddTag, onRemoveTag, onCloseEditing,
    onScriptContextMenu, onShowUI, onRestart,
    setFocusedPath, onSelectScript
}: ScriptRowProps) {
    const { t } = useTranslation();
    const isFocused = useTreeStore(store => store.focusedPath === s.path);
    const isVimMode = useTreeStore(store => store.isVimMode);
    const showFileSize = useTreeStore(store => store.showFileSize);

    const [isLeftPressed, setIsLeftPressed] = useState(false);
    const [visibleCount, setVisibleCount] = useState(s.tags.length);
    const containerRef = useRef<HTMLDivElement>(null);
    const measureRef = useRef<HTMLDivElement>(null);
    const [tagWidths, setTagWidths] = useState<number[]>([]);
    const tagWidthsRef = useRef<number[]>([]);
    const prevTagsRef = useRef<string[]>(s.tags);
    const newTagsSet = new Set(s.tags.filter(t => !prevTagsRef.current.includes(t)));
    const addBtnRef = useRef<HTMLButtonElement>(null);

    // Filtered tags for display (hide system tags)
    const displayedTags = s.tags.filter(t => !["hub", "fav", "favourites"].includes(t.toLowerCase()));

    const recalcVisible = () => {
        if (!containerRef.current) return;
        const containerWidth = containerRef.current.offsetWidth;
        if (containerWidth < 30) return;
        const widths = tagWidthsRef.current;
        const ADD_BTN_WIDTH = 36;
        const COUNTER_WIDTH = 42;
        const available = containerWidth - ADD_BTN_WIDTH;

        if (widths.length === 0 || widths.length < displayedTags.length) return;

        let totalWidth = 0;
        let count = 0;
        for (let i = 0; i < widths.length; i++) {
            const isLast = (i === widths.length - 1);
            const reqSpace = totalWidth + widths[i] + (isLast ? 0 : COUNTER_WIDTH);
            if (reqSpace > available) break;
            totalWidth += widths[i];
            count++;
        }
        if (count === 0 && widths.length > 0) count = 1;
        setVisibleCount(count);
    };

    useLayoutEffect(() => {
        prevTagsRef.current = s.tags;
        if (measureRef.current) {
            const children = Array.from(measureRef.current.children) as HTMLElement[];
            const widths = children.map(c => c.offsetWidth + 8);
            tagWidthsRef.current = widths;
            setTagWidths(widths);
        }
        recalcVisible();
    }, [s.tags]);

    useLayoutEffect(() => {
        if (!containerRef.current) return;

        const observer = new ResizeObserver(() => {
            requestAnimationFrame(recalcVisible);
        });

        observer.observe(containerRef.current);
        requestAnimationFrame(recalcVisible);

        return () => observer.disconnect();
    }, [displayedTags, tagWidths, isDragging]);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button === 2) {
            e.preventDefault();
            e.stopPropagation();
            onScriptContextMenu(e, s);
            return;
        }
        if (e.button === 0) {
            setIsLeftPressed(true);
        }
        onMouseDown(e, s);
    };

    const handleMouseUp = () => {
        setIsLeftPressed(false);
    };
    const handleMouseLeave = () => setIsLeftPressed(false);
    const handleClick = (e: React.MouseEvent) => {
        if (e.button !== 0) return;
        const target = e.target as HTMLElement;
        if (target.closest('button') || target.closest('input')) return;
        onSelectScript?.(s);
    };

    return (
        <div
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onClick={handleClick}
            onMouseEnter={() => {
                if (!isVimMode) setFocusedPath(s.path);
            }}
            onDoubleClick={() => !isDragging && onDoubleClick(s)}
            id={`script-${s.path}`}
            className={`flex items-center space-x-3 h-[42px] px-3 rounded-xl z-20 relative mb-1 border border-transparent hover:z-[50] scroll-mt-[250px] scroll-mb-[250px] long-press-shrink
                ${isFocused && isVimMode ? 'vim-focus-instant bg-indigo-500/25 shadow-[0_0_20px_rgba(99,102,241,0.15)]' : ''}
                ${!draggedScriptPath ? (isVimMode ? (isFocused ? '' : 'bg-transparent') : 'bg-transparent hover:bg-white/[0.05] cursor-pointer group') : 'bg-transparent text-tertiary cursor-default pointer-events-none'}
                ${(isContextMenuOpen || isEditing) ? 'bg-white/5 border-white/10' : ''}
                ${s.path === draggedScriptPath ? 'opacity-0 pointer-events-none' : ''}
                ${s.is_hidden && visibilityMode !== 'only' ? 'opacity-40 grayscale-[0.5]' : ''}
                ${s.is_running ? 'border-green-500/10' : ''}
                ${isLeftPressed ? 'active-left' : ''}
            `}
            style={{
                borderColor: (isContextMenuOpen || isEditing) ? 'rgba(255,255,255,0.1)' : 'transparent'
            }}
        >
            {isFocused && isVimMode && (
                <div className="absolute left-0 top-1 bottom-1 w-[3.5px] bg-indigo-500 rounded-full shadow-[0_0_15px_rgba(99,102,241,0.6)] z-20" />
            )}
            <div className="flex items-center space-x-4 overflow-visible flex-1 mr-4">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 transition-all duration-500
                    ${isPending ? (pendingType === 'kill' ? 'bg-red-500 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.6)]' : 'bg-yellow-500 animate-pulse shadow-[0_0_10px_rgba(234,179,8,0.6)]') :
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
                            className={`w-[28px] h-[28px] flex-shrink-0 flex items-center justify-center border border-dashed border-white/10 rounded-lg transition-all cursor-pointer pointer-events-auto text-[#666] hover:text-[#aaa] hover:border-white/20 ${isEditing || (isFocused && isVimMode) ? 'opacity-100 bg-white/5' : 'opacity-0 group-hover:opacity-100'}`}
                        >
                            <PlusIcon />
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
                <div className="relative flex items-center pointer-events-auto">
                    {showFileSize && (
                        <span className={`text-xs text-tertiary/50 font-mono flex-shrink-0 transition-opacity ${isFocused && isVimMode ? 'opacity-0' : 'opacity-100 group-hover:opacity-0'}`}>
                            {formatSize(s.size)}
                        </span>
                    )}
                    <div className={`${showFileSize ? 'absolute right-0' : ''} transition-opacity flex items-center space-x-2 ${isFocused && isVimMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                        {s.is_running && !isPending && s.has_ui && (
                            <ActionButton color="indigo" onClick={() => onShowUI(s)} title={t("tooltips.interface")} animateIn animationDelay={0}>
                                <InterfaceIcon />
                            </ActionButton>
                        )}
                        {s.is_running && !isPending && (
                            <ActionButton color="yellow" onClick={() => onRestart(s)} title={t("tooltips.restart")} animateIn animationDelay={s.has_ui ? 50 : 0}>
                                <RestartIcon />
                            </ActionButton>
                        )}
                        <button
                            onClick={(e) => { e.stopPropagation(); !isPending && onToggle(s); }}
                            onMouseDown={(e) => e.stopPropagation()}
                            className={`w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg transition-all transform cursor-pointer active:scale-95 pointer-events-auto border
                            ${isPending ? (
                                    pendingType === 'restart' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20 animate-pulse' :
                                        pendingType === 'kill' ? 'bg-red-500/10 text-red-500 border-red-500/20 animate-pulse' :
                                            'bg-green-500/10 text-green-500 border-green-500/20 animate-pulse'
                                ) : s.is_running ? 'bg-white/5 text-[#71717a] border-white/5 hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/20' : 'bg-white/5 text-[#71717a] border-white/5 hover:bg-green-500/10 hover:text-green-500 hover:border-green-500/20'}
                        `}
                            title={isPending ? (pendingType === 'restart' ? t("tooltips.restarting") : t("tooltips.toggling")) : (s.is_running ? t("tooltips.kill") : t("tooltips.run"))}
                        >
                            {isPending ? (
                                <div className="text-[10px] items-center justify-center flex font-bold h-full">...</div>
                            ) : s.is_running ? (
                                <CloseIcon />
                            ) : (
                                <PlayIcon />
                            )}
                        </button>
                    </div>
                </div>
            )}
        </div >
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
        prev.onRestart === next.onRestart &&
        prev.onSelectScript === next.onSelectScript;
});

export default ScriptRow;
