import { useId } from "react";
import {
    X, Minus, ArrowsCounterClockwise, Play, AppWindow,
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

export function TagDotIcon({ size = 18, className, weight = "bold" }: IconProps) {
    return <CircleDashed size={size} weight={weight} className={className} />;
}

// TagOff — mask approach: white shapes on black = no overlap, then fill with currentColor
export function TagOffIcon({ size = 18, className, weight = "bold" }: IconProps) {
    const id = useId();
    const maskId = `tagoff-${id}`;
    const isFill = weight === "fill";
    const tagPath = isFill
        ? "M243.31 136L144 36.69A15.86 15.86 0 0 0 132.69 32H40a8 8 0 0 0-8 8v92.69A15.86 15.86 0 0 0 36.69 144L136 243.31a16 16 0 0 0 22.63 0l84.68-84.68a16 16 0 0 0 0-22.63M84 96a12 12 0 1 1 12-12a12 12 0 0 1-12 12"
        : "m246.15 133.18l-99.32-99.32A19.85 19.85 0 0 0 132.69 28H40a12 12 0 0 0-12 12v92.69a19.85 19.85 0 0 0 5.86 14.14l99.32 99.32a20 20 0 0 0 28.28 0l84.69-84.69a20 20 0 0 0 0-28.28m-98.83 93.17L52 131V52h79l95.32 95.32ZM104 88a16 16 0 1 1-16-16a16 16 0 0 1 16 16";
    const slashPath = "M228.49 19.51a12 12 0 0 1 0 17l-192 192a12 12 0 0 1-17-17l192-192a12 12 0 0 1 17 0Z";
    return (
        <svg width={size} height={size} viewBox="0 0 256 256" className={className}>
            <defs>
                <mask id={maskId}>
                    <path d={tagPath} fill="white" />
                    <path d={slashPath} fill="white" />
                </mask>
            </defs>
            <rect width="256" height="256" fill="currentColor" mask={`url(#${maskId})`} />
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

// ── Dynamic tag icon from pre-built SVG paths ──

import { TAG_ICONS } from "../../data/tagIcons";

export function TagIconSvg({ name, size = 18, weight = "bold", className }: IconProps & { name: string }) {
    const paths = TAG_ICONS[name];
    if (!paths) return <CircleDashed size={size} weight={weight} className={className} />;
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 256 256"
            fill="currentColor"
            className={className}
            dangerouslySetInnerHTML={{ __html: paths[weight === "fill" ? 1 : 0] }}
        />
    );
}
