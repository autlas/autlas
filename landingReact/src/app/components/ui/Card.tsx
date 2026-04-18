import React from "react";
import { tv, type VariantProps } from "tailwind-variants";

// Карточка со слотами: root / header / body / footer.
// Построена через tv slots — можно кастомизировать любой слот через className-пропсы.
export const cardVariants = tv({
    slots: {
        base: "rounded-[24px] border border-[var(--border-color)] bg-[var(--bg-tertiary)] transition-colors",
        header: "px-6 py-4 border-b border-[var(--border-color)]",
        body: "px-6 py-4",
        footer: "px-6 py-4 border-t border-[var(--border-color)]",
    },
    variants: {
        variant: {
            default: {},
            interactive: {
                base: "hover:bg-[var(--bg-tertiary-hover)] cursor-pointer",
            },
            glass: {
                base: "bg-white/5 backdrop-blur-xl border-white/10",
            },
        },
    },
    defaultVariants: {
        variant: "default",
    },
});

type CardVariantProps = VariantProps<typeof cardVariants>;

export interface CardProps extends React.HTMLAttributes<HTMLDivElement>, CardVariantProps {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
    ({ className, variant, children, ...rest }, ref) => {
        const { base } = cardVariants({ variant });
        return (
            <div ref={ref} className={base({ className })} {...rest}>
                {children}
            </div>
        );
    }
);
Card.displayName = "Card";

export interface CardSectionProps extends React.HTMLAttributes<HTMLDivElement> {}

export const CardHeader = React.forwardRef<HTMLDivElement, CardSectionProps>(
    ({ className, ...rest }, ref) => {
        const { header } = cardVariants();
        return <div ref={ref} className={header({ className })} {...rest} />;
    }
);
CardHeader.displayName = "CardHeader";

export const CardBody = React.forwardRef<HTMLDivElement, CardSectionProps>(
    ({ className, ...rest }, ref) => {
        const { body } = cardVariants();
        return <div ref={ref} className={body({ className })} {...rest} />;
    }
);
CardBody.displayName = "CardBody";

export const CardFooter = React.forwardRef<HTMLDivElement, CardSectionProps>(
    ({ className, ...rest }, ref) => {
        const { footer } = cardVariants();
        return <div ref={ref} className={footer({ className })} {...rest} />;
    }
);
CardFooter.displayName = "CardFooter";

export default Card;
