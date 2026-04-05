import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { CloseIcon } from "./ui/Icons";

export interface PendingMatch {
    orphan_id: string;
    old_path: string;
    new_path: string;
    match_type: string;
}

function extractFilename(path: string): string {
    return path.split(/[/\\]/).pop() || path;
}

function extractParent(path: string): string {
    const parts = path.split(/[/\\]/);
    parts.pop();
    return parts.slice(-2).join("\\");
}

export function OrphanToast({ count, onReview, onDismiss }: { count: number; onReview: () => void; onDismiss: () => void }) {
    const { t } = useTranslation();
    return (
        <div className="flex items-center gap-3 px-5 py-3 bg-[#1a1a1f] border border-white/10 rounded-2xl shadow-2xl">
            <div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
            <span className="text-xs font-medium text-white/70">
                {count === 1 ? t("orphan.toast_one") : t("orphan.toast_many", { count })}
            </span>
            <button
                onClick={onReview}
                className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-400 rounded-lg hover:bg-indigo-500/30 transition-colors cursor-pointer"
            >
                {t("orphan.review")}
            </button>
            <button
                onClick={onDismiss}
                className="ml-1 text-white/30 hover:text-white/60 transition-colors cursor-pointer"
            >
                <CloseIcon size={12} />
            </button>
        </div>
    );
}

export default function OrphanReconcileDialog({ matches, onClose, onResolved, onMatchResolved }: {
    matches: PendingMatch[];
    onClose: () => void;
    onResolved: () => void;
    onMatchResolved?: (orphanId: string) => void;
}) {
    const { t } = useTranslation();
    const [resolving, setResolving] = useState<Set<string>>(new Set());
    const [resolved, setResolved] = useState<Set<string>>(new Set());

    const handleLink = async (match_: PendingMatch) => {
        setResolving(prev => new Set(prev).add(match_.orphan_id));
        try {
            await invoke("resolve_orphan", { orphanId: match_.orphan_id, action: "link", newPath: match_.new_path });
            setResolved(prev => new Set(prev).add(match_.orphan_id));
            onMatchResolved?.(match_.orphan_id);
        } catch (e) {
            console.error("Failed to link orphan:", e);
        } finally {
            setResolving(prev => { const n = new Set(prev); n.delete(match_.orphan_id); return n; });
        }
    };

    const handleDiscard = async (match_: PendingMatch) => {
        setResolving(prev => new Set(prev).add(match_.orphan_id));
        try {
            await invoke("resolve_orphan", { orphanId: match_.orphan_id, action: "discard" });
            setResolved(prev => new Set(prev).add(match_.orphan_id));
            onMatchResolved?.(match_.orphan_id);
        } catch (e) {
            console.error("Failed to discard orphan:", e);
        } finally {
            setResolving(prev => { const n = new Set(prev); n.delete(match_.orphan_id); return n; });
        }
    };

    const handleLinkAll = async () => {
        for (const m of remaining) {
            await handleLink(m);
        }
    };

    const remaining = matches.filter(m => !resolved.has(m.orphan_id));
    const allDone = remaining.length === 0;

    if (allDone) {
        setTimeout(() => { onResolved(); onClose(); }, 600);
    }

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div
                className="bg-[#0a0a0c] border border-white/10 rounded-[28px] shadow-2xl w-[560px] max-h-[70vh] flex flex-col overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-6 pt-5 pb-4 flex items-center justify-between flex-shrink-0">
                    <div>
                        <h2 className="text-base font-black text-white">{t("orphan.title")}</h2>
                        <p className="text-xs text-white/30 mt-1">
                            {allDone
                                ? t("orphan.all_done")
                                : remaining.length === 1 ? t("orphan.subtitle_one") : t("orphan.subtitle_many", { count: remaining.length })
                            }
                        </p>
                    </div>
                    <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors cursor-pointer p-1">
                        <CloseIcon size={16} />
                    </button>
                </div>

                {/* Items */}
                <div className="px-6 pb-5 overflow-y-auto flex-1 min-h-0 custom-scrollbar space-y-2">
                    {matches.map(m => {
                        const isDone = resolved.has(m.orphan_id);
                        const isWorking = resolving.has(m.orphan_id);
                        return (
                            <div
                                key={m.orphan_id}
                                className={`rounded-2xl border p-4 transition-all duration-300 ${
                                    isDone
                                        ? "border-green-500/20 bg-green-500/5 opacity-50 scale-[0.98]"
                                        : "border-white/5 bg-white/[0.02]"
                                }`}
                            >
                                <div className="flex items-start gap-3">
                                    {/* Arrow indicator */}
                                    <div className="flex flex-col items-center pt-1 flex-shrink-0">
                                        <div className="w-1.5 h-1.5 rounded-full bg-red-400/60" />
                                        <div className="w-px h-5 bg-white/10" />
                                        <div className="w-1.5 h-1.5 rounded-full bg-green-400/60" />
                                    </div>

                                    {/* Paths */}
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs text-white/25 truncate" title={m.old_path}>
                                            <span className="text-white/40">{extractFilename(m.old_path)}</span>
                                            <span className="ml-2">{extractParent(m.old_path)}</span>
                                        </div>
                                        <div className="text-xs text-white/40 truncate mt-1.5" title={m.new_path}>
                                            <span className="text-white/70 font-medium">{extractFilename(m.new_path)}</span>
                                            <span className="ml-2">{extractParent(m.new_path)}</span>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    {!isDone && (
                                        <div className="flex gap-1.5 flex-shrink-0">
                                            <button
                                                onClick={() => handleLink(m)}
                                                disabled={isWorking}
                                                className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider bg-green-500/15 text-green-400 rounded-lg hover:bg-green-500/25 transition-colors cursor-pointer disabled:opacity-30"
                                            >
                                                {t("orphan.link")}
                                            </button>
                                            <button
                                                onClick={() => handleDiscard(m)}
                                                disabled={isWorking}
                                                className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider bg-white/5 text-white/40 rounded-lg hover:bg-white/10 hover:text-white/60 transition-colors cursor-pointer disabled:opacity-30"
                                            >
                                                {t("orphan.skip")}
                                            </button>
                                        </div>
                                    )}
                                    {isDone && (
                                        <span className="text-[11px] font-bold text-green-400/60 uppercase tracking-wider">{t("orphan.done")}</span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Footer */}
                {remaining.length > 1 && (
                    <div className="px-6 py-4 border-t border-white/5 flex justify-end gap-3 flex-shrink-0">
                        <button
                            onClick={handleLinkAll}
                            className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider bg-green-500/15 text-green-400 rounded-xl hover:bg-green-500/25 transition-colors cursor-pointer"
                        >
                            {t("orphan.link_all")}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
