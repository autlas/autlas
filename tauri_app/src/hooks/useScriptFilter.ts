import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import Fuse from "fuse.js";
import { Script } from "../api";
import { TreeNode } from "../types/script";
import { useTreeStore } from "../store/useTreeStore";

/** Precomputed match ranges for highlighting, keyed by script path. */
export type SearchMatches = Map<string, { filename?: ReadonlyArray<readonly [number, number]>; path?: ReadonlyArray<readonly [number, number]> }>;

interface UseScriptFilterOptions {
    allScripts: Script[];
    filterTag: string;
    searchQuery: string;
    sortBy: "name" | "size" | "created" | "modified" | "last_run";
}

export function useScriptFilter({ allScripts, filterTag, searchQuery, sortBy }: UseScriptFilterOptions) {
    const { t } = useTranslation();
    const showHidden = useTreeStore(s => s.showHidden);
    const fuseThreshold = useTreeStore(s => s.fuseThreshold);
    const fuseMinMatchLen = useTreeStore(s => s.fuseMinMatchLen);
    const fuseFindAllMatches = useTreeStore(s => s.fuseFindAllMatches);
    const fuseSearchPath = useTreeStore(s => s.fuseSearchPath);

    const allUniqueTags = useMemo(() => {
        const tags = new Set<string>();
        allScripts.forEach(s => s.tags.forEach(t => tags.add(t)));
        return Array.from(tags).sort();
    }, [allScripts]);

    const searchMatchesRef = useRef<SearchMatches>(new Map());

    const filtered = useMemo(() => {
        const rawQuery = searchQuery.trim().toLowerCase();
        const matches: SearchMatches = new Map();

        const applySearch = (list: Script[]): Script[] => {
            if (!rawQuery) { searchMatchesRef.current = matches; return list; }

            // Keep literal prefixes (`file:`, `path:`) as plain substring matching.
            // Power-user escape hatch: no ranking, no typo tolerance — they asked
            // for exact. HighlightText already handles that via indexOf.
            if (rawQuery.startsWith("file:")) {
                const q = rawQuery.slice(5).trim();
                searchMatchesRef.current = matches;
                return q ? list.filter(s => s.filename.toLowerCase().includes(q)) : list;
            }
            if (rawQuery.startsWith("path:")) {
                const q = rawQuery.slice(5).trim();
                searchMatchesRef.current = matches;
                return q ? list.filter(s => s.path.toLowerCase().replace(s.filename.toLowerCase(), "").includes(q)) : list;
            }

            // Two-pass strategy:
            //   filename → fuzzy (forgive typos like "mangaer" → "manager")
            //   path     → strict substring (no fuzzy, no fake hits in deep
            //              system paths like "Packages" matching "ahk")
            //
            // Filename hits ranked first, then path-only hits appended.
            const lowerQ = rawQuery;

            const collectPathSubstringHits = (excluded: Set<string>) => {
                const out: Script[] = [];
                for (const s of list) {
                    if (excluded.has(s.path)) continue;
                    // Search the directory portion only — basename is already
                    // covered by the filename pass.
                    const dirPart = (s.path || "")
                        .toLowerCase()
                        .replace((s.filename || "").toLowerCase(), "");
                    const idx = dirPart.indexOf(lowerQ);
                    if (idx !== -1) {
                        // Range is into the original `path` rendering. We don't
                        // currently render path strings inside script rows
                        // (folders use TreeNodeRenderer which has its own
                        // highlighter), so leaving the range out is fine —
                        // the script still appears in results without a
                        // highlight on its filename.
                        const existing = matches.get(s.path) ?? {};
                        matches.set(s.path, { ...existing, path: [[idx, idx + lowerQ.length - 1]] });
                        out.push(s);
                    }
                }
                return out;
            };

            // Fuzzy on filename, literal on path.
            //
            // threshold: 0.4 — Bitap counts a single transposition as TWO
            // edits, so for a 3-char query at 0.3 the error budget is 0.9
            // (less than one edit), which silently kills typos like "akh"
            // → "ahk". 0.4 raises the budget enough to forgive one swap on
            // short queries while still rejecting unrelated noise.
            const fuse = new Fuse(list, {
                keys: [
                    { name: "filename", getFn: (s) => (s.filename || "").replace(/\.ahk$/i, "") },
                ],
                includeMatches: true,
                ignoreLocation: true,
                threshold: fuseThreshold,
                minMatchCharLength: fuseMinMatchLen,
                findAllMatches: fuseFindAllMatches,
            });
            const results = fuse.search(rawQuery);
            const filenameHitPaths = new Set<string>();
            const filenameHits: Script[] = [];
            for (const r of results) {
                const entry: { filename?: [number, number][] } = {};
                for (const m of r.matches ?? []) {
                    if (m.key === "filename") entry.filename = m.indices.map(([a, b]) => [a, b]);
                }
                matches.set(r.item.path, entry);
                filenameHits.push(r.item);
                filenameHitPaths.add(r.item.path);
            }
            const pathHits = fuseSearchPath ? collectPathSubstringHits(filenameHitPaths) : [];
            searchMatchesRef.current = matches;
            return [...filenameHits, ...pathHits];
        };

        const sortList = (list: Script[]) => {
            if (sortBy === "size") return list.sort((a, b) => b.size - a.size);
            if (sortBy === "created") return list.sort((a, b) => b.created_at.localeCompare(a.created_at));
            if (sortBy === "modified") return list.sort((a, b) => b.modified_at.localeCompare(a.modified_at));
            if (sortBy === "last_run") return list.sort((a, b) => (b.last_run || "").localeCompare(a.last_run || ""));
            return list.sort((a, b) => a.filename.localeCompare(b.filename));
        };

        if (filterTag === "hub") {
            return applySearch(allScripts.filter(s => s.is_running || s.is_hub));
        }

        let list = allScripts.filter(s => {
            if (filterTag === "running") {
                if (!s.is_running) return false;
            } else if (filterTag === "no_tags") {
                if (s.tags.length > 0) return false;
            } else if (filterTag === "hidden") {
                if (!s.is_hidden) return false;
            } else if (filterTag === "tags") {
                if (s.tags.length === 0) return false;
            } else if (filterTag !== "all" && filterTag !== "all_scripts" && filterTag !== "tree" && filterTag !== "hub" && filterTag !== "") {
                if (!s.tags.includes(filterTag)) return false;
            }

            if (showHidden === 'none' && s.is_hidden) return false;
            if (showHidden === 'only' && !s.is_hidden) return false;

            return true;
        });

        // When the user is searching, preserve fuse's relevance order — that's
        // the whole point of fuzzy ranking. Fall back to the user's sort
        // preference only when the query is empty. The tree view re-sorts its
        // own folders inside the tree builder, so it's unaffected.
        const searched = applySearch(list);
        return rawQuery ? searched : sortList(searched);
    }, [allScripts, filterTag, showHidden, searchQuery, sortBy, fuseThreshold, fuseMinMatchLen, fuseFindAllMatches, fuseSearchPath]);

    const prevTreeRef = useRef<TreeNode | null>(null);

    const tree = useMemo(() => {
        const scriptSort = sortBy === "size" ? (a: Script, b: Script) => b.size - a.size
            : sortBy === "created" ? (a: Script, b: Script) => b.created_at.localeCompare(a.created_at)
            : sortBy === "modified" ? (a: Script, b: Script) => b.modified_at.localeCompare(a.modified_at)
            : sortBy === "last_run" ? (a: Script, b: Script) => (b.last_run || "").localeCompare(a.last_run || "")
            : (a: Script, b: Script) => a.filename.localeCompare(b.filename);

        const root: TreeNode = { name: "Root", fullName: "Root", scripts: [], children: {} };
        filtered.forEach(script => {
            const pathParts = script.path.split(/[\\\/]/);
            const startIdx = 0;
            let current = root;
            for (let i = startIdx; i < pathParts.length - 1; i++) {
                const part = pathParts[i];
                if (!part) continue;
                if (!current.children[part]) {
                    current.children[part] = {
                        name: part,
                        fullName: pathParts.slice(0, i + 1).join("\\"),
                        scripts: [],
                        children: {}
                    };
                }
                current = current.children[part];
            }
            current.scripts.push(script);
        });

        const compact = (node: TreeNode): TreeNode => {
            node.scripts.sort(scriptSort);
            const childKeys = Object.keys(node.children);
            for (const key of childKeys) {
                node.children[key] = compact(node.children[key]);
            }

            const scriptsHidden = node.scripts.length > 0 && node.scripts.every(s => s.is_hidden);
            const childrenHidden = childKeys.length > 0 && Object.values(node.children).every(c => c.is_hidden);

            if (node.scripts.length > 0 && childKeys.length > 0) {
                node.is_hidden = scriptsHidden && childrenHidden;
            } else if (node.scripts.length > 0) {
                node.is_hidden = scriptsHidden;
            } else if (childKeys.length > 0) {
                node.is_hidden = childrenHidden;
            } else {
                node.is_hidden = false;
            }

            if (node.name !== "Root" && childKeys.length === 1 && node.scripts.length === 0) {
                const child = node.children[childKeys[0]];
                return {
                    ...child,
                    name: `${node.name}|${child.name}`
                };
            }
            return node;
        };

        const newTree = compact(root);

        // Stabilize node references for React.memo
        const prev = prevTreeRef.current;
        if (prev) {
            const stabilize = (newNode: TreeNode, oldNode: TreeNode): TreeNode => {
                let scriptsMatch = newNode.scripts.length === oldNode.scripts.length &&
                    newNode.scripts.every((s, i) => {
                        const o = oldNode.scripts[i];
                        return s.path === o.path && s.is_running === o.is_running && s.has_ui === o.has_ui &&
                            s.tags.length === o.tags.length && s.tags.every((t, j) => t === o.tags[j]) &&
                            s.is_hidden === o.is_hidden && s.size === o.size && s.is_hub === o.is_hub;
                    });

                const newChildKeys = Object.keys(newNode.children);
                const oldChildKeys = Object.keys(oldNode.children);
                let childrenMatch = newChildKeys.length === oldChildKeys.length;

                if (childrenMatch) {
                    for (const key of newChildKeys) {
                        if (oldNode.children[key]) {
                            newNode.children[key] = stabilize(newNode.children[key], oldNode.children[key]);
                            if (newNode.children[key] !== oldNode.children[key]) childrenMatch = false;
                        } else {
                            childrenMatch = false;
                        }
                    }
                }

                if (scriptsMatch && childrenMatch && newNode.name === oldNode.name &&
                    newNode.is_hidden === oldNode.is_hidden) {
                    return oldNode;
                }
                return newNode;
            };
            const stabilized = stabilize(newTree, prev);
            prevTreeRef.current = stabilized;
            return stabilized;
        }

        prevTreeRef.current = newTree;
        return newTree;
    }, [filtered, showHidden, sortBy]);

    const scriptSortFn = useMemo(() => {
        if (sortBy === "size") return (a: Script, b: Script) => b.size - a.size;
        if (sortBy === "created") return (a: Script, b: Script) => b.created_at.localeCompare(a.created_at);
        if (sortBy === "modified") return (a: Script, b: Script) => b.modified_at.localeCompare(a.modified_at);
        if (sortBy === "last_run") return (a: Script, b: Script) => (b.last_run || "").localeCompare(a.last_run || "");
        return (a: Script, b: Script) => a.filename.localeCompare(b.filename);
    }, [sortBy]);

    const groupedHub = useMemo(() => {
        if (filterTag !== "hub") return null;
        const groups: Record<string, Script[]> = {};
        const scriptsWithoutTags: Script[] = [];
        filtered.forEach(s => {
            const userTags = s.tags;
            if (userTags.length === 0) {
                scriptsWithoutTags.push(s);
            } else {
                userTags.forEach(tag => {
                    if (!groups[tag]) groups[tag] = [];
                    groups[tag].push(s);
                });
            }
        });
        const sortedTags = Object.keys(groups).sort((a, b) => a.localeCompare(b));
        const result: { tag: string; scripts: Script[] }[] = sortedTags.map(tag => ({
            tag,
            scripts: groups[tag].sort(scriptSortFn)
        }));
        if (scriptsWithoutTags.length > 0) {
            result.push({
                tag: t("hub.other", "other"),
                scripts: scriptsWithoutTags.sort(scriptSortFn)
            });
        }
        return result;
    }, [filtered, filterTag, scriptSortFn]);

    return { filtered, tree, groupedHub, allUniqueTags, searchMatches: searchMatchesRef.current };
}
