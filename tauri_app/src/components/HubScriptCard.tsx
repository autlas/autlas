import React, { useState, memo } from "react";
import { HubScriptCardProps } from "../types/script";
import TagPickerPopover from "./TagPickerPopover";
import { HighlightText } from "./HighlightText";
import { useTranslation } from "react-i18next";
import { PlusIcon, CloseIcon, RestartIcon, PlayIcon, InterfaceIcon } from "./ui/Icons";
import ActionButton from "./ui/ActionButton";
import { useTreeStore } from "../store/useTreeStore";


function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const HubScriptCard = memo(function HubScriptCard({
    s, isDragging, draggedScriptPath, editingScript, pendingScripts, removingTags,
    isContextMenuOpen, allUniqueTags, popoverRef, visibilityMode, onMouseDown, onToggle, onStartEditing, onAddTag, onRemoveTag, onCloseEditing,
    onScriptContextMenu, onShowUI, onRestart,
    setFocusedPath, onSelectScript
}: HubScriptCardProps) {
    const isFocused = useTreeStore(store => store.focusedPath === s.path);
    const isVimMode = useTreeStore(store => store.isVimMode);
    const showFileSize = useTreeStore(store => store.showFileSize);
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
    const handleClick = (e: React.MouseEvent) => {
        if (e.button !== 0) return;
        const target = e.target as HTMLElement;
        if (target.closest('button') || target.closest('input')) return;
        onSelectScript?.(s);
    };

    const isEditing = editingScript === s.path;
    const pendingType = pendingScripts[s.path];
    const isPending = !!pendingType;

    return (
        <div
            ref={cardRef}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onClick={handleClick}
            onMouseEnter={() => {
                if (!isVimMode) setFocusedPath(s.path);
            }}
            onDoubleClick={() => !isDragging && onToggle(s)}
            id={`script-${s.path}`}
            className={`pt-[21px] pb-6 px-6 rounded-[24px] border flex flex-col select-none relative long-press-shrink ${isEditing ? 'z-[200]' : 'z-10'}
                ${isFocused && isVimMode ? 'vim-focus-instant !bg-indigo-500/20 shadow-[0_0_40px_rgba(99,102,241,0.2)] ring-2 ring-indigo-500/30' : 'transition-all duration-300'}
                ${!draggedScriptPath
                    ? `${isVimMode ? '' : 'group hover:z-[100] hover:bg-white/[0.06]'} ${isEditing || isContextMenuOpen ? 'shadow-2xl bg-white/[0.05]' : (isVimMode ? 'bg-white/[0.03]' : 'bg-white/[0.03] hover:shadow-2xl cursor-pointer')}`

                    : (s.path === draggedScriptPath ? 'opacity-0 pointer-events-none' : 'z-10')}
                ${s.is_running && !isDragging ? '' : ''}
                ${s.is_hidden && visibilityMode === 'only' ? 'ring-2 ring-indigo-500/50' : ''}
                ${isLeftPressed && !isEditing ? 'active-left' : ''}
                ${isContextMenuOpen || isEditing ? 'border-indigo-500/30' : ''}
            `}
            style={{ borderColor: (isContextMenuOpen || isEditing) ? 'rgba(99, 102, 241, 0.5)' : 'var(--border-color)' }}
        >
            <div className="flex justify-between items-start pointer-events-none">
                <div className="flex flex-col overflow-hidden flex-1 -mt-[8px]">
                    <span className={`text-xl font-black truncate pr-4 transition-colors tracking-tight stabilize-text ${!isDragging ? (isEditing || isContextMenuOpen ? 'text-indigo-400' : 'text-secondary') : 'text-secondary'}`}>
                        <HighlightText text={s.filename.replace(/\.ahk$/i, '')} variant="file" />
                    </span>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0">
                    {showFileSize && (
                        <span className="text-xs text-tertiary/50 font-mono">{formatSize(s.size)}</span>
                    )}
                    <div className={`w-3 h-3 rounded-full transition-all duration-500 ${isPending ? 'bg-yellow-500 animate-pulse shadow-[0_0_10px_rgba(234,179,8,0.6)]' : s.is_running ? 'bg-green-500 animate-status-glow shadow-[0_0_12px_rgba(34,197,94,0.8)]' : 'bg-white/10'} ${isDragging ? 'opacity-20' : ''}`}></div>
                </div>
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
                                <button
                                    onClick={(e) => { e.stopPropagation(); onRemoveTag(s, tag); }}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onDoubleClick={(e) => e.stopPropagation()}
                                    className={`absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center transition-all shadow-xl hover:scale-125 active:scale-90 cursor-pointer z-50 border-none ${isDragging ? 'opacity-0 pointer-events-none' : 'opacity-0 group-hover/tag:opacity-100'}`}
                                    title={t("context.delete_tag_simple", { tag: tag })}
                                >
                                    <svg width="10" height="2" viewBox="0 0 10 2" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                        <path d="M1 1h8" />
                                    </svg>
                                </button>
                            </div>
                        );
                    })}
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
                        className={`w-[42px] h-[42px] flex items-center justify-center border border-dashed border-white/10 rounded-xl transition-all cursor-pointer pointer-events-auto text-[#666] hover:text-[#aaa] hover:border-white/20 
                                ${isDragging ? 'opacity-0 pointer-events-none' : (isEditing || (isFocused && isVimMode) ? 'opacity-100 bg-white/5' : 'opacity-0 group-hover:opacity-100')}`}
                    >
                        <PlusIcon />
                    </button>
                </div>
            </div>

            <div className={`mt-auto transition-opacity duration-200 ${isDragging ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                {s.is_running && !isPending ? (
                    <div className="flex items-center gap-2">
                        {s.has_ui && (
                            <ActionButton color="indigo" variant="wide" onClick={() => onShowUI(s)} title={t("tooltips.interface")}>
                                <InterfaceIcon size={17} />
                            </ActionButton>
                        )}
                        <ActionButton color="yellow" variant="wide" onClick={() => onRestart(s)} title={t("tooltips.restart_script")}>
                            <RestartIcon size={17} />
                        </ActionButton>
                        <ActionButton color="red" variant="wide" onClick={() => onToggle(s)} title={t("tooltips.kill_script")} className="shadow-xl active:scale-95">
                            <CloseIcon size={17} />
                        </ActionButton>
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
                            pendingType === 'restart' ? t("hub_card.restarting") :
                                pendingType === 'kill' ? t("hub_card.killing") : t("hub_card.igniting")
                        ) : (
                            <div className="flex items-center justify-center">
                                <PlayIcon size={17} />
                            </div>
                        )}
                    </button>
                )}
            </div>
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
