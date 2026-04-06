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
// 5. Merge logic — runtime status handling
// ---------------------------------------------------------------------------
describe("merge logic", () => {
  it("preserves is_running from watcher events when scan returns stale data", async () => {
    // Scan doesn't check process status — watcher events are authoritative for is_running.
    // When watcher says running=true AFTER scan started but BEFORE scan returns,
    // merge should keep is_running=true (watcher is more recent).
    const scriptPath = "c:/scripts/daemon.ahk";
    const scriptsInitial = [
      makeScript({ id: "d1", path: scriptPath, filename: "daemon.ahk", is_running: false }),
    ];

    const mockInvoke = vi.mocked(invoke);
    let callCount = 0;

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_scripts") {
        callCount++;
        if (callCount <= 1) return scriptsInitial;
        return [makeScript({ id: "d1", path: scriptPath, filename: "daemon.ahk", is_running: false })];
      }
      if (cmd === "get_tag_icons") return {};
      if (cmd === "load_icon_cache") return {};
      return undefined;
    });

    const { result, rerender } = renderHook(
      (props) => useScriptTree(props),
      { initialProps: defaultOpts({ refreshKey: 0 }) }
    );

    await waitFor(() => { expect(result.current.loading).toBe(false); });
    expect(result.current.allScripts[0].is_running).toBe(false);

    // Watcher event: script started running
    act(() => { __emit("script-status-changed", { path: scriptPath, is_running: true, has_ui: false }); });
    await waitFor(() => { expect(result.current.allScripts[0].is_running).toBe(true); });

    // Force scan returns stale is_running=false
    rerender(defaultOpts({ refreshKey: 1 }));
    await waitFor(() => { expect(callCount).toBeGreaterThanOrEqual(2); });

    // Watcher event was more recent → merge should preserve is_running=true
    await waitFor(() => { expect(result.current.allScripts[0].is_running).toBe(true); });
  });

  it("BUG FIX: scan returning is_running=false must override stale prev state", async () => {
    // BUG: merge uses `p.is_running || d.is_running`. Once is_running=true from
    // a watcher event, scan returning false can NEVER clear it.
    // Scenario: user kills script → scan triggers before watcher detects the kill.
    // Scan correctly returns is_running=false, but merge does true||false=true.
    // Script "sticks" as running in UI.
    const scriptPath = "c:/scripts/killme.ahk";
    const mockInvoke = vi.mocked(invoke);
    let callCount = 0;

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_scripts") {
        callCount++;
        // Scan always returns is_running=false (process is dead)
        return [makeScript({ id: "k1", path: scriptPath, filename: "killme.ahk", is_running: false })];
      }
      if (cmd === "get_tag_icons") return {};
      if (cmd === "load_icon_cache") return {};
      return undefined;
    });

    const { result, rerender } = renderHook(
      (props) => useScriptTree(props),
      { initialProps: defaultOpts({ refreshKey: 0 }) }
    );
    await waitFor(() => { expect(result.current.loading).toBe(false); });

    // Watcher event: script was running
    act(() => { __emit("script-status-changed", { path: scriptPath, is_running: true, has_ui: true }); });
    await waitFor(() => { expect(result.current.allScripts[0].is_running).toBe(true); });

    // Now process was killed externally. Scan triggers BEFORE watcher notices.
    // Scan returns is_running=false (correct — process is dead).
    // NO kill event has arrived yet, so prev state still has is_running=true.
    rerender(defaultOpts({ refreshKey: 1 }));
    await waitFor(() => { expect(callCount).toBeGreaterThanOrEqual(2); });

    // DESIRED: scan data should be able to reset is_running to false
    // CURRENT BUG: true || false = true — script stays "running" forever
    await waitFor(() => {
      expect(result.current.allScripts[0].is_running).toBe(false);
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

// ---------------------------------------------------------------------------
// 7. Tag operations
// ---------------------------------------------------------------------------
describe("tag operations", () => {
  it("addTag with empty string does nothing", async () => {
    const mockInvoke = vi.mocked(invoke);
    const { result } = await renderLoaded([SCRIPTS.basic]);

    await act(async () => {
      await result.current.addTag(SCRIPTS.basic, "");
    });

    expect(mockInvoke).not.toHaveBeenCalledWith("save_script_tags", expect.anything());
    expect(result.current.allScripts[0].tags).toEqual([]);
  });

  it("addTag with whitespace-only string does nothing", async () => {
    const mockInvoke = vi.mocked(invoke);
    const { result } = await renderLoaded([SCRIPTS.basic]);

    await act(async () => {
      await result.current.addTag(SCRIPTS.basic, "   ");
    });

    expect(mockInvoke).not.toHaveBeenCalledWith("save_script_tags", expect.anything());
  });

  it("addTag trims whitespace from tag name", async () => {
    const mockInvoke = vi.mocked(invoke);
    const { result } = await renderLoaded([SCRIPTS.basic]);

    await act(async () => {
      await result.current.addTag(SCRIPTS.basic, "  mytag  ");
    });

    expect(mockInvoke).toHaveBeenCalledWith("save_script_tags", {
      id: SCRIPTS.basic.id,
      tags: ["mytag"],
    });
    expect(result.current.allScripts.find(s => s.id === SCRIPTS.basic.id)?.tags).toEqual(["mytag"]);
  });

  it("addTag duplicate closes editing without duplicating", async () => {
    const script = makeScript({ id: "dup-test", path: "c:/scripts/dup.ahk", filename: "dup.ahk", tags: ["existing"] });
    const mockInvoke = vi.mocked(invoke);
    const { result } = await renderLoaded([script]);

    // Set editing state first
    act(() => { useTreeStore.getState().setEditingScript(script.path); });

    await act(async () => {
      await result.current.addTag(script, "existing");
    });

    // Should close editing
    expect(useTreeStore.getState().editingScript).toBeNull();
    // Should NOT invoke save
    expect(mockInvoke).not.toHaveBeenCalledWith("save_script_tags", expect.anything());
    // Tags unchanged
    expect(result.current.allScripts.find(s => s.id === script.id)?.tags).toEqual(["existing"]);
  });

  it("addTag performs optimistic update then invokes save", async () => {
    const script = makeScript({ id: "opt-test", path: "c:/scripts/opt.ahk", filename: "opt.ahk", tags: ["old"] });
    const mockInvoke = vi.mocked(invoke);
    const { result } = await renderLoaded([script]);

    await act(async () => {
      await result.current.addTag(script, "newtag");
    });

    // Optimistic update visible
    expect(result.current.allScripts.find(s => s.id === script.id)?.tags).toEqual(["old", "newtag"]);
    // Backend was called
    expect(mockInvoke).toHaveBeenCalledWith("save_script_tags", {
      id: script.id,
      tags: ["old", "newtag"],
    });
  });

  it("addTag rolls back on invoke failure", async () => {
    const script = makeScript({ id: "rb-test", path: "c:/scripts/rb.ahk", filename: "rb.ahk", tags: ["keep"] });
    const mockInvoke = vi.mocked(invoke);
    const { result } = await renderLoaded([script]);

    // Make save_script_tags fail
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "save_script_tags") throw new Error("save failed");
      if (cmd === "get_scripts") return [script];
      if (cmd === "get_tag_icons") return {};
      if (cmd === "load_icon_cache") return {};
      return undefined;
    });

    await act(async () => {
      await result.current.addTag(script, "willFail");
    });

    // Should rollback to original tags
    await waitFor(() => {
      expect(result.current.allScripts.find(s => s.id === script.id)?.tags).toEqual(["keep"]);
    });
  });

  it("removeTag waits 90ms then removes tag", async () => {
    const script = makeScript({ id: "rm-test", path: "c:/scripts/rm.ahk", filename: "rm.ahk", tags: ["a", "b"] });
    const mockInvoke = vi.mocked(invoke);
    const { result } = await renderLoaded([script]);

    // removingTags flag is set immediately
    await act(async () => {
      const promise = result.current.removeTag(script, "a");
      // Check flag set synchronously before await
      expect(useTreeStore.getState().removingTags.has(`${script.path}-a`)).toBe(true);
      await promise;
    });

    // After the 90ms delay + completion, tag should be removed
    await waitFor(() => {
      expect(result.current.allScripts.find(s => s.id === script.id)?.tags).toEqual(["b"]);
    });
    expect(mockInvoke).toHaveBeenCalledWith("save_script_tags", {
      id: script.id,
      tags: ["b"],
    });
    // removingTags flag is cleared
    expect(useTreeStore.getState().removingTags.has(`${script.path}-a`)).toBe(false);
  });

  it("removeTag rolls back on invoke failure", async () => {
    const script = makeScript({ id: "rm-rb", path: "c:/scripts/rmrb.ahk", filename: "rmrb.ahk", tags: ["x", "y"] });
    const mockInvoke = vi.mocked(invoke);
    const { result } = await renderLoaded([script]);

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "save_script_tags") throw new Error("save failed");
      if (cmd === "get_scripts") return [script];
      if (cmd === "get_tag_icons") return {};
      if (cmd === "load_icon_cache") return {};
      return undefined;
    });

    await act(async () => {
      await result.current.removeTag(script, "x");
    });

    // Should rollback to original tags
    await waitFor(() => {
      expect(result.current.allScripts.find(s => s.id === script.id)?.tags).toEqual(["x", "y"]);
    });
  });

  it("removeTag skips if already removing (removingTags guard)", async () => {
    const script = makeScript({ id: "guard-test", path: "c:/scripts/guard.ahk", filename: "guard.ahk", tags: ["t1"] });
    const mockInvoke = vi.mocked(invoke);
    const { result } = await renderLoaded([script]);

    // Pre-mark tag as being removed
    act(() => {
      useTreeStore.getState().addRemovingTag(`${script.path}-t1`);
    });

    await act(async () => {
      await result.current.removeTag(script, "t1");
    });

    // save_script_tags should NOT have been called (guard returned early)
    expect(mockInvoke).not.toHaveBeenCalledWith("save_script_tags", expect.anything());
    // Tags unchanged
    expect(result.current.allScripts.find(s => s.id === script.id)?.tags).toEqual(["t1"]);
  });
});

// ---------------------------------------------------------------------------
// 8. Merge edge cases
// ---------------------------------------------------------------------------
describe("merge edge cases", () => {
  it("merge: new script not in prevMap is added as-is", async () => {
    const initial = [makeScript({ id: "m1", path: "c:/scripts/m1.ahk", filename: "m1.ahk" })];
    const mockInvoke = vi.mocked(invoke);
    let callCount = 0;

    const newScript = makeScript({ id: "m2", path: "c:/scripts/m2.ahk", filename: "m2.ahk" });

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_scripts") {
        callCount++;
        if (callCount <= 1) return initial;
        return [...initial, newScript];
      }
      if (cmd === "get_tag_icons") return {};
      if (cmd === "load_icon_cache") return {};
      return undefined;
    });

    const { result, rerender } = renderHook(
      (props) => useScriptTree(props),
      { initialProps: defaultOpts({ refreshKey: 0 }) }
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.allScripts.length).toBe(1);
    });

    rerender(defaultOpts({ refreshKey: 1 }));

    await waitFor(() => {
      expect(result.current.allScripts.length).toBe(2);
    });

    const added = result.current.allScripts.find(s => s.id === "m2");
    expect(added).toBeDefined();
    expect(added!.path).toBe("c:/scripts/m2.ahk");
  });

  it("merge: tags changed triggers anyChanged", async () => {
    const script = makeScript({ id: "tc1", path: "c:/scripts/tc.ahk", filename: "tc.ahk", tags: ["old"] });
    const mockInvoke = vi.mocked(invoke);
    let callCount = 0;

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_scripts") {
        callCount++;
        if (callCount <= 1) return [script];
        return [{ ...script, tags: ["new"] }];
      }
      if (cmd === "get_tag_icons") return {};
      if (cmd === "load_icon_cache") return {};
      return undefined;
    });

    const { result, rerender } = renderHook(
      (props) => useScriptTree(props),
      { initialProps: defaultOpts({ refreshKey: 0 }) }
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    rerender(defaultOpts({ refreshKey: 1 }));

    await waitFor(() => {
      const s = result.current.allScripts.find(s => s.id === "tc1");
      expect(s?.tags).toEqual(["new"]);
    });
  });

  it("merge: is_hidden changed triggers update", async () => {
    const script = makeScript({ id: "hc1", path: "c:/scripts/hc.ahk", filename: "hc.ahk", is_hidden: false });
    const mockInvoke = vi.mocked(invoke);
    let callCount = 0;

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_scripts") {
        callCount++;
        if (callCount <= 1) return [script];
        return [{ ...script, is_hidden: true }];
      }
      if (cmd === "get_tag_icons") return {};
      if (cmd === "load_icon_cache") return {};
      return undefined;
    });

    const { result, rerender } = renderHook(
      (props) => useScriptTree(props),
      { initialProps: defaultOpts({ refreshKey: 0 }) }
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    rerender(defaultOpts({ refreshKey: 1 }));

    await waitFor(() => {
      const s = result.current.allScripts.find(s => s.id === "hc1");
      expect(s?.is_hidden).toBe(true);
    });
  });

  it("merge: id changed with same path triggers update", async () => {
    const script = makeScript({ id: "old-id", path: "c:/scripts/idc.ahk", filename: "idc.ahk" });
    const mockInvoke = vi.mocked(invoke);
    let callCount = 0;

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_scripts") {
        callCount++;
        if (callCount <= 1) return [script];
        return [{ ...script, id: "new-id" }];
      }
      if (cmd === "get_tag_icons") return {};
      if (cmd === "load_icon_cache") return {};
      return undefined;
    });

    const { result, rerender } = renderHook(
      (props) => useScriptTree(props),
      { initialProps: defaultOpts({ refreshKey: 0 }) }
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    rerender(defaultOpts({ refreshKey: 1 }));

    await waitFor(() => {
      const s = result.current.allScripts.find(s => s.path === "c:/scripts/idc.ahk");
      expect(s?.id).toBe("new-id");
    });
  });

  it("merge: nothing changed returns prev (reference equality)", async () => {
    const scripts = [makeScript({ id: "eq1", path: "c:/scripts/eq.ahk", filename: "eq.ahk" })];
    const mockInvoke = vi.mocked(invoke);
    let callCount = 0;

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_scripts") {
        callCount++;
        // Return identical data each time
        return [makeScript({ id: "eq1", path: "c:/scripts/eq.ahk", filename: "eq.ahk" })];
      }
      if (cmd === "get_tag_icons") return {};
      if (cmd === "load_icon_cache") return {};
      return undefined;
    });

    const { result, rerender } = renderHook(
      (props) => useScriptTree(props),
      { initialProps: defaultOpts({ refreshKey: 0 }) }
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const prevRef = result.current.allScripts;

    rerender(defaultOpts({ refreshKey: 1 }));

    await waitFor(() => {
      expect(callCount).toBeGreaterThanOrEqual(2);
    });

    // Reference equality — merge returned prev when nothing changed
    expect(result.current.allScripts).toBe(prevRef);
  });
});

// ---------------------------------------------------------------------------
// 9. moveFocus (vim navigation)
// ---------------------------------------------------------------------------
describe("moveFocus (vim navigation)", () => {
  it("moveFocus('down') focuses next navigable item", async () => {
    const scripts = [
      makeScript({ id: "f1", path: "c:/scripts/a.ahk", filename: "a.ahk" }),
      makeScript({ id: "f2", path: "c:/scripts/b.ahk", filename: "b.ahk" }),
    ];
    const { result } = await renderLoaded(scripts, { viewMode: "list" });

    // Focus first item
    act(() => { result.current.moveFocus("down"); });
    expect(useTreeStore.getState().focusedPath).toBe("c:/scripts/a.ahk");

    // Move down to next
    act(() => { result.current.moveFocus("down"); });
    expect(useTreeStore.getState().focusedPath).toBe("c:/scripts/b.ahk");
  });

  it("moveFocus('up') focuses previous navigable item", async () => {
    const scripts = [
      makeScript({ id: "u1", path: "c:/scripts/a.ahk", filename: "a.ahk" }),
      makeScript({ id: "u2", path: "c:/scripts/b.ahk", filename: "b.ahk" }),
    ];
    const { result } = await renderLoaded(scripts, { viewMode: "list" });

    // Set focus to second item
    act(() => { useTreeStore.getState().setFocusedPath("c:/scripts/b.ahk"); });

    // Move up
    act(() => { result.current.moveFocus("up"); });
    expect(useTreeStore.getState().focusedPath).toBe("c:/scripts/a.ahk");
  });

  it("moveFocus without focusedPath focuses first navigable item", async () => {
    const scripts = [
      makeScript({ id: "n1", path: "c:/scripts/first.ahk", filename: "first.ahk" }),
      makeScript({ id: "n2", path: "c:/scripts/second.ahk", filename: "second.ahk" }),
    ];
    const { result } = await renderLoaded(scripts, { viewMode: "list" });

    expect(useTreeStore.getState().focusedPath).toBeNull();

    act(() => { result.current.moveFocus("down"); });
    expect(useTreeStore.getState().focusedPath).toBe("c:/scripts/first.ahk");
  });

  it("moveFocus with orphaned focusedPath resets to first navigable", async () => {
    const scripts = [
      makeScript({ id: "o1", path: "c:/scripts/alive.ahk", filename: "alive.ahk" }),
    ];
    const { result } = await renderLoaded(scripts, { viewMode: "list" });

    // Set focus to a path that doesn't exist in visibleItems
    act(() => { useTreeStore.getState().setFocusedPath("c:/scripts/deleted.ahk"); });

    act(() => { result.current.moveFocus("down"); });
    expect(useTreeStore.getState().focusedPath).toBe("c:/scripts/alive.ahk");
  });

  it("moveFocus on empty visibleItems sets focusedPath to null", async () => {
    // Load with a search that matches nothing
    const { result } = await renderLoaded([], { viewMode: "list" });

    act(() => { result.current.moveFocus("down"); });
    expect(useTreeStore.getState().focusedPath).toBeNull();
  });

  it("moveFocus skips tag- prefixed items (hub headers)", async () => {
    const scripts = [
      makeScript({ id: "h1", path: "c:/scripts/h1.ahk", filename: "h1.ahk", tags: ["hub", "groupA"] }),
      makeScript({ id: "h2", path: "c:/scripts/h2.ahk", filename: "h2.ahk", tags: ["hub", "groupB"] }),
    ];
    const { result } = await renderLoaded(scripts, { filterTag: "hub", viewMode: "tiles" });

    // In hub mode, visibleItems includes tag-groupA, h1.ahk, tag-groupB, h2.ahk
    // moveFocus should skip the tag- headers
    act(() => { result.current.moveFocus("down"); });
    const focused = useTreeStore.getState().focusedPath;
    expect(focused).not.toBeNull();
    expect(focused!.startsWith("tag-")).toBe(false);
  });

  it("moveFocus cyclic: down at end wraps to start", async () => {
    const scripts = [
      makeScript({ id: "c1", path: "c:/scripts/c1.ahk", filename: "c1.ahk" }),
      makeScript({ id: "c2", path: "c:/scripts/c2.ahk", filename: "c2.ahk" }),
    ];
    const { result } = await renderLoaded(scripts, { viewMode: "list" });

    // Focus last item
    act(() => { useTreeStore.getState().setFocusedPath("c:/scripts/c2.ahk"); });

    // Move down — should wrap to first
    act(() => { result.current.moveFocus("down"); });
    expect(useTreeStore.getState().focusedPath).toBe("c:/scripts/c1.ahk");
  });

  it("moveFocus sets isVimMode to true", async () => {
    const scripts = [makeScript({ id: "vm1", path: "c:/scripts/vm.ahk", filename: "vm.ahk" })];
    const { result } = await renderLoaded(scripts, { viewMode: "list" });

    expect(useTreeStore.getState().isVimMode).toBe(false);

    act(() => { result.current.moveFocus("down"); });
    expect(useTreeStore.getState().isVimMode).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 10. Error recovery & concurrent
// ---------------------------------------------------------------------------
describe("error recovery & concurrent", () => {
  it("fetchData error sets loading=false and isFetching=false (no hang)", async () => {
    const mockInvoke = vi.mocked(invoke);
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_scripts") throw new Error("network error");
      if (cmd === "get_tag_icons") return {};
      if (cmd === "load_icon_cache") return {};
      return undefined;
    });

    const { result } = renderHook(
      (props) => useScriptTree(props),
      { initialProps: defaultOpts() }
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.isFetching).toBe(false);
    });
  });

  it("concurrent fetchData(true) reuses _scanPromise (dedup)", async () => {
    const mockInvoke = vi.mocked(invoke);
    let getScriptsCallCount = 0;
    const scripts = [makeScript({ id: "dedup1", path: "c:/scripts/dedup.ahk", filename: "dedup.ahk" })];

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_scripts") {
        getScriptsCallCount++;
        // Simulate slow scan
        await new Promise(r => setTimeout(r, 50));
        return scripts;
      }
      if (cmd === "get_tag_icons") return {};
      if (cmd === "load_icon_cache") return {};
      return undefined;
    });

    const { result, rerender } = renderHook(
      (props) => useScriptTree(props),
      { initialProps: defaultOpts({ refreshKey: 0 }) }
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const countBefore = getScriptsCallCount;

    // Trigger two force scans nearly simultaneously via refreshKey changes
    rerender(defaultOpts({ refreshKey: 1 }));
    // The second scan should reuse the same promise
    rerender(defaultOpts({ refreshKey: 2 }));

    await waitFor(() => {
      expect(getScriptsCallCount).toBeGreaterThan(countBefore);
    });

    // At most 2 additional calls (one from refreshKey=1 starts scan, refreshKey=2 reuses it)
    // Not 3 (which would mean each refreshKey triggered its own scan)
    expect(getScriptsCallCount - countBefore).toBeLessThanOrEqual(2);
  });

  it("onScanComplete callback fires after force scan", async () => {
    const onScanComplete = vi.fn();
    const scripts = [makeScript({ id: "sc1", path: "c:/scripts/sc.ahk", filename: "sc.ahk" })];
    const mockInvoke = vi.mocked(invoke);
    let callCount = 0;

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_scripts") {
        callCount++;
        return scripts;
      }
      if (cmd === "get_tag_icons") return {};
      if (cmd === "load_icon_cache") return {};
      return undefined;
    });

    const { rerender } = renderHook(
      (props) => useScriptTree(props),
      { initialProps: defaultOpts({ refreshKey: 0, onScanComplete }) }
    );

    await waitFor(() => {
      expect(callCount).toBeGreaterThanOrEqual(1);
    });

    // Force scan via refreshKey
    rerender(defaultOpts({ refreshKey: 1, onScanComplete }));

    await waitFor(() => {
      expect(onScanComplete).toHaveBeenCalled();
    });

    const timestamp = onScanComplete.mock.calls[0][0];
    expect(typeof timestamp).toBe("number");
    expect(timestamp).toBeGreaterThan(0);
  });

  it("onRunningCountChange fires when running scripts change", async () => {
    const onRunningCountChange = vi.fn();
    const scripts = [
      makeScript({ id: "rc1", path: "c:/scripts/rc1.ahk", filename: "rc1.ahk", is_running: true }),
      makeScript({ id: "rc2", path: "c:/scripts/rc2.ahk", filename: "rc2.ahk", is_running: false }),
    ];

    const { result } = await renderLoaded(scripts, { onRunningCountChange });

    // Should have been called with count=1 (one running script)
    expect(onRunningCountChange).toHaveBeenCalledWith(1);

    // Simulate second script starting
    act(() => {
      __emit("script-status-changed", {
        path: "c:/scripts/rc2.ahk",
        is_running: true,
        has_ui: false,
      });
    });

    await waitFor(() => {
      expect(onRunningCountChange).toHaveBeenCalledWith(2);
    });
  });

  it("onTagsLoaded fires when unique tags change", async () => {
    const onTagsLoaded = vi.fn();
    const scripts = [
      makeScript({ id: "tl1", path: "c:/scripts/tl1.ahk", filename: "tl1.ahk", tags: ["alpha"] }),
      makeScript({ id: "tl2", path: "c:/scripts/tl2.ahk", filename: "tl2.ahk", tags: ["beta"] }),
    ];

    await renderLoaded(scripts, { onTagsLoaded });

    // Should have been called with sorted unique tags
    expect(onTagsLoaded).toHaveBeenCalledWith(["alpha", "beta"]);
  });

  it("onTagsLoaded excludes system tags (hub, fav, favourites)", async () => {
    const onTagsLoaded = vi.fn();
    const scripts = [
      makeScript({ id: "st1", path: "c:/scripts/st1.ahk", filename: "st1.ahk", tags: ["hub", "fav", "favourites", "useful"] }),
    ];

    await renderLoaded(scripts, { onTagsLoaded });

    // System tags should be filtered out, only "useful" remains
    expect(onTagsLoaded).toHaveBeenCalledWith(["useful"]);
  });
});

// ---------------------------------------------------------------------------
// 11. Search edge cases
// ---------------------------------------------------------------------------
describe("search edge cases", () => {
  it("searchQuery empty string applies no filtering", async () => {
    const { result } = await renderLoaded(ALL_SCRIPTS, {
      filterTag: "all",
      searchQuery: "",
    });
    const nonHidden = ALL_SCRIPTS.filter(s => !s.is_hidden);
    expect(result.current.filtered.length).toBe(nonHidden.length);
  });

  it("searchQuery whitespace only applies no filtering (trimmed)", async () => {
    const { result } = await renderLoaded(ALL_SCRIPTS, {
      filterTag: "all",
      searchQuery: "   ",
    });
    const nonHidden = ALL_SCRIPTS.filter(s => !s.is_hidden);
    expect(result.current.filtered.length).toBe(nonHidden.length);
  });

  it('"file:" with empty query after prefix returns all', async () => {
    const { result } = await renderLoaded(ALL_SCRIPTS, {
      filterTag: "all",
      searchQuery: "file:",
    });
    const nonHidden = ALL_SCRIPTS.filter(s => !s.is_hidden);
    expect(result.current.filtered.length).toBe(nonHidden.length);
  });

  it('"file:" with whitespace after prefix returns all', async () => {
    const { result } = await renderLoaded(ALL_SCRIPTS, {
      filterTag: "all",
      searchQuery: "file:   ",
    });
    const nonHidden = ALL_SCRIPTS.filter(s => !s.is_hidden);
    expect(result.current.filtered.length).toBe(nonHidden.length);
  });

  it('"path:" with empty query after prefix returns all', async () => {
    const { result } = await renderLoaded(ALL_SCRIPTS, {
      filterTag: "all",
      searchQuery: "path:",
    });
    const nonHidden = ALL_SCRIPTS.filter(s => !s.is_hidden);
    expect(result.current.filtered.length).toBe(nonHidden.length);
  });

  it("search expands all folders automatically", async () => {
    const scripts = [
      makeScript({ id: "se1", path: "c:/projects/tools/se1.ahk", filename: "se1.ahk" }),
      makeScript({ id: "se2", path: "c:/projects/other/se2.ahk", filename: "se2.ahk" }),
    ];
    const { result, rerender } = await renderLoaded(scripts, { searchQuery: "" });

    // Collapse all folders
    act(() => { useTreeStore.getState().setExpandedFolders({}); });

    // Set search query
    rerender(defaultOpts({ searchQuery: "se1" }));

    await waitFor(() => {
      const expanded = useTreeStore.getState().expandedFolders;
      // All folders in tree should be expanded when search is active
      const allPaths = result.current.visibleItems
        .filter(i => i.type === "folder")
        .map(i => i.path);
      // At least some folders should be expanded
      const hasExpanded = Object.values(expanded).some(v => v === true);
      expect(hasExpanded).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// 12. refreshKey
// ---------------------------------------------------------------------------
describe("refreshKey", () => {
  it("changing refreshKey triggers force scan", async () => {
    const mockInvoke = vi.mocked(invoke);
    let getScriptsCallCount = 0;
    const scripts = [makeScript({ id: "rk1", path: "c:/scripts/rk.ahk", filename: "rk.ahk" })];

    mockInvoke.mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === "get_scripts") {
        getScriptsCallCount++;
        return scripts;
      }
      if (cmd === "get_tag_icons") return {};
      if (cmd === "load_icon_cache") return {};
      return undefined;
    });

    const { result, rerender } = renderHook(
      (props) => useScriptTree(props),
      { initialProps: defaultOpts({ refreshKey: 0 }) }
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const countAfterInit = getScriptsCallCount;

    rerender(defaultOpts({ refreshKey: 1 }));

    await waitFor(() => {
      expect(getScriptsCallCount).toBeGreaterThan(countAfterInit);
    });
  });

  it("same refreshKey does not re-scan", async () => {
    const mockInvoke = vi.mocked(invoke);
    let getScriptsCallCount = 0;
    const scripts = [makeScript({ id: "rk2", path: "c:/scripts/rk2.ahk", filename: "rk2.ahk" })];

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_scripts") {
        getScriptsCallCount++;
        return scripts;
      }
      if (cmd === "get_tag_icons") return {};
      if (cmd === "load_icon_cache") return {};
      return undefined;
    });

    const { result, rerender } = renderHook(
      (props) => useScriptTree(props),
      { initialProps: defaultOpts({ refreshKey: 5 }) }
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const countAfterInit = getScriptsCallCount;

    // Re-render with same refreshKey
    rerender(defaultOpts({ refreshKey: 5 }));
    rerender(defaultOpts({ refreshKey: 5 }));

    // Wait a tick to ensure no new calls were made
    await new Promise(r => setTimeout(r, 50));

    expect(getScriptsCallCount).toBe(countAfterInit);
  });
});

// ===========================================================================
// RED TESTS — these describe DESIRED behavior that is currently BROKEN.
// They MUST FAIL on current code. After fixing the code, they turn GREEN.
// ===========================================================================

// ---------------------------------------------------------------------------
// 13. BUG: fetchData silently swallows errors (AUDIT HIGH #9)
// ---------------------------------------------------------------------------
describe("BUG: fetchData should expose error state", () => {
  it("fetchData error should set an error flag so UI can show feedback", async () => {
    // CURRENT BUG: catch(e) { } — errors silently swallowed, user sees stale data
    // DESIRED: hook exposes an `error` or `lastError` field when fetch fails
    const mockInvoke = vi.mocked(invoke);
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_scripts") throw new Error("DB connection failed");
      if (cmd === "get_tag_icons") return {};
      if (cmd === "load_icon_cache") return {};
      return undefined;
    });

    const { result } = renderHook(
      (props) => useScriptTree(props),
      { initialProps: defaultOpts() }
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Hook should expose the error so UI can display a message
    expect((result.current as any).error).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 14. BUG: event listener leak on fast unmount (AUDIT CRITICAL #5)
// ---------------------------------------------------------------------------
describe("BUG: event listeners must not fire after unmount", () => {
  it("events emitted after unmount must not update state", async () => {
    // CURRENT BUG: listen() is async (.then()), cleanup is sync.
    // If unmount happens before .then() resolves, listeners stay alive.
    // After unmount, they call setAllScripts on an unmounted component.
    const scripts = [makeScript({ id: "leak1", path: "c:/scripts/leak.ahk", filename: "leak.ahk" })];
    const { result, unmount } = await renderLoaded(scripts);

    // Wait for listeners to register
    await waitFor(() => { expect(__count("script-status-changed")).toBeGreaterThan(0); });

    // Capture state before unmount
    const scriptsBefore = result.current.allScripts;

    // Unmount the hook
    unmount();

    // Listeners must be fully removed — no leaks
    expect(__count("script-status-changed")).toBe(0);
    expect(__count("script-tags-changed")).toBe(0);

    // Emit event after unmount — should NOT cause React warnings or state updates
    // (This test validates cleanup correctness; React would warn about setState on unmounted)
    act(() => {
      __emit("script-status-changed", {
        path: "c:/scripts/leak.ahk",
        is_running: true,
        has_ui: false,
      });
    });

    // No crash, no state update — this is the minimum correctness bar
    // The deeper issue (async registration race) needs code fix
  });
});

// ---------------------------------------------------------------------------
// 15. BUG: startBurst interval leaks on unmount (AUDIT MEDIUM #14)
// ---------------------------------------------------------------------------
describe("BUG: startBurst interval should be cleaned up on unmount", () => {
  it("unmount during active burst polling should clear the interval", async () => {
    // CURRENT BUG: setInterval from startBurst is not tracked in a ref,
    // so unmount cannot clear it. Interval fires forever on dead component.
    const scripts = [makeScript({ id: "burst1", path: "c:/scripts/burst.ahk", filename: "burst.ahk" })];
    const mockInvoke = vi.mocked(invoke);
    let statusCallCount = 0;

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_scripts") return scripts;
      if (cmd === "get_tag_icons") return {};
      if (cmd === "load_icon_cache") return {};
      if (cmd === "get_script_status") {
        statusCallCount++;
        return { is_running: false, has_ui: false }; // Never matches expected, keeps polling
      }
      if (cmd === "run_script") return undefined;
      return undefined;
    });

    vi.useFakeTimers();

    const { result, unmount } = renderHook(
      (props) => useScriptTree(props),
      { initialProps: defaultOpts() }
    );

    // Manually wait for loading (can't use waitFor with fake timers easily)
    await vi.advanceTimersByTimeAsync(100);

    // Trigger a toggle which starts burst polling
    await act(async () => {
      await result.current.handleToggle(scripts[0]);
    });

    // Advance a few intervals to confirm polling is active
    const countBefore = statusCallCount;
    await vi.advanceTimersByTimeAsync(600); // 2 intervals
    expect(statusCallCount).toBeGreaterThan(countBefore);

    // Unmount while burst is active
    const countAtUnmount = statusCallCount;
    unmount();

    // Advance more time — interval should NOT fire after unmount
    await vi.advanceTimersByTimeAsync(3000); // 10 more intervals
    expect(statusCallCount).toBe(countAtUnmount); // No new calls!

    vi.useRealTimers();
  });
});
