import React from 'react';
import { useSearchQuery } from "../../context/SearchContext";

interface HighlightTextProps {
    text: string;
    variant?: 'file' | 'path'; // The current element is either a filename or a path fragment
    /** Script path — used to look up precomputed fuzzy match ranges. */
    scriptPath?: string;
}

function renderRanges(text: string, ranges: ReadonlyArray<readonly [number, number]>): React.ReactNode {
    // Sort ranges and merge overlapping ones so we don't produce overlapping spans.
    const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const [s, e] of sorted) {
        if (merged.length && s <= merged[merged.length - 1][1] + 1) {
            merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], e);
        } else {
            merged.push([s, e]);
        }
    }
    const parts: React.ReactNode[] = [];
    let last = 0;
    merged.forEach(([s, e], i) => {
        // fuse ranges are inclusive on both ends
        if (s > last) parts.push(<span key={`t${i}`}>{text.slice(last, s)}</span>);
        parts.push(
            <span key={`h${i}`} className="bg-indigo-500/40 text-white rounded-[2px] shadow-[0_0_10px_rgba(99,102,241,0.2)]">
                {text.slice(s, e + 1)}
            </span>
        );
        last = e + 1;
    });
    if (last < text.length) parts.push(<span key="tail">{text.slice(last)}</span>);
    return <>{parts}</>;
}

export const HighlightText: React.FC<HighlightTextProps> = ({ text, variant, scriptPath }) => {
    const { query, prefix, matches } = useSearchQuery();
    const q = query.trim();
    if (!q) return <>{text}</>;

    // logic: If there is a prefix (e.g., file:), only highlight if our variant matches that prefix.
    // If no prefix, highlight everywhere.
    const skipHighlight = prefix && variant && prefix !== variant;
    if (skipHighlight) return <>{text}</>;

    // Prefer precomputed fuzzy-match ranges when present: fuzzy queries
    // ("hbu" → "hub") don't work with plain indexOf, and the ranges fuse
    // returns already account for scattered/non-contiguous matches.
    if (matches && scriptPath && !prefix) {
        const entry = matches.get(scriptPath);
        const ranges = variant === "path" ? entry?.path : entry?.filename;
        if (ranges && ranges.length > 0) {
            // Validate that ranges fall within our text — fuse's `filename`
            // ranges point into the script's `filename`, but this component
            // may be rendering that filename with `.ahk` stripped. Clamp.
            const valid = ranges.filter(([s, e]) => s < text.length && e < text.length);
            if (valid.length > 0) return renderRanges(text, valid);
        }
        // No ranges for this variant → nothing to highlight (the match was
        // in the other field). Render plain text.
        return <>{text}</>;
    }

    // Literal prefix search (file:/path:) falls back to indexOf.
    const parts: React.ReactNode[] = [];
    const lower = text.toLowerCase();
    const lowerQ = q.toLowerCase();
    let last = 0;

    let idx = lower.indexOf(lowerQ, last);
    while (idx !== -1) {
        if (idx > last) {
            parts.push(<span key={last}>{text.slice(last, idx)}</span>);
        }
        parts.push(
            <span key={idx} className="bg-indigo-500/40 text-white rounded-[2px] shadow-[0_0_10px_rgba(99,102,241,0.2)]">
                {text.slice(idx, idx + q.length)}
            </span>
        );
        last = idx + q.length;
        idx = lower.indexOf(lowerQ, last);
    }

    if (last < text.length) {
        parts.push(<span key={last}>{text.slice(last)}</span>);
    }

    return <>{parts}</>;
};
