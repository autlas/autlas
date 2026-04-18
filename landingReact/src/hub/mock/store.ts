import { useSyncExternalStore } from "react";
import { INITIAL_SCRIPTS, INITIAL_TAGS, type MockScript, type TagMeta } from "./data";

export type ViewMode = "hub" | "tiles" | "list" | "tree";

export interface HubState {
  scripts: MockScript[];
  tags: TagMeta[];
  activeTab: string; // "hub" | "all" | "no_tags" | tag name
  viewMode: ViewMode;
  searchQuery: string;
  focusedId: string | null;
  selectedId: string | null;
}

let state: HubState = {
  scripts: [...INITIAL_SCRIPTS],
  tags: [...INITIAL_TAGS],
  activeTab: "hub",
  viewMode: "tiles",
  searchQuery: "",
  focusedId: null,
  selectedId: null,
};

const listeners = new Set<() => void>();
function notify() { listeners.forEach((l) => l()); }
function subscribe(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); }
function getSnapshot() { return state; }

export function useHubStore<T>(selector: (s: HubState) => T): T {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return selector(snap);
}

function set(partial: Partial<HubState> | ((s: HubState) => Partial<HubState>)) {
  const next = typeof partial === "function" ? partial(state) : partial;
  state = { ...state, ...next };
  notify();
}

function mutateScript(id: string, mut: (s: MockScript) => MockScript) {
  set((s) => ({ scripts: s.scripts.map((sc) => (sc.id === id ? mut(sc) : sc)) }));
}

// ── Actions ──────────────────────────────────────────────────

export const actions = {
  setActiveTab: (tab: string) => set({ activeTab: tab }),
  setViewMode: (v: ViewMode) => set({ viewMode: v }),
  setSearch: (q: string) => set({ searchQuery: q }),
  setFocused: (id: string | null) => set({ focusedId: id }),
  setSelected: (id: string | null) => set({ selectedId: id }),

  run: (id: string) => {
    mutateScript(id, (s) => ({ ...s, status: "pending-run" }));
    window.setTimeout(() => {
      mutateScript(id, (s) => ({ ...s, status: "running", last_run: new Date().toISOString().slice(0, 16).replace("T", " ") }));
    }, 900);
  },

  kill: (id: string) => {
    mutateScript(id, (s) => ({ ...s, status: "pending-kill" }));
    window.setTimeout(() => {
      mutateScript(id, (s) => ({ ...s, status: "stopped" }));
    }, 700);
  },

  restart: (id: string) => {
    mutateScript(id, (s) => ({ ...s, status: "pending-restart" }));
    window.setTimeout(() => {
      mutateScript(id, (s) => ({ ...s, status: "running", last_run: new Date().toISOString().slice(0, 16).replace("T", " ") }));
    }, 1100);
  },

  toggleHub: (id: string) => mutateScript(id, (s) => ({ ...s, is_hub: !s.is_hub })),

  addTag: (id: string, tag: string) => {
    const clean = tag.trim().toLowerCase();
    if (!clean) return;
    mutateScript(id, (s) => (s.tags.includes(clean) ? s : { ...s, tags: [...s.tags, clean] }));
    if (!state.tags.some((t) => t.name === clean)) {
      set((s) => ({ tags: [...s.tags, { name: clean, color: pickColor(clean) }] }));
    }
  },

  removeTag: (id: string, tag: string) => {
    mutateScript(id, (s) => ({ ...s, tags: s.tags.filter((t) => t !== tag) }));
  },
};

function pickColor(seed: string): string {
  const palette = ["#fbbf24", "#86efac", "#93c5fd", "#f472b6", "#fb923c", "#818cf8", "#c4b5fd", "#fde68a", "#fca5a5"];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

// Derived selectors
export function tagColor(tagName: string): string {
  const t = state.tags.find((x) => x.name === tagName);
  return t?.color ?? "#9ca3af";
}

export function visibleScripts(s: HubState): MockScript[] {
  let arr = s.scripts;
  if (s.activeTab === "hub") arr = arr.filter((x) => x.is_hub);
  else if (s.activeTab === "all") arr = arr;
  else if (s.activeTab === "no_tags") arr = arr.filter((x) => x.tags.length === 0);
  else arr = arr.filter((x) => x.tags.includes(s.activeTab));

  if (s.searchQuery.trim()) {
    const q = s.searchQuery.trim().toLowerCase();
    arr = arr.filter((x) => x.filename.toLowerCase().includes(q) || x.tags.some((t) => t.toLowerCase().includes(q)));
  }
  return arr;
}

export function tagCount(tag: string): number {
  return state.scripts.filter((x) => x.tags.includes(tag)).length;
}

export function runningCount(): number {
  return state.scripts.filter((x) => x.status === "running" || x.status === "pending-kill" || x.status === "pending-restart").length;
}
