import React, { useState, memo } from "react";
import { HubScriptCardProps } from "../types/script";
import TagPickerPopover from "./TagPickerPopover";
import { useTranslation } from "react-i18next";

const HubScriptCard = memo(function HubScriptCard({
    s, isDragging, draggedScriptPath, editingScript, isContextMenuOpen, pendingScripts, removingTags,
    allUniqueTags, popoverRef, visibilityMode, onMouseDown, onToggle, onStartEditing, onAddTag, onRemoveTag, onCloseEditing,
    onScriptContextMenu
}: HubScriptCardProps) {
    const { t } = useTranslation();
    const [isLeftPressed, setIsLeftPressed] = useState(false);
    const isEditing = editingScript === s.path;

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

    // Filter out system tags for display
    const displayedTags = s.tags.filter(tag => !["hub", "fav", "favourites"].includes(tag.toLowerCase()));

    return (
        <div
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onDoubleClick={() => !isDragging && onToggle(s, true)}
            className={`p-6 rounded-[24px] border transition-all duration-300 flex flex-col select-none relative ${isEditing ? 'z-[200]' : 'z-10'}
                ${!draggedScriptPath
                    ? `group hover:z-[100] hover:bg-white/[0.06] ${isEditing || isContextMenuOpen ? 'shadow-2xl bg-white/[0.05]' : 'bg-white/[0.03] hover:shadow-2xl cursor-grab active:cursor-grabbing long-press-shrink'}`

                    : (s.path === draggedScriptPath ? 'opacity-0 pointer-events-none' : 'z-10')}
                ${s.is_running && !isDragging ? '' : ''}
                ${s.is_hidden && visibilityMode !== 'only' ? 'opacity-40 grayscale-[0.5]' : ''}
                ${isLeftPressed && !isEditing ? 'active-left' : ''}
                ${isContextMenuOpen ? 'border-indigo-500/30' : ''}
            `}
            style={{ borderColor: isContextMenuOpen ? 'rgba(99, 102, 241, 0.4)' : 'var(--border-color)' }}
        >
            <div className="flex-1 space-y-6 pointer-events-none">
                <div className="flex justify-between items-start pointer-events-none">
                    <div className="flex flex-col overflow-hidden flex-1">
                        <span className={`text-xl font-black truncate pr-4 transition-colors tracking-tight stabilize-text ${isEditing || isContextMenuOpen ? 'text-indigo-400' : 'text-secondary'}`}>
                            {s.filename.replace(/\.ahk$/i, '')}
                        </span>
                    </div>
                    <div className={`w-4 h-4 rounded-full transition-all duration-500 
                        ${pendingScripts.has(s.path) ? 'bg-yellow-500 animate-pulse shadow-[0_0_10px_rgba(234,179,8,0.6)]' :
                            s.is_running ? 'bg-green-500 animate-status-glow shadow-[0_0_12px_rgba(34,197,94,0.8)]' : 'bg-white/10'} 
                    `}></div>
                </div>

                <div className="flex flex-wrap gap-2 pointer-events-none">
                    {displayedTags.length > 0 ? (
                        displayedTags.map(tag => (
                            <span
                                key={tag}
                                className={`px-4 h-7 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center shadow-md border transition-all
                                    ${removingTags.has(s.path + '-' + tag) ? 'animate-tag-out opacity-0' : ''}
                                    ${tag.toLowerCase() === 'fav' || tag.toLowerCase() === 'favourites' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 'bg-white/5 text-tertiary border-white/5'}
                                `}
                            >
                                {tag}
                            </span>
                        ))
                    ) : (
                        <span className="text-[10px] font-bold text-tertiary/20 uppercase tracking-[0.2em] italic py-1">no tags</span>
                    )}
                </div>
            </div>

            <div className="mt-8 flex items-center justify-between pointer-events-auto">
                <div className="flex items-center space-x-2">
                    <button
                        onClick={(e) => { e.stopPropagation(); onToggle(s); }}
                        className={`group/btn px-6 h-10 rounded-xl text-xs font-black uppercase tracking-[0.15em] transition-all shadow-lg active:scale-95 border
                            ${pendingScripts.has(s.path) ? 'bg-white/5 text-tertiary border-white/5 cursor-wait' :
                                s.is_running ? 'bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500 hover:text-white' :
                                    'bg-indigo-500/10 text-indigo-400 border-indigo-500/20 hover:bg-indigo-500 hover:text-white'}
                        `}
                    >
                        {pendingScripts.has(s.path) ? "Wait..." : s.is_running ? "Kill" : "Run"}
                    </button>

                    <button
                        onClick={(e) => { e.stopPropagation(); onStartEditing(s); }}
                        className={`h-10 w-10 flex items-center justify-center rounded-xl bg-white/5 border border-white/5 text-tertiary hover:text-indigo-400 hover:bg-white/10 transition-all group/edit shadow-md ${isEditing ? 'opacity-100 ring-2 ring-indigo-500/50' : 'opacity-0 group-hover:opacity-100'}`}
                        title={t("hub.edit_tags")}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                    </button>

                    {isEditing && (
                        <div className="relative">
                            <TagPickerPopover
                                script={s}
                                allUniqueTags={allUniqueTags}
                                popoverRef={popoverRef}
                                onAdd={onAddTag}
                                onClose={onCloseEditing}
                                variant="hub"
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}, (prev, next) => {
    return prev.s.path === next.s.path &&
        prev.s.is_running === next.s.is_running &&
        prev.s.is_hidden === next.s.is_hidden &&
        prev.s.tags.join(',') === next.s.tags.join(',') &&
        prev.isDragging === next.isDragging &&
        prev.draggedScriptPath === next.draggedScriptPath &&
        prev.editingScript === next.editingScript &&
        prev.pendingScripts === next.pendingScripts &&
        prev.isContextMenuOpen === next.isContextMenuOpen &&
        prev.visibilityMode === next.visibilityMode;
});

export default HubScriptCard;
