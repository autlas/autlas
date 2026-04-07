import React from "react";
import { tv, type VariantProps } from "tailwind-variants";

// Обобщённая кнопка с вариантами через tailwind-variants.
// Используется как базовый примитив UI-кита.
export const buttonVariants = tv({
    base: "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
    variants: {
        variant: {
            primary: "bg-indigo-500 text-white hover:bg-indigo-400 border border-indigo-400/30",
            secondary: "bg-white/10 text-white backdrop-blur-xl border border-white/10 hover:bg-white/15",
            ghost: "bg-transparent text-white/70 border border-transparent hover:bg-white/5 hover:text-white",
            danger: "bg-red-500/90 text-white hover:bg-red-500 border border-red-400/30",
        },
        size: {
            sm: "h-8 px-3 text-xs",
            md: "h-10 px-4 text-sm",
            lg: "h-12 px-6 text-base",
        },
    },
    defaultVariants: {
        variant: "primary",
        size: "md",
    },
});

type ButtonBaseProps = React.ButtonHTMLAttributes<HTMLButtonElement>;
type ButtonVariantProps = VariantProps<typeof buttonVariants>;

export interface ButtonProps extends ButtonBaseProps, ButtonVariantProps {
    loading?: boolean;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
}

// Маленький inline-спиннер — круг с прозрачной стороной.
const Spinner = () => (
    <svg
        className="animate-spin h-4 w-4"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
    >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
);

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, loading, leftIcon, rightIcon, disabled, children, ...rest }, ref) => {
        const isDisabled = disabled || loading;
        return (
            <button
                ref={ref}
                disabled={isDisabled}
                className={buttonVariants({ variant, size, className })}
                {...rest}
            >
                {loading ? <Spinner /> : leftIcon}
                {children}
                {!loading && rightIcon}
            </button>
        );
    }
);

Button.displayName = "Button";

export default Button;
