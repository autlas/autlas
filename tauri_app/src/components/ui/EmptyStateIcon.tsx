interface EmptyStateIconProps {
    groupName: string;
    hoverBg?: string;
    children: React.ReactNode;
}

export default function EmptyStateIcon({ groupName, hoverBg = "bg-white/5", children }: EmptyStateIconProps) {
    return (
        <div className={`w-24 h-24 rounded-[32px] bg-white/5 border border-white/10 flex items-center justify-center mx-auto shadow-2xl relative overflow-hidden group/${groupName}`}>
            <div className={`absolute inset-0 ${hoverBg} opacity-0 group-hover/${groupName}:opacity-100 transition-opacity`} />
            {children}
        </div>
    );
}
