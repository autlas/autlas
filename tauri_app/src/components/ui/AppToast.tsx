import { ReactNode } from "react";
import { toast, Toaster, type ToasterProps } from "sonner";

// ─── Toast color taxonomy ──────────────────────────────────────────────
//
//  success — действие пользователя удалось ("я нажал, получилось")
//  warning — что-то требует внимания / ожидание / частичный успех
//  error   — операция провалилась
//  info    — фоновое сообщение, не реакция на действие пользователя
//
// Если сомневаешься success vs info: задай себе вопрос "это ответ на мой
// клик/хоткей?". Да → success. Нет (watcher, таймер, фон) → info.
// ─────────────────────────────────────────────────────────────────────

type Kind = "success" | "warning" | "error" | "info";

const DOT: Record<Kind, string> = {
    success: "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]",
    warning: "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]",
    error:   "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.7)]",
    info:    "bg-sky-500 shadow-[0_0_8px_rgba(14,165,233,0.8)]",
};

interface Opts {
    id?: string;
    duration?: number;
    pulse?: boolean;
    right?: ReactNode;       // произвольный слот справа (кнопки и т.п.)
}

const render = (kind: Kind, message: ReactNode, opts: Opts = {}) => {
    const { id, duration = 3000, pulse = false, right } = opts;
    return toast.custom(() => (
        <div className="flex items-center gap-3 w-full px-5 py-3 bg-black/20 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl">
            <div className={`w-2 h-2 rounded-full ${DOT[kind]} ${pulse ? "animate-pulse" : ""}`} />
            <span className="text-xs font-medium text-white/70 flex-1">{message}</span>
            {right}
        </div>
    ), { id, duration });
};

export const appToast = {
    success: (message: ReactNode, opts?: Opts) => render("success", message, opts),
    warning: (message: ReactNode, opts?: Opts) => render("warning", message, opts),
    error:   (message: ReactNode, opts?: Opts) => render("error", message, opts),
    info:    (message: ReactNode, opts?: Opts) => render("info", message, opts),
    dismiss: (id?: string) => toast.dismiss(id),
};

export interface AppToasterProps extends ToasterProps {}

export const AppToaster = (props: AppToasterProps) => (
    <Toaster
        position="bottom-right"
        theme="dark"
        toastOptions={{ className: "bg-black/20 backdrop-blur-md border border-white/10 rounded-2xl" }}
        {...props}
    />
);

AppToaster.displayName = "AppToaster";

export default AppToaster;
