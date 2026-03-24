import React, { useState, memo } from "react";
import { ScriptRowProps } from "../types/script";
import TagPickerPopover from "./TagPickerPopover";

const ScriptRow = memo(function ScriptRow({
    s, isDragging, draggedScriptPath, isEditing, isPending, removingTagKeys,
    allUniqueTags, popoverRef,
    onMouseDown, onDoubleClick, onToggle, onStartEditing, onAddTag, onRemoveTag, onCloseEditing,
    onScriptContextMenu
}: ScriptRowProps) {
    const [isLeftPressed, setIsLeftPressed] = useState(false);

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
                long-press-shrink has-[button:active]:scale-100 will-change-transform
                ${s.path === draggedScriptPath ? 'opacity-0 pointer-events-none' : ''}
                ${s.is_hidden ? 'opacity-40 grayscale-[0.5]' : ''}
                ${s.is_running ? 'border-green-500/10' : ''}
                ${isLeftPressed ? 'active-left' : ''}
            `}
        >
            <div className="flex items-center space-x-4 overflow-visible flex-1 mr-4 pointer-events-none">
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0
                    ${isPending ? 'bg-yellow-500 animate-pulse shadow-[0_0_10px_rgba(234,179,8,0.6)]' :
                        s.is_running ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.6)]' : 'bg-white/10'}
                `}></div>
                <span className={`text-base font-medium tracking-tight truncate max-w-[200px] stabilize-text
                    ${isPending ? 'text-yellow-500/80 animate-pulse' :
                        s.is_running ? 'text-green-400 font-bold' : (isEditing ? 'text-primary' : 'text-secondary group-hover:text-primary')}
                `}>{s.filename}</span>

                {!isDragging && (
                    <div className="flex items-center space-x-2 flex-shrink-0 pr-2 overflow-visible relative">
                        {s.tags.map(t => {
                            const isRemoving = removingTagKeys.includes(`${s.path}-${t}`);
                            return (
                                <div key={t}
                                    className="relative group/tag inline-flex items-center h-7 mr-2 pointer-events-auto"
                                    onDoubleClick={(e) => e.stopPropagation()}
                                >
                                    <div className={isRemoving ? 'animate-tag-out' : 'animate-tag-in'}>
                                        <span className="text-xs font-bold px-3 h-7 rounded-lg bg-white/[0.03] text-tertiary border border-white/10 cursor-default shadow-lg flex items-center justify-center">
                                            {t}
                                        </span>
                                    </div>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onRemoveTag(s, t); }}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onDoubleClick={(e) => e.stopPropagation()}
                                        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover/tag:opacity-100 transition-all shadow-lg hover:scale-125 active:scale-90 cursor-pointer z-50 pointer-events-auto border-none"
                                        title={`Удалить тег ${t}`}
                                    >
                                        <svg width="8" height="2" viewBox="0 0 8 2" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M1 1h6" /></svg>
                                    </button>
                                </div>
                            );
                        })}
                        <button
                            onClick={(e) => { e.stopPropagation(); onStartEditing(s); }}
                            onMouseDown={(e) => e.stopPropagation()}
                            onDoubleClick={(e) => e.stopPropagation()}
                            className={`w-7 h-7 ml-1 flex items-center justify-center rounded-lg bg-white/5 text-tertiary border border-white/5 hover:text-indigo-400 hover:bg-white/10 transition-all shadow-lg group/plus cursor-pointer pointer-events-auto ${isEditing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
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
                            />
                        )}
                    </div>
                )}
            </div>

            {!isDragging && (
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center space-x-2 pointer-events-auto">
                    <button
                        onClick={(e) => { e.stopPropagation(); onToggle(s); }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => e.stopPropagation()}
                        className={`text-xs font-bold px-4 h-7 rounded-lg bg-white/5 border border-white/5 shadow-xl transition-all cursor-pointer active:scale-95 flex items-center justify-center
                            ${isPending ? 'text-white/20 animate-pulse cursor-wait' :
                                s.is_running ? 'text-red-500 hover:bg-red-500 hover:text-white' : 'text-indigo-400 hover:bg-indigo-500 hover:text-white'}
                        `}
                    >
                        {isPending ? "Wait..." : s.is_running ? "Kill" : "Run"}
                    </button>
                </div>
            )}
        </div>
    );
}, (prev, next) => {
    return prev.s.path === next.s.path &&
        prev.s.is_running === next.s.is_running &&
        prev.s.is_hidden === next.s.is_hidden &&
        prev.s.filename === next.s.filename &&
        prev.s.tags.join(',') === next.s.tags.join(',') &&
        prev.isDragging === next.isDragging &&
        prev.draggedScriptPath === next.draggedScriptPath &&
        prev.isEditing === next.isEditing &&
        prev.isPending === next.isPending &&
        prev.removingTagKeys.join(',') === next.removingTagKeys.join(',') &&
        prev.allUniqueTags.join(',') === next.allUniqueTags.join(',');
});

export default ScriptRow;
