import React from "react";
import { tv, type VariantProps } from "tailwind-variants";

// Квадратная кнопка-иконка. Применяется для тег-кнопок, тулбар-действий и т.п.
export const iconButtonVariants = tv({
    base: "inline-flex items-center justify-center rounded-lg transition-all cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
    variants: {
        variant: {
            ghost: "bg-transparent text-white/40 hover:text-white/70 hover:bg-white/5",
            solid: "bg-[var(--bg-tertiary)] text-white/70 hover:bg-[var(--bg-tertiary-hover)] border border-[var(--border-color)]",
            accent: "bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 border border-indigo-500/20",
            actionIndigo: "bg-white/5 text-tertiary border border-white/5 hover:bg-indigo-500/10 hover:text-indigo-400 hover:border-indigo-500/20",
            actionRed: "bg-white/5 text-tertiary border border-white/5 hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/20",
            actionYellow: "bg-white/5 text-tertiary border border-white/5 hover:bg-yellow-500/10 hover:text-yellow-500 hover:border-yellow-500/20",
            actionGreen: "bg-white/5 text-tertiary border border-white/5 hover:bg-green-500/10 hover:text-green-500 hover:border-green-500/20",
        },
        size: {
            sm: "w-6 h-6 [&_svg]:w-3 [&_svg]:h-3",
            md: "w-7 h-7 [&_svg]:w-3.5 [&_svg]:h-3.5",
            lg: "w-8 h-8 [&_svg]:w-4 [&_svg]:h-4",
            xl: "w-[42px] h-[42px] [&_svg]:w-5 [&_svg]:h-5",
        },
    },
    defaultVariants: {
        variant: "ghost",
        size: "md",
    },
});

type IconButtonBaseProps = React.ButtonHTMLAttributes<HTMLButtonElement>;
type IconButtonVariantProps = VariantProps<typeof iconButtonVariants>;

export interface IconButtonProps extends IconButtonBaseProps, IconButtonVariantProps {
    icon: React.ReactNode;
}

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
    ({ className, variant, size, icon, ...rest }, ref) => {
        return (
            <button
                ref={ref}
                className={iconButtonVariants({ variant, size, className })}
                {...rest}
            >
                {icon}
            </button>
        );
    }
);

IconButton.displayName = "IconButton";

export default IconButton;
