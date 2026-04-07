import { useRef, useState, useEffect, cloneElement, ReactElement } from "react";
import Tooltip from "./Tooltip";

/**
 * Wraps a single element and shows a tooltip with `text` only when that
 * element's content is actually clipped by `text-overflow: ellipsis`. We
 * detect truncation by comparing scrollWidth to clientWidth, and re-check on
 * resize via ResizeObserver.
 *
 * Edge case: when not truncated we pass an empty string to Tooltip, which
 * causes it to bypass mouse handlers entirely. If the layout then changes
 * and the text becomes truncated, the next render re-attaches handlers — the
 * user just needs to re-hover. That trade keeps the implementation tiny and
 * avoids paying for Tooltip's portal logic on thousands of non-truncated rows.
 */
interface Props {
    text: string;
    children: ReactElement<any>;
}

export default function TruncatedTooltip({ text, children }: Props) {
    const ref = useRef<HTMLElement | null>(null);
    const [overflowing, setOverflowing] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const check = () => {
            // +1 guards against sub-pixel rounding (clientWidth is integer,
            // scrollWidth can read as +1 even when text fits visually).
            setOverflowing(el.scrollWidth > el.clientWidth + 1);
        };
        check();
        const ro = new ResizeObserver(check);
        ro.observe(el);
        return () => ro.disconnect();
    }, [text]);

    const mergedRef = (node: HTMLElement | null) => {
        ref.current = node;
        const childRef = (children.props as any).ref;
        if (typeof childRef === "function") childRef(node);
        else if (childRef && typeof childRef === "object") {
            (childRef as React.MutableRefObject<HTMLElement | null>).current = node;
        }
    };

    const child = cloneElement(children, { ref: mergedRef });
    return <Tooltip text={overflowing ? text : ""}>{child}</Tooltip>;
}
