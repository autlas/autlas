import { ReactNode, useEffect, useRef, useState } from "react";
import { toast, Toaster, type ToasterProps } from "sonner";
import { CheckCircle, Warning, XCircle, Info, X } from "@phosphor-icons/react";

// ─── Toast taxonomy ─────────────────────────────────────────────────
//
//  appToast.success — реакция на действие пользователя удалась
//                     ("я нажал → получилось")
//  appToast.warning — failed action / нужно внимание / ожидание
//  appToast.error   — операция провалилась
//  appToast.info    — фоновое сообщение, не реакция на клик пользователя
//
// Если сомневаешься success vs info: "это ответ на мой клик/хоткей?".
//   Да → success / warning / error.
//   Нет (watcher, таймер, фон) → info.
//
// Все 4 пресета следуют правилам docs/TOAST_UX_GUIDE.md:
//  • цвет + ИКОНКА (не только цвет — WCAG 1.4.1)
//  • role=alert/aria-live=assertive только для error
//  • error persistent + close-кнопка обязательна
//  • warning тоже persistent по умолчанию (но можно переопределить)
//  • success/info auto-dismiss (3-5с)
//  • close-кнопка появляется автоматически если duration === Infinity
// ────────────────────────────────────────────────────────────────────

// ── Глобальная пауза для всех тостов одновременно ──
// Hover на ЛЮБОМ тосте → все таймеры замораживаются. Mouse leave с
// последнего тоста → 300мс задержка, потом все продолжают одновременно.
const RESUME_DELAY = 300;
let hoverDepth = 0;
let globalResumeTimer: number | null = null;
let globalPaused = false;
const hoverSubs = new Set<(paused: boolean) => void>();
const setGlobalPaused = (v: boolean) => {
    if (globalPaused === v) return;
    globalPaused = v;
    hoverSubs.forEach(fn => fn(v));
};
const onToastHoverEnter = () => {
    hoverDepth++;
    if (globalResumeTimer !== null) { clearTimeout(globalResumeTimer); globalResumeTimer = null; }
    setGlobalPaused(true);
};
const onToastHoverLeave = () => {
    hoverDepth = Math.max(0, hoverDepth - 1);
    if (hoverDepth > 0) return;
    if (globalResumeTimer !== null) clearTimeout(globalResumeTimer);
    globalResumeTimer = window.setTimeout(() => {
        globalResumeTimer = null;
        setGlobalPaused(false);
    }, RESUME_DELAY);
};

type Kind = "success" | "warning" | "error" | "info";

interface KindConfig {
    Icon: typeof CheckCircle;
    iconColor: string;       // tailwind text-* для иконки
    glow: string;            // box-shadow вокруг иконки
    duration: number;        // дефолт; Infinity = persistent
    role: "status" | "alert";
    live: "polite" | "assertive";
}

const CONFIG: Record<Kind, KindConfig> = {
    success: {
        Icon: CheckCircle,
        iconColor: "text-green-400",
        glow: "drop-shadow-[0_0_6px_rgba(34,197,94,0.6)]",
        duration: 3500,
        role: "status",
        live: "polite",
    },
    info: {
        Icon: Info,
        iconColor: "text-sky-400",
        glow: "drop-shadow-[0_0_6px_rgba(14,165,233,0.6)]",
        duration: 4500,
        role: "status",
        live: "polite",
    },
    warning: {
        Icon: Warning,
        iconColor: "text-amber-400",
        glow: "drop-shadow-[0_0_6px_rgba(245,158,11,0.6)]",
        duration: 7000,
        role: "status",
        live: "polite",
    },
    error: {
        Icon: XCircle,
        iconColor: "text-red-400",
        glow: "drop-shadow-[0_0_6px_rgba(239,68,68,0.7)]",
        duration: Infinity, // WCAG 2.2.3 — errors must persist
        role: "alert",
        live: "assertive",
    },
};

interface Opts {
    id?: string;
    duration?: number;          // override default; Infinity = persistent
    pulse?: boolean;            // pulsing icon (для прогресса)
    right?: ReactNode;          // слот справа (action-кнопки)
    closeButton?: boolean;      // явный override; иначе авто для persistent
}

const ToastBody = ({
    kind,
    message,
    opts,
    toastId,
    duration,
}: {
    kind: Kind;
    message: ReactNode;
    opts: Opts;
    toastId: string | number;
    duration: number;
}) => {
    const cfg = CONFIG[kind];
    const { Icon } = cfg;
    const showClose = opts.closeButton ?? true;
    const showProgress = duration !== Infinity;

    // ── Прогресс-полоска + dismiss-таймер в одном rAF-loop ──
    // 100% → 0% за `duration`мс. Пауза управляется ГЛОБАЛЬНО: hover на любом
    // тосте останавливает все, mouse-leave с последнего → 300мс задержка,
    // дальше все возобновляются одновременно. Sonner-у duration:Infinity —
    // владеем dismiss сами, чтобы визуал и реальный таймер не расходились.
    const [width, setWidth] = useState(100);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!showProgress) return;
        setWidth(100);
        let elapsed = 0;
        let lastTick = performance.now();
        let paused = false;
        let rafId = 0;
        let didEnter = false;

        // Подписываемся на глобальное состояние паузы. На переходе
        // unpause → сбрасываем lastTick чтобы не зачесть простой как elapsed.
        const onGlobalPaused = (p: boolean) => {
            if (!p && paused) lastTick = performance.now();
            paused = p;
        };
        hoverSubs.add(onGlobalPaused);

        const el = containerRef.current;
        const enter = () => { didEnter = true; onToastHoverEnter(); };
        const leave = () => { if (didEnter) { didEnter = false; onToastHoverLeave(); } };
        el?.addEventListener("mouseenter", enter);
        el?.addEventListener("mouseleave", leave);

        const tick = () => {
            const now = performance.now();
            if (!paused) elapsed += now - lastTick;
            lastTick = now;
            const pct = Math.max(0, 100 - (elapsed / duration) * 100);
            setWidth(pct);
            if (elapsed >= duration) {
                toast.dismiss(toastId);
                return;
            }
            rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);

        return () => {
            cancelAnimationFrame(rafId);
            hoverSubs.delete(onGlobalPaused);
            el?.removeEventListener("mouseenter", enter);
            el?.removeEventListener("mouseleave", leave);
            // если тост размонтировался во время hover — не оставляем
            // глобальный счётчик в задранном состоянии.
            if (didEnter) onToastHoverLeave();
        };
    }, [showProgress, duration, toastId]);

    return (
        <div
            ref={containerRef}
            role={cfg.role}
            aria-live={cfg.live}
            className="relative overflow-hidden flex items-center gap-3 w-full px-4 py-3 bg-black/20 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl motion-reduce:transition-none"
        >
            {showProgress && (
                <div
                    aria-hidden
                    className="absolute inset-y-0 left-0 bg-white/5 motion-reduce:hidden"
                    style={{ width: `${width}%` }}
                />
            )}
            <Icon
                size={18}
                weight="fill"
                className={`relative flex-shrink-0 ${cfg.iconColor} ${cfg.glow} ${opts.pulse ? "animate-pulse motion-reduce:animate-none" : ""}`}
            />
            <span className="relative text-xs font-medium text-white/70 flex-1">{message}</span>
            {opts.right && <div className="relative">{opts.right}</div>}
            {showClose && (
                <button
                    onClick={() => toast.dismiss(toastId)}
                    aria-label="Dismiss notification"
                    className="relative ml-1 text-white/30 hover:text-white/60 transition-colors cursor-pointer flex-shrink-0"
                >
                    <X size={14} weight="bold" />
                </button>
            )}
        </div>
    );
};

// ─── Дедупликация ────────────────────────────────────────────────────
// Если один и тот же (kind + message) выстреливает несколько раз внутри
// окна — не плодим стек, а инкрементим счётчик ×N в существующем тосте.
// Дедуп идёт по содержимому, не по user-id, чтобы scan-progress (один id,
// разные сообщения "Найдено: N") по-прежнему работал как replace.
const DEDUP_WINDOW = 3000;
const dedupMap = new Map<string, { count: number; timer: number }>();

const render = (kind: Kind, message: ReactNode, opts: Opts = {}) => {
    const msgStr = typeof message === "string" ? message : JSON.stringify(message);
    const dedupKey = `${kind}:${msgStr}`;
    const toastId = opts.id ?? dedupKey;

    const existing = dedupMap.get(dedupKey);
    const count = existing ? existing.count + 1 : 1;
    if (existing?.timer) clearTimeout(existing.timer);
    const timer = window.setTimeout(() => dedupMap.delete(dedupKey), DEDUP_WINDOW);
    dedupMap.set(dedupKey, { count, timer });

    const finalMessage: ReactNode = count > 1
        ? <span>{message}<span className="ml-1.5 text-white/40">×{count}</span></span>
        : message;

    const duration = opts.duration ?? CONFIG[kind].duration;
    // Sonner-у duration:Infinity — отсчётом владеет ToastBody, чтобы держать
    // визуальную полоску и реальный dismiss в одном таймере (с pause/resume).
    return toast.custom(
        (id) => <ToastBody kind={kind} message={finalMessage} opts={opts} toastId={id} duration={duration} />,
        { id: toastId, duration: Infinity }
    );
};

export const appToast = {
    success: (message: ReactNode, opts?: Opts) => render("success", message, opts),
    warning: (message: ReactNode, opts?: Opts) => render("warning", message, opts),
    error:   (message: ReactNode, opts?: Opts) => render("error",   message, opts),
    info:    (message: ReactNode, opts?: Opts) => render("info",    message, opts),
    dismiss: (id?: string) => toast.dismiss(id),
};

export interface AppToasterProps extends ToasterProps {}

export const AppToaster = (props: AppToasterProps) => (
    <Toaster
        position="bottom-right"
        theme="dark"
        hotkey={["altKey", "KeyT"]}
        toastOptions={{ className: "bg-black/20 backdrop-blur-md border border-white/10 rounded-2xl" }}
        {...props}
    />
);

AppToaster.displayName = "AppToaster";

// ─── Action button для right-слота тоста ────────────────────────────
// Единый стиль для всех action-кнопок в тостах. По гайду MD/Atlassian
// тост может содержать максимум одну action-кнопку.
interface ToastButtonProps {
    onClick: () => void;
    children: ReactNode;
    variant?: "primary" | "danger";
}

export const ToastButton = ({ onClick, children, variant = "primary" }: ToastButtonProps) => {
    const styles = variant === "danger"
        ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
        : "bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30";
    return (
        <button
            onClick={onClick}
            className={`px-3 py-1 text-[11px] font-bold uppercase tracking-wider whitespace-nowrap rounded-lg transition-colors cursor-pointer ${styles}`}
        >
            {children}
        </button>
    );
};

export default AppToaster;
