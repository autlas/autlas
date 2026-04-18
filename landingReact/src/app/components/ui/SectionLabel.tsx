interface SectionLabelProps {
    children: React.ReactNode;
    className?: string;
}

export default function SectionLabel({ children, className }: SectionLabelProps) {
    return (
        <span className={`text-2xs font-bold text-tertiary/50 uppercase tracking-widest ${className ?? ""}`}>
            {children}
        </span>
    );
}
