import { createContext, useContext } from "react";

export type HighlightRange = readonly [number, number];
export type SearchMatchesMap = Map<string, { filename?: ReadonlyArray<HighlightRange>; path?: ReadonlyArray<HighlightRange> }>;

export interface SearchState {
    query: string;
    prefix?: 'file' | 'path' | null;
    /** Precomputed fuzzy-match ranges per script, keyed by script path. */
    matches?: SearchMatchesMap;
}

export const SearchContext = createContext<SearchState>({ query: "" });

export function useSearchQuery() {
    return useContext(SearchContext);
}
