import { renderHook, act, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { __emit, __clear, __count } from "@tauri-apps/api/event";
import { useScriptTree, __resetCachedScripts } from "./useScriptTree";
import { makeScript, SCRIPTS, ALL_SCRIPTS } from "../test/fixtures";
import { useTreeStore } from "../store/useTreeStore";
import type { Script } from "../api";

const noop = () => {};
const noopTags = (_tags: string[]) => {};
const noopDrag = (_s: any) => {};

function defaultOpts(overrides: Partial<Parameters<typeof useScriptTree>[0]> = {}) {
  return {
    filterTag: "all",
    onTagsLoaded: overrides.onTagsLoaded ?? noopTags,
    onCustomDragStart: noopDrag,
    searchQuery: overrides.searchQuery ?? "",
    setSearchQuery: overrides.setSearchQuery ?? noop,
    onRunningCountChange: overrides.onRunningCountChange ?? noop,
    refreshKey: overrides.refreshKey ?? 0,
    onScanComplete: overrides.onScanComplete ?? noop,
    viewMode: overrides.viewMode ?? ("tree" as const),
    sortBy: overrides.sortBy ?? ("name" as const),
    ...overrides,
  };
}

/** Helper: render the hook and wait until scripts are loaded */
async function renderLoaded(
  scripts: Script[],
  opts: Partial<Parameters<typeof useScriptTree>[0]> = {}
) {
  const mockInvoke = vi.mocked(invoke);
  mockInvoke.mockImplementation(async (cmd: string, args?: any) => {
    if (cmd === "get_scripts") return scripts;
    if (cmd === "get_tag_icons") return {};
    if (cmd === "load_icon_cache") return {};
    return undefined;
  });

  const result = renderHook(
    (props) => useScriptTree(props),
    { initialProps: defaultOpts(opts) }
  );

  // Wait for loading to finish AND allScripts to match expected data.
  // Module-level _cachedScripts may leak between tests, causing useState
  // to initialize with stale data and loading=false prematurely.
  await waitFor(() => {
    expect(result.result.current.loading).toBe(false);
    expect(result.result.current.allScripts.length).toBe(scripts.length);
  });

  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
  __clear();
  __resetCachedScripts();
  // Reset zustand store
  useTreeStore.setState({
    expandedFolders: {},
    focusedPath: null,
    isVimMode: false,
    pendingScripts: {},
    editingScript: null,
    isDragging: false,
    draggedScriptPath: null,
    contextMenu: null,
    showHidden: "none",
    selectedPath: null,
    folderDurations: {},
    removingTags: new Set(),
    tagIcons: {},
    iconCache: {},
    iconPickerTag: null,
  });
});

// ---------------------------------------------------------------------------
// 1. Filtering tests
// ---------------------------------------------------------------------------
describe("filtering (filtered useMemo)", () => {
  it('filterTag="all" returns all non-hidden scripts', async () => {
    const { result } = await renderLoaded(ALL_SCRIPTS, { filterTag: "all" });
    const hidden = ALL_SCRIPTS.filter((s) => s.is_hidden);
    expect(result.current.filtered.length).toBe(ALL_SCRIPTS.length - hidden.length);
    expect(result.current.filtered.every((s) => !s.is_hidden)).toBe(true);
  });

  it('filterTag="no_tags" returns only scripts with empty tags', async () => {
    const { result } = await renderLoaded(ALL_SCRIPTS, { filterTag: "no_tags" });
    expect(result.current.filtered.every((s) => s.tags.length === 0)).toBe(true);
    // Should include basic, noTags, big, small (all with no tags and not hidden)
    const expected = ALL_SCRIPTS.filter((s) => s.tags.length === 0 && !s.is_hidden);
    expect(result.current.filtered.length).toBe(expected.length);
  });

  it('filterTag="hub" returns running + hub-tagged scripts', async () => {
    const { result } = await renderLoaded(ALL_SCRIPTS, { filterTag: "hub" });
    const hubTags = new Set(["hub", "fav", "favourites"]);
    result.current.filtered.forEach((s) => {
      const isHub = s.is_running || s.tags.some((t) => hubTags.has(t.toLowerCase()));
      expect(isHub).toBe(true);
    });
  });

  it("filterTag=specific tag returns only scripts with that tag", async () => {
    const { result } = await renderLoaded(ALL_SCRIPTS, { filterTag: "utility" });
    expect(result.current.filtered.length).toBe(1);
    expect(result.current.filtered[0].id).toBe(SCRIPTS.withTags.id);
  });

  it('showHidden="none" excludes hidden scripts', async () => {
    const { result } = await renderLoaded(ALL_SCRIPTS, { filterTag: "all" });
    expect(result.current.filtered.some((s) => s.is_hidden)).toBe(false);
  });

  it('showHidden="only" shows only hidden scripts', async () => {
    useTreeStore.setState({ showHidden: "only" });
    const { result } = await renderLoaded(ALL_SCRIPTS, { filterTag: "all" });
    expect(result.current.filtered.length).toBeGreaterThan(0);
    expect(result.current.filtered.every((s) => s.is_hidden)).toBe(true);
  });

  it('showHidden="all" shows everything', async () => {
    useTreeStore.setState({ showHidden: "all" });
    const { result } = await renderLoaded(ALL_SCRIPTS, { filterTag: "all" });
    expect(result.current.filtered.length).toBe(ALL_SCRIPTS.length);
  });

  it("searchQuery filters by filename", async () => {
    const { result } = await renderLoaded(ALL_SCRIPTS, {
      filterTag: "all",
      searchQuery: "daemon",
    });
    expect(result.current.filtered.length).toBe(1);
    expect(result.current.filtered[0].filename).toBe("daemon.ahk");
  });

  it('"file:" prefix filters filename only', async () => {
    // "scripts" appears in path but not in filename
    const { result } = await renderLoaded(ALL_SCRIPTS, {
      filterTag: "all",
      searchQuery: "file:hello",
    });
    expect(result.current.filtered.length).toBe(1);
    expect(result.current.filtered[0].filename).toBe("hello.ahk");
  });

  it('"path:" prefix filters path only (excluding filename)', async () => {
    const { result } = await renderLoaded(ALL_SCRIPTS, {
      filterTag: "all",
      searchQuery: "path:work",
    });
    // Only task.ahk has "work" in its path (c:/work/task.ahk)
    expect(result.current.filtered.length).toBe(1);
    expect(result.current.filtered[0].filename).toBe("task.ahk");
  });

  it("combined filter + search narrows results", async () => {
    const { result } = await renderLoaded(ALL_SCRIPTS, {
      filterTag: "utility",
      searchQuery: "util",
    });
    expect(result.current.filtered.length).toBe(1);
    expect(result.current.filtered[0].id).toBe(SCRIPTS.withTags.id);
  });
});

// ---------------------------------------------------------------------------
// 2. Sorting tests
// ---------------------------------------------------------------------------
describe("sorting", () => {
  it('sortBy="name" sorts alphabetically by filename', async () => {
    const { result } = await renderLoaded(ALL_SCRIPTS, { sortBy: "name" });
    const names = result.current.filtered.map((s) => s.filename);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  it('sortBy="size" sorts descending by size', async () => {
    const scripts = [SCRIPTS.big, SCRIPTS.small, SCRIPTS.basic];
    const { result } = await renderLoaded(scripts, { sortBy: "size" });
    const sizes = result.current.filtered.map((s) => s.size);
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
  });
});

// ---------------------------------------------------------------------------
// 3. Tree building tests
// ---------------------------------------------------------------------------
describe("tree building (tree useMemo)", () => {
  it("scripts are grouped into correct folder hierarchy", async () => {
    const scripts = [
      makeScript({ id: "a", path: "c:/projects/tools/a.ahk", filename: "a.ahk" }),
      makeScript({ id: "b", path: "c:/projects/tools/sub/b.ahk", filename: "b.ahk" }),
    ];
    const { result } = await renderLoaded(scripts);
    const tree = result.current.tree;
    expect(tree.name).toBe("Root");
    // Traverse to find the "tools" folder (may be compacted with parents)
    const findFolder = (node: any, name: string): any => {
      if (node.name.includes(name)) return node;
      for (const child of Object.values(node.children) as any[]) {
        const found = findFolder(child, name);
        if (found) return found;
      }
      return null;
    };
    const toolsFolder = findFolder(tree, "tools");
    expect(toolsFolder).not.toBeNull();
    // "tools" folder contains a.ahk directly and has "sub" as child
    expect(toolsFolder.scripts.length).toBe(1);
    expect(toolsFolder.scripts[0].filename).toBe("a.ahk");
    expect("sub" in toolsFolder.children).toBe(true);
    expect(toolsFolder.children["sub"].scripts[0].filename).toBe("b.ahk");
  });

  it("single-child folders are compacted with pipe separator", async () => {
    // c:/Desktop/a/b/c/script.ahk — a, b, c each have one child, should be compacted
    const scripts = [
      makeScript({ id: "x", path: "c:/Desktop/a/b/c/script.ahk", filename: "script.ahk" }),
    ];
    const { result } = await renderLoaded(scripts);
    const tree = result.current.tree;

    // Find the leaf-most folder containing the script
    const findCompacted = (node: any): string[] => {
      const names: string[] = [];
      if (node.name !== "Root") names.push(node.name);
      for (const child of Object.values(node.children) as any[]) {
        names.push(...findCompacted(child));
      }
      return names;
    };
    const allNames = findCompacted(tree);
    // At least one compacted name should contain "|"
    expect(allNames.some((n) => n.includes("|"))).toBe(true);
  });

  it('root node has name "Root"', async () => {
    const { result } = await renderLoaded(ALL_SCRIPTS);
    expect(result.current.tree.name).toBe("Root");
  });
});

// ---------------------------------------------------------------------------
// 4. Hub grouping tests
// ---------------------------------------------------------------------------
describe("hub grouping (groupedHub useMemo)", () => {
  it("scripts are grouped by user tags (excluding system tags)", async () => {
    const { result } = await renderLoaded(ALL_SCRIPTS, { filterTag: "hub" });
    const grouped = result.current.groupedHub;
    expect(grouped).not.toBeNull();
    // "hub" tag itself should NOT appear as a group name
    const groupNames = grouped!.map((g) => g.tag);
    expect(groupNames).not.toContain("hub");
    expect(groupNames).not.toContain("fav");
    expect(groupNames).not.toContain("favourites");
  });

  it('scripts without user tags go to "other" group', async () => {
    const scripts = [
      makeScript({ id: "r1", path: "c:/scripts/r1.ahk", filename: "r1.ahk", is_running: true, tags: [] }),
      makeScript({ id: "r2", path: "c:/scripts/r2.ahk", filename: "r2.ahk", tags: ["hub"] }),
    ];
    const { result } = await renderLoaded(scripts, { filterTag: "hub" });
    const grouped = result.current.groupedHub!;
    const otherGroup = grouped.find((g) => g.tag === "other");
    expect(otherGroup).toBeDefined();
    expect(otherGroup!.scripts.length).toBe(2);
  });

  it("groups are sorted alphabetically", async () => {
    const scripts = [
      makeScript({ id: "z1", path: "c:/scripts/z1.ahk", filename: "z1.ahk", tags: ["hub", "zebra"] }),
      makeScript({ id: "a1", path: "c:/scripts/a1.ahk", filename: "a1.ahk", tags: ["hub", "alpha"] }),
      makeScript({ id: "m1", path: "c:/scripts/m1.ahk", filename: "m1.ahk", tags: ["hub", "mid"] }),
    ];
    const { result } = await renderLoaded(scripts, { filterTag: "hub" });
    const grouped = result.current.groupedHub!;
    const tags = grouped.map((g) => g.tag);
    // "other" group goes last, user tags sorted alphabetically
    const userTags = tags.filter((t) => t !== "other");
    expect(userTags).toEqual([...userTags].sort((a, b) => a.localeCompare(b)));
  });
});

// ---------------------------------------------------------------------------
// 5. Merge logic — preserves runtime status from watcher events
// ---------------------------------------------------------------------------
describe("merge logic", () => {
  it("preserves is_running from events after force scan returns stale data", async () => {
    const scriptPath = "c:/scripts/daemon.ahk";
    const scriptsInitial = [
      makeScript({
        id: "d1",
        path: scriptPath,
        filename: "daemon.ahk",
        is_running: false,
      }),
    ];

    const mockInvoke = vi.mocked(invoke);
    let callCount = 0;

    mockInvoke.mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === "get_scripts") {
        callCount++;
        if (callCount <= 1) {
          // Initial cache load — not running
          return scriptsInitial;
        }
        // Force scan (2nd+ call) — backend returns is_running=false (stale)
        return [
          makeScript({
            id: "d1",
            path: scriptPath,
            filename: "daemon.ahk",
            is_running: false, // <-- stale: scan doesn't check process status
          }),
        ];
      }
      if (cmd === "get_tag_icons") return {};
      if (cmd === "load_icon_cache") return {};
      return undefined;
    });

    const { result, rerender } = renderHook(
      (props) => useScriptTree(props),
      { initialProps: defaultOpts({ refreshKey: 0 }) }
    );

    // Wait for initial load
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.allScripts[0].is_running).toBe(false);

    // Simulate script-status-changed event — script is now running
    act(() => {
      __emit("script-status-changed", {
        path: scriptPath,
        is_running: true,
        has_ui: false,
      });
    });

    await waitFor(() => {
      expect(result.current.allScripts[0].is_running).toBe(true);
    });

    // Trigger force scan via refreshKey change
    rerender(defaultOpts({ refreshKey: 1 }));

    // Wait for the force scan fetch to complete
    await waitFor(() => {
      expect(callCount).toBeGreaterThanOrEqual(2);
    });

    // FIX: merge now preserves is_running from prev state (watcher events are authoritative)
    await waitFor(() => {
      expect(result.current.allScripts[0].is_running).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// 6. Event listener tests
// ---------------------------------------------------------------------------
describe("event listeners", () => {
  it("script-tags-changed event updates tags in allScripts", async () => {
    const { result } = await renderLoaded(ALL_SCRIPTS);

    const targetScript = SCRIPTS.basic;

    act(() => {
      __emit("script-tags-changed", {
        id: targetScript.id,
        tags: ["new-tag", "another"],
      });
    });

    await waitFor(() => {
      const updated = result.current.allScripts.find((s) => s.id === targetScript.id);
      expect(updated?.tags).toEqual(["new-tag", "another"]);
    });
  });

  it("script-status-changed event updates is_running and has_ui", async () => {
    const { result } = await renderLoaded(ALL_SCRIPTS);

    const targetScript = SCRIPTS.basic; // starts as not running

    act(() => {
      __emit("script-status-changed", {
        path: targetScript.path,
        is_running: true,
        has_ui: true,
      });
    });

    await waitFor(() => {
      const updated = result.current.allScripts.find((s) => s.id === targetScript.id);
      expect(updated?.is_running).toBe(true);
      expect(updated?.has_ui).toBe(true);
    });
  });

  it("script-status-changed clears has_ui when is_running=false", async () => {
    const scripts = [
      makeScript({
        id: "ui-test",
        path: "c:/scripts/ui.ahk",
        filename: "ui.ahk",
        is_running: true,
        has_ui: true,
      }),
    ];
    const { result } = await renderLoaded(scripts);

    act(() => {
      __emit("script-status-changed", {
        path: "c:/scripts/ui.ahk",
        is_running: false,
        has_ui: true, // backend sends true, but hook should force false
      });
    });

    await waitFor(() => {
      const updated = result.current.allScripts.find((s) => s.id === "ui-test");
      expect(updated?.is_running).toBe(false);
      expect(updated?.has_ui).toBe(false);
    });
  });

  it("unmount removes event listeners", async () => {
    const { unmount } = await renderLoaded(ALL_SCRIPTS);

    // Listeners are registered asynchronously, wait for them
    await waitFor(() => {
      expect(__count("script-tags-changed")).toBeGreaterThan(0);
    });

    unmount();

    // After unmount, listeners should be cleaned up
    await waitFor(() => {
      expect(__count("script-tags-changed")).toBe(0);
      expect(__count("script-status-changed")).toBe(0);
    });
  });
});
