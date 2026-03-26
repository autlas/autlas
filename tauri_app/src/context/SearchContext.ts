import { createContext, useContext } from "react";

export interface SearchState {
    query: string;
    prefix?: 'file' | 'path' | null;
}

export const SearchContext = createContext<SearchState>({ query: "" });

export function useSearchQuery() {
    return useContext(SearchContext);
}
