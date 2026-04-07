import { toast, Toaster, type ToasterProps, type ExternalToast } from "sonner";

// Единый glass-класс для всех тостов приложения.
const TOAST_CLASS = "bg-black/20 backdrop-blur-md border border-white/10 rounded-2xl";

// Слияние пользовательских опций с предустановленным className.
const withGlass = (opts?: ExternalToast): ExternalToast => ({
    ...opts,
    className: [TOAST_CLASS, opts?.className].filter(Boolean).join(" "),
});

// Враппер над sonner.toast.* с glass-стилем по умолчанию.
export const appToast = {
    success: (message: string, opts?: ExternalToast) => toast.success(message, withGlass(opts)),
    error: (message: string, opts?: ExternalToast) => toast.error(message, withGlass(opts)),
    warning: (message: string, opts?: ExternalToast) => toast.warning(message, withGlass(opts)),
    info: (message: string, opts?: ExternalToast) => toast.info(message, withGlass(opts)),
};

export interface AppToasterProps extends ToasterProps {}

// Обёртка над <Toaster/> с позицией bottom-right и glass-темой.
export const AppToaster = (props: AppToasterProps) => {
    return (
        <Toaster
            position="bottom-right"
            theme="dark"
            toastOptions={{
                className: TOAST_CLASS,
            }}
            {...props}
        />
    );
};

AppToaster.displayName = "AppToaster";

export default AppToaster;
