import React, { useState, memo } from "react";
import { HubScriptCardProps } from "../types/script";
import TagPickerPopover from "./TagPickerPopover";
import { HighlightText } from "./HighlightText";
import { useTranslation } from "react-i18next";


const HubScriptCard = memo(function HubScriptCard({
    s, isDragging, draggedScriptPath, editingScript, pendingScripts, removingTags,
    isContextMenuOpen, allUniqueTags, popoverRef, visibilityMode, onMouseDown, onToggle, onStartEditing, onAddTag, onRemoveTag, onCloseEditing,
    onScriptContextMenu, onShowUI, onRestart
}: HubScriptCardProps) {
    const { t } = useTranslation();
    const cardRef = React.useRef<HTMLDivElement>(null);

    const [isLeftPressed, setIsLeftPressed] = useState(false);

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

    const handleMouseUp = () => setIsLeftPressed(false);
    const handleMouseLeave = () => setIsLeftPressed(false);

    const isEditing = editingScript === s.path;
    const pendingType = pendingScripts[s.path];
    const isPending = !!pendingType;

    return (
        <div
            ref={cardRef}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onDoubleClick={() => !isDragging && onToggle(s, true)}
            className={`p-6 rounded-[24px] border transition-all duration-300 flex flex-col select-none relative ${isEditing ? 'z-[200]' : 'z-10'}
                ${!draggedScriptPath
                    ? `group hover:z-[100] hover:bg-white/[0.06] ${isEditing || isContextMenuOpen ? 'shadow-2xl bg-white/[0.05]' : 'bg-white/[0.03] hover:shadow-2xl cursor-grab active:cursor-grabbing long-press-shrink'}`

                    : (s.path === draggedScriptPath ? 'opacity-0 pointer-events-none' : 'z-10')}
                ${s.is_running && !isDragging ? '' : ''}
                ${s.is_hidden && visibilityMode === 'only' ? 'ring-2 ring-indigo-500/50' : ''}
                ${isLeftPressed && !isEditing ? 'active-left' : ''}
                ${isContextMenuOpen || isEditing ? 'border-indigo-500/30' : ''}
            `}
            style={{ borderColor: (isContextMenuOpen || isEditing) ? 'rgba(99, 102, 241, 0.4)' : 'var(--border-color)' }}
        >
            <div className="flex justify-between items-start pointer-events-none">
                <div className="flex flex-col overflow-hidden flex-1 -mt-[8px]">
                    <span className={`text-xl font-black truncate pr-4 transition-colors tracking-tight stabilize-text ${!isDragging ? (isEditing || isContextMenuOpen ? 'text-indigo-400' : 'text-secondary') : 'text-secondary'}`}>
                        <HighlightText text={s.filename.replace(/\.ahk$/i, '')} variant="file" />
                    </span>
                </div>
                <div className={`w-4 h-4 rounded-full transition-all duration-500 ${s.is_running ? 'bg-green-500 animate-status-glow shadow-[0_0_12px_rgba(34,197,94,0.8)]' : 'bg-white/5 border border-white/10'} ${isDragging ? 'opacity-20' : ''}`}></div>
            </div>

            <div className="mt-4 mb-4">
                {isEditing && !isDragging && (
                    <TagPickerPopover
                        script={s}
                        allUniqueTags={allUniqueTags}
                        popoverRef={popoverRef}
                        onAdd={(script, tag) => onAddTag(script, tag)}
                        onClose={onCloseEditing}
                        variant="hub"
                        anchorRef={cardRef}
                    />
                )}
                <div className="flex flex-wrap gap-2 pointer-events-none">
                    {s.tags.filter(tag => !["hub", "fav", "favourites"].includes(tag.toLowerCase())).map(tag => {
                        const isRemoving = removingTags.has(`${s.path}-${tag}`);
                        return (
                            <div key={tag}
                                className="relative group/tag inline-flex items-center pointer-events-auto"
                                onDoubleClick={(e) => e.stopPropagation()}
                            >
                                <div className={isRemoving ? 'animate-tag-out' : 'animate-tag-in'}>
                                    <span className={`h-[42px] text-xs px-5 bg-white/5 border border-white/5 text-secondary font-bold rounded-xl shadow-lg leading-none flex items-center transition-opacity ${isDragging ? 'opacity-20' : ''}`}>{tag}</span>
                                </div>
                                {!isDragging && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onRemoveTag(s, tag); }}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onDoubleClick={(e) => e.stopPropagation()}
                                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover/tag:opacity-100 transition-all shadow-xl hover:scale-125 active:scale-90 cursor-pointer z-50 border-none"
                                        title={t("context.delete_tag_simple", { tag: tag })}
                                    >
                                        <svg width="10" height="2" viewBox="0 0 10 2" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                            <path d="M1 1h8" />
                                        </svg>
                                    </button>
                                )}
                            </div>
                        );
                    })}
                    {!isDragging && (
                        <button
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
                            className="w-[42px] h-[42px] flex items-center justify-center border border-dashed border-white/10 rounded-xl transition-all cursor-pointer pointer-events-auto opacity-0 group-hover:opacity-100 text-[#666] hover:text-[#aaa] hover:border-white/20"
                        >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="12" y1="5" x2="12" y2="19" />
                                <line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>

            {!isDragging && (
                <div className="mt-auto">
                    {s.is_running && !isPending ? (
                        <div className="flex items-center gap-2">
                            {s.has_ui && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); onShowUI(s); }}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    className="flex-1 h-[42px] rounded-2xl flex items-center justify-center bg-white/5 text-[#71717a] border border-white/5 hover:bg-indigo-500/10 hover:text-indigo-400 hover:border-indigo-500/30 transition-all cursor-pointer pointer-events-auto"
                                    title="Interface"
                                >
                                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                        <line x1="3" y1="9" x2="21" y2="9" />
                                        <line x1="9" y1="21" x2="9" y2="9" />
                                    </svg>
                                </button>
                            )}
                            <button
                                onClick={(e) => { e.stopPropagation(); onToggle(s); }}
                                onMouseDown={(e) => e.stopPropagation()}
                                className="flex-1 h-[42px] rounded-2xl flex items-center justify-center transition-all transform cursor-pointer active:scale-95 pointer-events-auto shadow-xl bg-white/5 text-[#71717a] border border-white/5 hover:bg-red-500/15 hover:text-red-500 hover:border-red-500/30"
                                title="Kill Script"
                            >
                                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); onRestart(s); }}
                                onMouseDown={(e) => e.stopPropagation()}
                                className="flex-1 h-[42px] rounded-2xl flex items-center justify-center bg-white/5 text-[#71717a] border border-white/5 hover:bg-yellow-500/10 hover:text-yellow-500 hover:border-yellow-500/30 transition-all cursor-pointer pointer-events-auto"
                                title="Restart Script"
                            >
                                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M23 4v6h-6"></path>
                                    <path d="M1 20v-6h6"></path>
                                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                                </svg>
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={(e) => { e.stopPropagation(); !isPending && onToggle(s); }}
                            onMouseDown={(e) => e.stopPropagation()}
                            className={`w-full h-[42px] rounded-2xl text-[14px] font-bold tracking-[0.1em] transition-all transform cursor-pointer active:scale-95 pointer-events-auto shadow-xl 
                                ${isPending ? (
                                    pendingType === 'restart' ? 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/30 animate-pulse' :
                                        pendingType === 'kill' ? 'bg-red-500/10 text-red-500 border border-red-500/30 animate-pulse' :
                                            'bg-green-500/10 text-green-500 border border-green-500/30 animate-pulse'
                                ) :
                                    "bg-white/5 text-[#71717a] border border-white/5 hover:bg-green-600/15 hover:text-green-500 hover:border-green-500/30 transition-all"
                                }
                            `}
                        >
                            {isPending ? (
                                pendingType === 'restart' ? "RESTARTING..." :
                                    pendingType === 'kill' ? "KILLING..." : "IGNITING..."
                            ) : (
                                <div className="flex items-center justify-center">
                                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <polygon points="5 3 19 12 5 21 5 3"></polygon>
                                    </svg>
                                </div>
                            )}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}, (prev, next) => {
    return prev.s.path === next.s.path &&
        prev.s.is_running === next.s.is_running &&
        prev.s.filename === next.s.filename &&
        prev.s.tags.join(',') === next.s.tags.join(',') &&
        prev.isDragging === next.isDragging &&
        prev.draggedScriptPath === next.draggedScriptPath &&
        prev.editingScript === next.editingScript &&
        prev.pendingScripts === next.pendingScripts &&
        prev.onRestart === next.onRestart &&
        prev.isContextMenuOpen === next.isContextMenuOpen &&
        prev.visibilityMode === next.visibilityMode;
});

export default HubScriptCard;
