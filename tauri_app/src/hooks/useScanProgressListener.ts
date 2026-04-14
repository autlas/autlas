import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { appToast, ToastButton } from "../components/ui/AppToast";
import type { PendingMatch } from "../components/common/OrphanReconcileDialog";
import React from "react";

interface Options {
  onOrphanMatches: (matches: PendingMatch[]) => void;
  onReviewOrphans: () => void;
}

/**
 * Subscribes to three scan-related Tauri events:
 *  - `scan-progress` (number): per-file count as disk is walked.
 *  - `scan-phase` (string): phase name (reconciling / loading-meta / enriching).
 *  - `orphan-matches-found` (PendingMatch[]): scripts that moved;
 *    user needs to confirm rename so tags aren't lost.
 *
 * Uses a StrictMode-safe unlisten pattern: if cleanup fires before `listen()`
 * resolves, we invoke the returned unlisten immediately to avoid duplicate
 * subscriptions (which would fire toasts ×2 on every event).
 */
export function useScanProgressListener({ onOrphanMatches, onReviewOrphans }: Options) {
  const { t } = useTranslation();
  useEffect(() => {
    let mounted = true;
    let unlistenProgress: (() => void) | null = null;
    let unlistenOrphan: (() => void) | null = null;
    let unlistenPhase: (() => void) | null = null;

    const safe = (assign: (fn: () => void) => void) => (fn: () => void) => {
      if (!mounted) { fn(); return; }
      assign(fn);
    };

    import("@tauri-apps/api/event").then(({ listen }) => {
      if (!mounted) return;
      listen<number>("scan-progress", (event) => {
        appToast.info(`${t("sidebar.scripts_found")} ${event.payload}`, { id: "scan", duration: Infinity, pulse: true });
      }).then(safe(fn => { unlistenProgress = fn; }));
      listen<string>("scan-phase", (event) => {
        const phase = event.payload;
        const msg = phase === "reconciling" ? t("sidebar.phase_reconciling", "Сверка с базой...")
          : phase === "loading-meta" ? t("sidebar.phase_loading_meta", "Загрузка тегов...")
          : phase === "enriching" ? t("sidebar.phase_enriching", "Проверка статусов...")
          : null;
        if (msg) appToast.info(msg, { id: "scan", duration: Infinity, pulse: true });
      }).then(safe(fn => { unlistenPhase = fn; }));
      listen<PendingMatch[]>("orphan-matches-found", (event) => {
        if (event.payload.length > 0) {
          onOrphanMatches(event.payload);
          const count = event.payload.length;
          appToast.warning(
            count === 1 ? t("orphan.toast_one") : t("orphan.toast_many", { count }),
            {
              id: "orphan", duration: Infinity,
              right: React.createElement(
                ToastButton,
                {
                  onClick: () => { onReviewOrphans(); appToast.dismiss("orphan"); },
                  children: t("orphan.review"),
                },
              ),
            },
          );
        }
      }).then(safe(fn => { unlistenOrphan = fn; }));
    });

    return () => {
      mounted = false;
      unlistenProgress?.();
      unlistenOrphan?.();
      unlistenPhase?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
