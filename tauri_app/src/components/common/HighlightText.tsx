import React from 'react';
import { useSearchQuery } from "../../context/SearchContext";

interface HighlightTextProps {
    text: string;
    variant?: 'file' | 'path'; // The current element is either a filename or a path fragment
}

export const HighlightText: React.FC<HighlightTextProps> = ({ text, variant }) => {
    const { query, prefix } = useSearchQuery();
    const q = query.trim();
    if (!q) return <>{text}</>;

    // logic: If there is a prefix (e.g., file:), only highlight if our variant matches that prefix.
    // If no prefix, highlight everywhere.
    const skipHighlight = prefix && variant && prefix !== variant;
    if (skipHighlight) return <>{text}</>;

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
