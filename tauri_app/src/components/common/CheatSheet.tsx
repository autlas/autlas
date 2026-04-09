import React from "react";
import { createPortal } from "react-dom";
import { HelpIcon } from "../ui/Icons";

const ShortcutItem = ({ keys, desc, sets }: { keys?: string[], desc: string, sets?: string[][] }) => (
    <div className="flex items-center justify-between group/item min-h-[40px]">
        <span className="text-secondary/80 text-sm group-hover/item:text-white transition-colors">{desc}</span>
        <div className="flex gap-3 ml-4 items-center">
            {sets ? (
                sets.map((set, i) => (
                    <React.Fragment key={i}>
                        {i > 0 && <span className="text-2xs text-white/30 font-black uppercase tracking-widest">or</span>}
                        <div className="flex gap-1.5">
                            {set.map((k, ki) => (
                                <kbd key={k + ki} className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-2xs font-bold text-white/50 shadow-sm min-w-[28px] text-center group-hover/item:text-indigo-400 group-hover/item:border-indigo-500/30 transition-all">
                                    {k}
                                </kbd>
                            ))}
                        </div>
                    </React.Fragment>
                ))
            ) : (
                <div className="flex gap-1.5">
                    {keys?.map((k, ki) => (
                        <kbd key={k + ki} className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-2xs font-bold text-white/50 shadow-sm min-w-[28px] text-center group-hover/item:text-indigo-400 group-hover/item:border-indigo-500/30 transition-all">
                            {k}
                        </kbd>
                    ))}
                </div>
            )}
        </div>
    </div>
);

const CheatSheet = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
    if (!isOpen) return null;
    return createPortal(
        <div
            className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300"
            onClick={onClose}
        >
            <div
                className="backdrop-blur-2xl border border-white/15 p-10 rounded-[40px] shadow-2xl w-auto mx-4 relative overflow-hidden group"
                style={{ backgroundColor: 'color-mix(in srgb, var(--bg-primary) 60%, transparent)' }}
                onClick={e => e.stopPropagation()}
            >
                {/* Decorative glow */}
                <div className="absolute -top-24 -left-24 w-48 h-48 bg-indigo-500/20 rounded-full blur-[80px] pointer-events-none" />
                <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-purple-500/20 rounded-full blur-[80px] pointer-events-none" />

                <h2 className="text-3xl font-black mb-8 text-white tracking-tight flex items-center">
                    <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center mr-4 text-white shadow-[0_0_20px_rgba(79,70,229,0.4)]">
                        <HelpIcon />
                    </div>
                    AHK Manager Shortcuts
                </h2>

                <div className="grid grid-cols-2 gap-x-12 gap-y-10">
                    <div className="space-y-4">
                        <h3 className="text-2xs font-black text-white/20 uppercase tracking-[0.3em] mb-6 flex items-center">
                            <span className="w-4 h-[2px] bg-indigo-500/30 mr-2" />
                            Navigation
                        </h3>
                        <ShortcutItem keys={['h', 'j', 'k', 'l']} desc="Navigate (HJKL)" />
                        <ShortcutItem sets={[['g', 'g'], ['G']]} desc="Scroll Top / Bottom" />
                        <ShortcutItem keys={['Enter']} desc="Run / Stop Script" />
                        <ShortcutItem keys={['Space']} desc="Open Script Details" />
                        <ShortcutItem keys={['Esc']} desc="Clear Focus / Close" />
                    </div>

                    <div className="flex flex-col gap-4">
                        <h3 className="text-2xs font-black uppercase tracking-[0.2em] text-indigo-400 flex items-center mb-2">
                            <span className="w-4 h-[2px] bg-indigo-500/30 mr-2" />
                            View & Search
                        </h3>
                        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                            <ShortcutItem sets={[['g', 'i'], ['Ctrl', 'F']]} desc="Focus Search" />
                            <ShortcutItem keys={['q']} desc="Tree / Tiles / List View Mode" />
                            <ShortcutItem keys={['s']} desc="Change Sort" />
                            <ShortcutItem keys={['?']} desc="Show Help" />
                            <ShortcutItem keys={['r']} desc="Restart Script" />
                            <ShortcutItem keys={['t']} desc="Edit Tags" />
                        </div>
                    </div>
                </div>

                <div className="mt-10 grid grid-cols-2 gap-x-12">
                    <div className="space-y-4">
                        <h3 className="text-2xs font-black text-white/20 uppercase tracking-[0.3em] mb-6 flex items-center">
                            <span className="w-4 h-[2px] bg-indigo-500/30 mr-2" />
                            Script Details Panel
                        </h3>
                        <ShortcutItem keys={['p']} desc="Pin / Unpin Panel" />
                        <ShortcutItem keys={['f']} desc="Show in Folder" />
                        <ShortcutItem keys={['Esc']} desc="Close Panel" />
                    </div>
                </div>

                <div className="mt-12 pt-8 border-t border-white/5 flex justify-between items-center">
                    <p className="text-white/30 text-xs font-medium italic">Holding navigation keys scales scroll speed.</p>
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 rounded-2xl bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 text-xs font-black tracking-widest uppercase transition-all border border-indigo-500/20 active:scale-95"
                    >
                        Got it
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default CheatSheet;
