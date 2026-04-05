import {
    Plus, X, Minus, ArrowsCounterClockwise, Play, AppWindow,
    MagnifyingGlass, Gear, PencilSimple, Folder, ArrowClockwise,
    ArrowsClockwise, Rocket, Stack, Tag, CircleDashed,
    ArrowSquareOut, Copy, PushPin, PushPinSlash, EyeSlash,
    CaretDown, CaretRight, Question, ListDashes, SquaresFour,
    ListBullets, Stop,
} from "@phosphor-icons/react";
import type { IconWeight } from "@phosphor-icons/react";

interface IconProps {
    size?: number;
    strokeWidth?: number;
    className?: string;
    fill?: string;
    weight?: IconWeight;
}

// ── 14px: inline actions (script row buttons, tags, chevrons) ──

export function PlusIcon({ size = 14, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
            <path d="M13.5 5a1.5 1.5 0 0 0-3 0v5.5H5a1.5 1.5 0 0 0 0 3h5.5V19a1.5 1.5 0 0 0 3 0v-5.5H19a1.5 1.5 0 0 0 0-3h-5.5V5Z" />
        </svg>
    );
}

export function CloseIcon({ size = 14, className, weight = "bold" }: IconProps) {
    return <X size={size} weight={weight} className={className} />;
}

export function MinusIcon({ size = 14, className, weight = "bold" }: IconProps) {
    return <Minus size={size} weight={weight} className={className} />;
}

export function RestartIcon({ size = 14, className, weight = "bold" }: IconProps) {
    return <ArrowsCounterClockwise size={size} weight={weight} className={className} />;
}

export function PlayIcon({ size = 14, className, weight = "bold" }: IconProps) {
    return <Play size={size} weight={weight} className={className} />;
}

export function InterfaceIcon({ size = 14, className, weight = "bold" }: IconProps) {
    return <AppWindow size={size} weight={weight} className={className} />;
}

export function ChevronDownIcon({ size = 14, className, weight = "bold" }: IconProps) {
    return <CaretDown size={size} weight={weight} className={className} />;
}

export function ChevronRightIcon({ size = 14, className, weight = "bold" }: IconProps) {
    return <CaretRight size={size} weight={weight} className={className} />;
}

export function CopyIcon({ size = 14, className, weight = "bold" }: IconProps) {
    return <Copy size={size} weight={weight} className={className} />;
}

export function RefreshIcon({ size = 14, className, weight = "bold" }: IconProps) {
    return <ArrowClockwise size={size} weight={weight} className={className} />;
}

// ── 18px: medium (sidebar, toolbar, search, context menu, toggles) ──

export function SearchIcon({ size = 18, className, weight = "bold" }: IconProps) {
    return <MagnifyingGlass size={size} weight={weight} className={className} />;
}

export function EditIcon({ size = 18, className, weight = "bold" }: IconProps) {
    return <PencilSimple size={size} weight={weight} className={className} />;
}

export function FolderIcon({ size = 18, className, weight = "bold" }: IconProps) {
    return <Folder size={size} weight={weight} className={className} />;
}

export function OpenWithIcon({ size = 18, className, weight = "bold" }: IconProps) {
    return <ArrowSquareOut size={size} weight={weight} className={className} />;
}

export function PinIcon({ size = 18, className, fill, weight }: IconProps) {
    return <PushPin size={size} weight={fill && fill !== "none" ? "fill" : (weight || "bold")} className={className} />;
}

export function UnpinIcon({ size = 18, className, weight = "bold" }: IconProps) {
    return <PushPinSlash size={size} weight={weight} className={className} />;
}

export function EyeOffIcon({ size = 18, className, weight = "bold" }: IconProps) {
    return <EyeSlash size={size} weight={weight} className={className} />;
}

export function LayersIcon({ size = 18, className, weight = "bold" }: IconProps) {
    return <Stack size={size} weight={weight} className={className} />;
}

export function TagIcon({ size = 18, className, weight = "bold" }: IconProps) {
    return <Tag size={size} weight={weight} className={className} />;
}

export function TagDotIcon({ size = 18, className }: IconProps) {
    return <CircleDashed size={size} weight="bold" className={className} />;
}

// TagOff — Phosphor tag-bold + diagonal slash overlay
export function TagOffIcon({ size = 18, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 256 256" fill="currentColor" className={className}>
            <path d="m246.15 133.18l-99.32-99.32A19.85 19.85 0 0 0 132.69 28H40a12 12 0 0 0-12 12v92.69a19.85 19.85 0 0 0 5.86 14.14l99.32 99.32a20 20 0 0 0 28.28 0l84.69-84.69a20 20 0 0 0 0-28.28m-98.83 93.17L52 131V52h79l95.32 95.32ZM104 88a16 16 0 1 1-16-16a16 16 0 0 1 16 16" />
            <line x1="228" y1="28" x2="28" y2="228" stroke="currentColor" strokeWidth="24" strokeLinecap="round" />
        </svg>
    );
}

export function RocketIcon({ size = 18, className, weight = "bold" }: IconProps) {
    return <Rocket size={size} weight={weight} className={className} />;
}

export function StopIcon({ size = 18, className, weight = "bold" }: IconProps) {
    return <Stop size={size} weight={weight} className={className} />;
}

// ── 22px: large (gear, sync, view mode, cheatsheet, card action buttons) ──

export function GearIcon({ size = 22, className, weight = "bold" }: IconProps) {
    return <Gear size={size} weight={weight} className={className} />;
}

export function SyncIcon({ size = 22, className, weight = "bold" }: IconProps) {
    return <ArrowsClockwise size={size} weight={weight} className={className} />;
}

export function HelpIcon({ size = 22, className, weight = "bold" }: IconProps) {
    return <Question size={size} weight={weight} className={className} />;
}

export function TreeViewIcon({ size = 22, className, weight = "bold" }: IconProps) {
    return <ListDashes size={size} weight={weight} className={className} />;
}

export function TilesViewIcon({ size = 22, className, weight = "bold" }: IconProps) {
    return <SquaresFour size={size} weight={weight} className={className} />;
}

export function ListViewIcon({ size = 22, className, weight = "bold" }: IconProps) {
    return <ListBullets size={size} weight={weight} className={className} />;
}
