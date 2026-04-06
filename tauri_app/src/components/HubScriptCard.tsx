import React, { useState, memo } from "react";
import { HubScriptCardProps } from "../types/script";
import TagPickerPopover from "./TagPickerPopover";
import { HighlightText } from "./HighlightText";
import { useTranslation } from "react-i18next";
import { PlusIcon, CloseIcon, RestartIcon, PlayIcon, InterfaceIcon, MinusIcon, StarIcon } from "./ui/Icons";
import { useTreeStore } from "../store/useTreeStore";
import Tooltip from "./ui/Tooltip";
import { formatDate } from "../utils/formatDate";


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
    const sortBy = useTreeStore(store => store.sortBy);
    const showInfo = sortBy !== "name";
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
    const isHub = s.tags.some(t => ["hub", "fav", "favourites"].includes(t.toLowerCase()));

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
                ${isFocused && isVimMode ? 'vim-focus-instant !bg-indigo-500/20 shadow-[0_0_40px_rgba(99,102,241,0.2)] ring-2 ring-indigo-500/30' : 'transition-all duration-150'}
                ${!draggedScriptPath
                    ? `${isVimMode ? '' : 'group hover:z-[100] hover:bg-[var(--bg-tertiary-hover)]'} ${isEditing || isContextMenuOpen ? 'shadow-2xl bg-[var(--bg-tertiary-hover)]' : (isVimMode ? 'bg-[var(--bg-tertiary)]' : 'bg-[var(--bg-tertiary)] hover:shadow-2xl cursor-pointer')}`

                    : (s.path === draggedScriptPath ? 'opacity-0 pointer-events-none' : 'z-10')}
                ${s.is_running && !isDragging ? '' : ''}
                ${s.is_hidden && visibilityMode === 'only' ? 'ring-2 ring-indigo-500/50' : ''}
                ${isLeftPressed && !isEditing ? 'active-left' : ''}
                ${isContextMenuOpen || isEditing ? 'border-indigo-500/30' : ''}
            `}
            style={{ borderColor: (isContextMenuOpen || isEditing) ? 'rgba(99, 102, 241, 0.5)' : 'var(--border-color)' }}
        >
            <div className="flex justify-between items-start pointer-events-none">
                <div className="flex items-center overflow-hidden flex-1 -mt-[8px] gap-2">
                    <span className={`text-xl font-black truncate pr-0 transition-colors tracking-tight stabilize-text ${!isDragging ? (isEditing || isContextMenuOpen ? 'text-indigo-400' : 'text-secondary') : 'text-secondary'}`}>
                        <HighlightText text={s.filename.replace(/\.ahk$/i, '')} variant="file" />
                    </span>
                    <Tooltip text={isHub ? t("tooltips.remove_from_hub") : t("tooltips.add_to_hub")}>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (isHub) onRemoveTag(s, "hub");
                            else onAddTag(s, "hub");
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => e.stopPropagation()}
                        className={`w-[28px] h-[28px] flex-shrink-0 flex items-center justify-center rounded-lg pointer-events-auto transition-all cursor-pointer ${isHub ? 'text-white/40 hover:text-white/70' : 'text-white/20 hover:text-white/40'} ${isHub ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                    >
                        <StarIcon size={16} weight={isHub ? "fill" : "bold"} />
                    </button>
                    </Tooltip>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0">
                    <span className="text-xs text-tertiary/50 font-mono">{
                        showInfo
                            ? (sortBy === "created" ? formatDate(s.created_at)
                                : sortBy === "modified" ? formatDate(s.modified_at)
                                : sortBy === "last_run" ? (s.last_run ? formatDate(s.last_run) : "—")
                                : formatSize(s.size))
                            : "\u200B"
                    }</span>
                    <div className={`w-3 h-3 rounded-full transition-all duration-500 ${isPending ? (pendingType === 'kill' ? 'bg-red-500 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.6)]' : 'bg-yellow-500 animate-pulse shadow-[0_0_10px_rgba(234,179,8,0.6)]') : s.is_running ? 'bg-green-500 animate-status-glow shadow-[0_0_12px_rgba(34,197,94,0.8)]' : 'bg-white/10'} ${isDragging ? 'opacity-20' : ''}`}></div>
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
                                    <span className={`h-[42px] text-xs px-5 bg-[var(--bg-tertiary)] border border-white/5 text-secondary font-bold rounded-xl shadow-lg leading-none flex items-center transition-opacity ${isDragging ? 'opacity-20' : ''}`}>{tag}</span>
                                </div>
                                <Tooltip text={t("context.delete_tag_simple", { tag: tag })}>
                                <button
                                    onClick={(e) => { e.stopPropagation(); onRemoveTag(s, tag); }}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onDoubleClick={(e) => e.stopPropagation()}
                                    className={`absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center transition-all shadow-xl hover:scale-125 active:scale-90 cursor-pointer z-50 border-none ${isDragging ? 'opacity-0 pointer-events-none' : 'opacity-0 group-hover/tag:opacity-100'}`}
                                >
                                    <MinusIcon size={10} />
                                </button>
                                </Tooltip>
                            </div>
                        );
                    })}
                    <Tooltip text={t("tooltips.add_tag")}>
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
                                ${isDragging ? 'opacity-0 pointer-events-none' : (isEditing || (isFocused && isVimMode) ? 'opacity-100 bg-[var(--bg-tertiary)]' : 'opacity-0 group-hover:opacity-100')}`}
                    >
                        <PlusIcon />
                    </button>
                    </Tooltip>
                </div>
            </div>

            <div className={`mt-auto transition-opacity duration-200 ${isDragging ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                {s.is_running ? (
                    <div className="flex items-center gap-2">
                        {s.has_ui && (
                            <Tooltip text={t("tooltips.interface")}>
                            <button
                                onClick={(e) => { e.stopPropagation(); onShowUI(s); }}
                                onMouseDown={(e) => e.stopPropagation()}
                                className={`h-[42px] rounded-2xl flex items-center justify-center bg-[var(--bg-tertiary)] text-[#71717a] border border-white/5 hover:bg-indigo-500/10 hover:text-indigo-400 hover:border-indigo-500/30 transition-all duration-150 cursor-pointer pointer-events-auto overflow-hidden ${!isPending ? 'flex-1 opacity-100' : 'w-0 flex-[0] opacity-0 border-0 px-0'} ${!isPending ? 'animate-action-in' : ''}`}
                            >
                                <InterfaceIcon size={22} />
                            </button>
                            </Tooltip>
                        )}
                        <Tooltip text={pendingType === 'restart' ? t("tooltips.restarting") : t("tooltips.restart_script")}>
                        <button
                            onClick={(e) => { e.stopPropagation(); onRestart(s); }}
                            onMouseDown={(e) => e.stopPropagation()}
                            className={`h-[42px] rounded-2xl flex items-center justify-center transition-all duration-150 cursor-pointer pointer-events-auto overflow-hidden whitespace-nowrap
                                ${pendingType === 'restart'
                                    ? 'flex-1 bg-yellow-500/10 text-yellow-500 border border-yellow-500/30 animate-pulse'
                                    : isPending
                                        ? 'w-0 flex-[0] opacity-0 border-0 px-0'
                                        : 'flex-1 bg-[var(--bg-tertiary)] text-[#71717a] border border-white/5 hover:bg-yellow-500/10 hover:text-yellow-500 hover:border-yellow-500/30 animate-action-in'
                                }`}
                            style={!isPending ? { animationDelay: `${s.has_ui ? 50 : 0}ms` } : undefined}
                        >
                            {pendingType === 'restart'
                                ? <span className="text-[14px] font-bold tracking-[0.1em]">{t("hub_card.restarting")}</span>
                                : <RestartIcon size={22} />
                            }
                        </button>
                        </Tooltip>
                        <Tooltip text={pendingType === 'kill' ? t("tooltips.stopping") : t("tooltips.kill_script")}>
                        <button
                            onClick={(e) => { e.stopPropagation(); onToggle(s); }}
                            onMouseDown={(e) => e.stopPropagation()}
                            className={`h-[42px] rounded-2xl flex items-center justify-center transition-all duration-150 cursor-pointer pointer-events-auto shadow-xl active:scale-95 overflow-hidden whitespace-nowrap
                                ${pendingType === 'kill'
                                    ? 'flex-1 bg-red-500/10 text-red-500 border border-red-500/30 animate-pulse'
                                    : isPending
                                        ? 'w-0 flex-[0] opacity-0 border-0 px-0'
                                        : 'flex-1 bg-[var(--bg-tertiary)] text-[#71717a] border border-white/5 hover:bg-red-500/15 hover:text-red-500 hover:border-red-500/30 animate-action-in'
                                }`}
                            style={!isPending ? { animationDelay: `${s.has_ui ? 100 : 50}ms` } : undefined}
                        >
                            {pendingType === 'kill'
                                ? <span className="text-[14px] font-bold tracking-[0.1em]">{t("hub_card.killing")}</span>
                                : <CloseIcon size={22} />
                            }
                        </button>
                        </Tooltip>
                    </div>
                ) : (
                    <Tooltip text={isPending ? t("tooltips.starting") : t("tooltips.run")}>
                    <button
                        onClick={(e) => { e.stopPropagation(); !isPending && onToggle(s); }}
                        onMouseDown={(e) => e.stopPropagation()}
                        className={`w-full h-[42px] rounded-2xl text-[14px] font-bold tracking-[0.1em] transition-all transform cursor-pointer active:scale-95 pointer-events-auto shadow-xl
                            ${isPending
                                ? 'bg-green-500/10 text-green-500 border border-green-500/30 animate-pulse'
                                : "bg-[var(--bg-tertiary)] text-[#71717a] border border-white/5 hover:bg-green-600/15 hover:text-green-500 hover:border-green-500/30"
                            }
                        `}
                    >
                        {isPending ? (
                            t("hub_card.igniting")
                        ) : (
                            <div className="flex items-center justify-center">
                                <PlayIcon size={22} />
                            </div>
                        )}
                    </button>
                    </Tooltip>
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
