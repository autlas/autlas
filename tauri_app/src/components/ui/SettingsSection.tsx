interface SettingsSectionProps {
    children: React.ReactNode;
    className?: string;
}

export default function SettingsSection({ children, className }: SettingsSectionProps) {
    return (
        <section className={`space-y-4 bg-white/[0.02] p-10 rounded-[2.5rem] border border-white/5 shadow-2xl ${className ?? ""}`}>
            {children}
        </section>
    );
}
