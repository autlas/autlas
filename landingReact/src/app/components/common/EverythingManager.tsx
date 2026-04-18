import { useEffect, useState, useCallback, useRef, forwardRef, useImperativeHandle } from "react";
import { checkEverythingStatus, launchEverything, installEverything, openUrl } from "../../api";
import { appToast, ToastButton } from "../ui/AppToast";
import { CloseIcon } from "../ui/Icons";
import { useTranslation } from "react-i18next";

export interface EverythingManagerHandle {
  openInstallModal: () => void;
}

/**
 * Owns everything related to the Everything (voidtools) integration:
 *   - Startup status check: warn-toast if not running, success-toast if started.
 *   - Toast with Launch/Install buttons (status-dependent).
 *   - Auto-hide toast when Everything starts externally.
 *   - Install progress listener (`everything-install-progress` Tauri event).
 *   - Install modal (automatic download or manual voidtools.com).
 *
 * Exposes `openInstallModal()` via ref so the Settings panel's "Install"
 * button can trigger the modal without lifting state into App.
 */
const EverythingManager = forwardRef<EverythingManagerHandle>(function EverythingManager(_, ref) {
  const { t } = useTranslation();
  const [everythingToast, setEverythingToast] = useState<"installed" | "not_installed" | "launching" | "installing" | "started" | null>(null);
  const [installProgress, setInstallProgress] = useState<{ phase: string; progress: number } | null>(null);
  const [showInstallModal, setShowInstallModal] = useState(false);

  const hideToast = useCallback(() => {
    appToast.dismiss("everything");
    setTimeout(() => setEverythingToast(null), 500);
  }, []);

  const showStatusToast = useCallback((status: string) => {
    const isInstalled = status === "installed";
    const isStarted = status === "started";
    const message = isStarted
      ? t("settings.everything_toast_running")
      : isInstalled
        ? t("settings.everything_toast_installed")
        : t("settings.everything_toast_not_installed");
    // started → success (Everything заработал)
    // installed / not_installed → warning (опциональный ускоритель)
    const kind = isStarted ? "success" : "warning";
    appToast[kind](message, {
      id: "everything",
      duration: isStarted ? 3000 : Infinity,
      right: isInstalled ? (
        <ToastButton onClick={async () => {
          appToast.dismiss("everything");
          setEverythingToast("launching");
          try { await launchEverything(); setEverythingToast("started"); showStatusToast("started"); }
          catch (e) { console.error(e); setEverythingToast("installed"); showStatusToast("installed"); }
        }}>{t("settings.everything_launch")}</ToastButton>
      ) : status === "not_installed" ? (
        <ToastButton onClick={() => setShowInstallModal(true)}>
          {t("settings.everything_install")}
        </ToastButton>
      ) : undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Startup status check (StrictMode-safe: runs exactly once).
  const checkedRef = useRef(false);
  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;
    checkEverythingStatus().then(status => {
      if (status !== "running") {
        setEverythingToast(status);
        showStatusToast(status);
      }
    });
  }, [showStatusToast]);

  // Auto-hide when Everything starts running externally.
  useEffect(() => {
    if (everythingToast !== "installed") return;
    const interval = setInterval(async () => {
      const status = await checkEverythingStatus();
      if (status === "running") {
        setEverythingToast("started");
        showStatusToast("started");
        setTimeout(hideToast, 3000);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [everythingToast, hideToast, showStatusToast]);

  // Install progress events from Rust side (download %, install phase).
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    import("@tauri-apps/api/event").then(({ listen }) => {
      listen<{ phase: string; progress: number }>("everything-install-progress", (event) => {
        setInstallProgress(event.payload);
      }).then(fn => { unlisten = fn; });
    });
    return () => { if (unlisten) unlisten(); };
  }, []);

  useImperativeHandle(ref, () => ({
    openInstallModal: () => setShowInstallModal(true),
  }));

  if (!showInstallModal) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !installProgress && setShowInstallModal(false)} />
      <div className="relative bg-black/30 backdrop-blur-lg border border-white/15 rounded-3xl shadow-2xl w-[400px] p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold tracking-widest text-white/60 uppercase">Install Everything</h3>
          {!installProgress && (
            <button onClick={() => setShowInstallModal(false)} className="text-white/30 hover:text-white/60 transition-colors cursor-pointer"><CloseIcon size={14} /></button>
          )}
        </div>

        <p className="text-xs text-white/50 leading-relaxed">
          Everything enables instant file scanning — 30–100x faster than regular disk scan. Choose how to install:
        </p>

        {!installProgress ? (
          <div className="space-y-3">
            <button
              onClick={async () => {
                setInstallProgress({ phase: "downloading", progress: 0 });
                setEverythingToast("installing");
                try {
                  await installEverything();
                  setInstallProgress(null);
                  setShowInstallModal(false);
                  setEverythingToast("started");
                  showStatusToast("started");
                  setTimeout(hideToast, 3000);
                } catch (e) {
                  console.error(e);
                  setInstallProgress(null);
                  setEverythingToast("not_installed");
                }
              }}
              className="w-full py-3 bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/20 hover:border-indigo-500/40 rounded-2xl transition-all cursor-pointer group"
            >
              <div className="text-sm font-bold text-indigo-400 group-hover:text-indigo-300 transition-colors">Install Automatically</div>
              <div className="text-xs text-white/40 mt-1">Download and install silently via direct link</div>
            </button>

            <button
              onClick={() => {
                openUrl("https://www.voidtools.com/downloads/");
                setShowInstallModal(false);
              }}
              className="w-full py-3 bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 hover:border-white/20 rounded-2xl transition-all cursor-pointer group"
            >
              <div className="text-sm font-bold text-white/70 group-hover:text-white/90 transition-colors">Install Manually</div>
              <div className="text-xs text-white/40 mt-1">Open voidtools.com downloads page</div>
            </button>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)] animate-pulse" />
              <span className="text-xs font-medium text-white/70 flex-1">
                {installProgress.phase === "installing"
                  ? "Installing Everything…"
                  : `Downloading… ${installProgress.progress}%`}
              </span>
            </div>
            <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                style={{ width: `${installProgress.phase === "installing" ? 100 : installProgress.progress}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

export default EverythingManager;
