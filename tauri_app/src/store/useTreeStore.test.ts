// @vitest-environment node
import { useTreeStore } from "./useTreeStore";

const initialState = useTreeStore.getState();

beforeEach(() => {
  localStorage.clear();
  useTreeStore.setState(initialState, true);
});

// ─── expandedFolders ───────────────────────────────────────────

describe("expandedFolders", () => {
  it("starts empty", () => {
    expect(useTreeStore.getState().expandedFolders).toEqual({});
  });

  it("setExpandedFolders replaces entire record", () => {
    const folders = { "/a": true, "/b": false };
    useTreeStore.getState().setExpandedFolders(folders);
    expect(useTreeStore.getState().expandedFolders).toEqual(folders);
  });

  it("setFolderExpanded sets a single folder", () => {
    useTreeStore.getState().setFolderExpanded("/a", true);
    expect(useTreeStore.getState().expandedFolders["/a"]).toBe(true);

    useTreeStore.getState().setFolderExpanded("/a", false);
    expect(useTreeStore.getState().expandedFolders["/a"]).toBe(false);
  });

  it("setFolderExpanded preserves other folders", () => {
    useTreeStore.getState().setFolderExpanded("/a", true);
    useTreeStore.getState().setFolderExpanded("/b", false);
    expect(useTreeStore.getState().expandedFolders).toEqual({ "/a": true, "/b": false });
  });

  describe("toggleFolder", () => {
    it("toggles undefined → false (collapse: was expanded by default)", () => {
      // undefined treated as truthy by `=== false` check, so toggle yields false
      useTreeStore.getState().toggleFolder("/a");
      expect(useTreeStore.getState().expandedFolders["/a"]).toBe(false);
    });

    it("toggles false → true (expand: was explicitly collapsed)", () => {
      useTreeStore.setState({ expandedFolders: { "/a": false } });
      useTreeStore.getState().toggleFolder("/a");
      expect(useTreeStore.getState().expandedFolders["/a"]).toBe(true);
    });

    it("toggles true → false", () => {
      useTreeStore.setState({ expandedFolders: { "/a": true } });
      useTreeStore.getState().toggleFolder("/a");
      expect(useTreeStore.getState().expandedFolders["/a"]).toBe(false);
    });

    it("does not affect other folders", () => {
      useTreeStore.setState({ expandedFolders: { "/a": true, "/b": false } });
      useTreeStore.getState().toggleFolder("/a");
      expect(useTreeStore.getState().expandedFolders["/b"]).toBe(false);
    });
  });
});

// ─── focusedPath ───────────────────────────────────────────────

describe("focusedPath", () => {
  it("defaults to null", () => {
    expect(useTreeStore.getState().focusedPath).toBeNull();
  });

  it("setFocusedPath updates value", () => {
    useTreeStore.getState().setFocusedPath("/scripts/test.ahk");
    expect(useTreeStore.getState().focusedPath).toBe("/scripts/test.ahk");
  });

  it("setFocusedPath can clear to null", () => {
    useTreeStore.getState().setFocusedPath("/a");
    useTreeStore.getState().setFocusedPath(null);
    expect(useTreeStore.getState().focusedPath).toBeNull();
  });
});

// ─── isVimMode ─────────────────────────────────────────────────

describe("isVimMode", () => {
  it("defaults to false", () => {
    expect(useTreeStore.getState().isVimMode).toBe(false);
  });

  it("setIsVimMode sets value", () => {
    useTreeStore.getState().setIsVimMode(true);
    expect(useTreeStore.getState().isVimMode).toBe(true);
    useTreeStore.getState().setIsVimMode(false);
    expect(useTreeStore.getState().isVimMode).toBe(false);
  });
});

// ─── pendingScripts ────────────────────────────────────────────

describe("pendingScripts", () => {
  it("starts empty", () => {
    expect(useTreeStore.getState().pendingScripts).toEqual({});
  });

  it("setPendingScript adds an entry", () => {
    useTreeStore.getState().setPendingScript("/test.ahk", "run");
    expect(useTreeStore.getState().pendingScripts["/test.ahk"]).toBe("run");
  });

  it("setPendingScript overwrites existing entry", () => {
    useTreeStore.getState().setPendingScript("/test.ahk", "run");
    useTreeStore.getState().setPendingScript("/test.ahk", "kill");
    expect(useTreeStore.getState().pendingScripts["/test.ahk"]).toBe("kill");
  });

  it("clearPendingScript removes an entry", () => {
    useTreeStore.getState().setPendingScript("/a.ahk", "run");
    useTreeStore.getState().setPendingScript("/b.ahk", "kill");
    useTreeStore.getState().clearPendingScript("/a.ahk");
    expect(useTreeStore.getState().pendingScripts).toEqual({ "/b.ahk": "kill" });
  });

  it("clearPendingScript on missing key is a no-op", () => {
    useTreeStore.getState().setPendingScript("/a.ahk", "run");
    useTreeStore.getState().clearPendingScript("/missing.ahk");
    expect(useTreeStore.getState().pendingScripts).toEqual({ "/a.ahk": "run" });
  });

  describe("clearPendingScriptByNormPath", () => {
    it("matches case-insensitively", () => {
      useTreeStore.getState().setPendingScript("C:/Scripts/Test.ahk", "run");
      useTreeStore.getState().clearPendingScriptByNormPath("c:/scripts/test.ahk");
      expect(useTreeStore.getState().pendingScripts).toEqual({});
    });

    it("returns same state when no match found", () => {
      useTreeStore.getState().setPendingScript("/a.ahk", "run");
      const before = useTreeStore.getState().pendingScripts;
      useTreeStore.getState().clearPendingScriptByNormPath("/nonexistent.ahk");
      // identity check — store returns `s` unchanged
      expect(useTreeStore.getState().pendingScripts).toBe(before);
    });

    it("only removes the first matching key", () => {
      // normPath is already lowercase, so the lookup finds the first key whose lowercase matches
      useTreeStore.getState().setPendingScript("C:/A.ahk", "run");
      useTreeStore.getState().setPendingScript("C:/B.ahk", "kill");
      useTreeStore.getState().clearPendingScriptByNormPath("c:/a.ahk");
      expect(useTreeStore.getState().pendingScripts).toEqual({ "C:/B.ahk": "kill" });
    });
  });
});

// ─── editingScript ─────────────────────────────────────────────

describe("editingScript", () => {
  it("defaults to null", () => {
    expect(useTreeStore.getState().editingScript).toBeNull();
  });

  it("setEditingScript sets and clears", () => {
    useTreeStore.getState().setEditingScript("/test.ahk");
    expect(useTreeStore.getState().editingScript).toBe("/test.ahk");
    useTreeStore.getState().setEditingScript(null);
    expect(useTreeStore.getState().editingScript).toBeNull();
  });
});

// ─── dragging ──────────────────────────────────────────────────

describe("dragging", () => {
  it("defaults to not dragging", () => {
    const s = useTreeStore.getState();
    expect(s.isDragging).toBe(false);
    expect(s.draggedScriptPath).toBeNull();
  });

  it("setDragging with path", () => {
    useTreeStore.getState().setDragging(true, "/test.ahk");
    const s = useTreeStore.getState();
    expect(s.isDragging).toBe(true);
    expect(s.draggedScriptPath).toBe("/test.ahk");
  });

  it("setDragging without path defaults to null", () => {
    useTreeStore.getState().setDragging(true);
    expect(useTreeStore.getState().draggedScriptPath).toBeNull();
  });

  it("setDragging false clears path", () => {
    useTreeStore.getState().setDragging(true, "/test.ahk");
    useTreeStore.getState().setDragging(false);
    const s = useTreeStore.getState();
    expect(s.isDragging).toBe(false);
    expect(s.draggedScriptPath).toBeNull();
  });
});

// ─── contextMenu ───────────────────────────────────────────────

describe("contextMenu", () => {
  it("defaults to null", () => {
    expect(useTreeStore.getState().contextMenu).toBeNull();
  });

  it("setContextMenu sets and clears", () => {
    const menu = { x: 100, y: 200, type: "script", data: { path: "/a.ahk" } };
    useTreeStore.getState().setContextMenu(menu);
    expect(useTreeStore.getState().contextMenu).toEqual(menu);

    useTreeStore.getState().setContextMenu(null);
    expect(useTreeStore.getState().contextMenu).toBeNull();
  });
});

// ─── showHidden ────────────────────────────────────────────────

describe("showHidden", () => {
  it("defaults to 'none'", () => {
    expect(useTreeStore.getState().showHidden).toBe("none");
  });

  it("setShowHidden cycles through values", () => {
    useTreeStore.getState().setShowHidden("all");
    expect(useTreeStore.getState().showHidden).toBe("all");
    useTreeStore.getState().setShowHidden("only");
    expect(useTreeStore.getState().showHidden).toBe("only");
    useTreeStore.getState().setShowHidden("none");
    expect(useTreeStore.getState().showHidden).toBe("none");
  });
});

// ─── selectedPath ──────────────────────────────────────────────

describe("selectedPath", () => {
  it("defaults to null", () => {
    expect(useTreeStore.getState().selectedPath).toBeNull();
  });

  it("setSelectedPath sets and clears", () => {
    useTreeStore.getState().setSelectedPath("/test.ahk");
    expect(useTreeStore.getState().selectedPath).toBe("/test.ahk");
    useTreeStore.getState().setSelectedPath(null);
    expect(useTreeStore.getState().selectedPath).toBeNull();
  });
});

// ─── detailPinned (localStorage persisted) ─────────────────────

describe("detailPinned", () => {
  it("defaults to false when localStorage is empty", () => {
    expect(useTreeStore.getState().detailPinned).toBe(false);
  });

  it("setDetailPinned updates state and localStorage", () => {
    useTreeStore.getState().setDetailPinned(true);
    expect(useTreeStore.getState().detailPinned).toBe(true);
    expect(localStorage.getItem("ahk_detail_pinned")).toBe("true");

    useTreeStore.getState().setDetailPinned(false);
    expect(useTreeStore.getState().detailPinned).toBe(false);
    expect(localStorage.getItem("ahk_detail_pinned")).toBe("false");
  });

  it("toggleDetailPinned flips state and persists", () => {
    useTreeStore.getState().toggleDetailPinned();
    expect(useTreeStore.getState().detailPinned).toBe(true);
    expect(localStorage.getItem("ahk_detail_pinned")).toBe("true");

    useTreeStore.getState().toggleDetailPinned();
    expect(useTreeStore.getState().detailPinned).toBe(false);
    expect(localStorage.getItem("ahk_detail_pinned")).toBe("false");
  });
});

// ─── folderDurations ───────────────────────────────────────────

describe("folderDurations", () => {
  it("starts empty", () => {
    expect(useTreeStore.getState().folderDurations).toEqual({});
  });

  it("setFolderDuration adds an entry", () => {
    useTreeStore.getState().setFolderDuration("/a", 300);
    expect(useTreeStore.getState().folderDurations["/a"]).toBe(300);
  });

  it("clearFolderDuration removes an entry", () => {
    useTreeStore.getState().setFolderDuration("/a", 300);
    useTreeStore.getState().setFolderDuration("/b", 200);
    useTreeStore.getState().clearFolderDuration("/a");
    expect(useTreeStore.getState().folderDurations).toEqual({ "/b": 200 });
  });

  it("clearFolderDuration on missing key is safe", () => {
    useTreeStore.getState().clearFolderDuration("/missing");
    expect(useTreeStore.getState().folderDurations).toEqual({});
  });
});

// ─── removingTags ──────────────────────────────────────────────

describe("removingTags", () => {
  it("starts as empty Set", () => {
    const tags = useTreeStore.getState().removingTags;
    expect(tags).toBeInstanceOf(Set);
    expect(tags.size).toBe(0);
  });

  it("addRemovingTag adds to the set", () => {
    useTreeStore.getState().addRemovingTag("tag-1");
    useTreeStore.getState().addRemovingTag("tag-2");
    const tags = useTreeStore.getState().removingTags;
    expect(tags.has("tag-1")).toBe(true);
    expect(tags.has("tag-2")).toBe(true);
    expect(tags.size).toBe(2);
  });

  it("addRemovingTag is idempotent", () => {
    useTreeStore.getState().addRemovingTag("tag-1");
    useTreeStore.getState().addRemovingTag("tag-1");
    expect(useTreeStore.getState().removingTags.size).toBe(1);
  });

  it("clearRemovingTag removes from the set", () => {
    useTreeStore.getState().addRemovingTag("tag-1");
    useTreeStore.getState().addRemovingTag("tag-2");
    useTreeStore.getState().clearRemovingTag("tag-1");
    const tags = useTreeStore.getState().removingTags;
    expect(tags.has("tag-1")).toBe(false);
    expect(tags.has("tag-2")).toBe(true);
  });

  it("clearRemovingTag on missing key is safe", () => {
    useTreeStore.getState().clearRemovingTag("nonexistent");
    expect(useTreeStore.getState().removingTags.size).toBe(0);
  });

  it("creates a new Set reference on each mutation", () => {
    const before = useTreeStore.getState().removingTags;
    useTreeStore.getState().addRemovingTag("tag-1");
    const after = useTreeStore.getState().removingTags;
    expect(before).not.toBe(after);
  });
});

// ─── showFileSize (localStorage persisted) ─────────────────────

describe("showFileSize", () => {
  it("defaults to false when localStorage is empty", () => {
    expect(useTreeStore.getState().showFileSize).toBe(false);
  });

  it("setShowFileSize updates state and localStorage", () => {
    useTreeStore.getState().setShowFileSize(true);
    expect(useTreeStore.getState().showFileSize).toBe(true);
    expect(localStorage.getItem("ahk_show_file_size")).toBe("true");
  });

  it("toggleShowFileSize flips and persists", () => {
    useTreeStore.getState().toggleShowFileSize();
    expect(useTreeStore.getState().showFileSize).toBe(true);
    expect(localStorage.getItem("ahk_show_file_size")).toBe("true");

    useTreeStore.getState().toggleShowFileSize();
    expect(useTreeStore.getState().showFileSize).toBe(false);
    expect(localStorage.getItem("ahk_show_file_size")).toBe("false");
  });
});

// ─── sidebarCollapsed (localStorage persisted) ─────────────────

describe("sidebarCollapsed", () => {
  it("defaults to false when localStorage is empty", () => {
    expect(useTreeStore.getState().sidebarCollapsed).toBe(false);
  });

  it("setSidebarCollapsed updates state and localStorage", () => {
    useTreeStore.getState().setSidebarCollapsed(true);
    expect(useTreeStore.getState().sidebarCollapsed).toBe(true);
    expect(localStorage.getItem("ahk_sidebar_collapsed")).toBe("true");
  });

  it("toggleSidebarCollapsed flips and persists", () => {
    useTreeStore.getState().toggleSidebarCollapsed();
    expect(useTreeStore.getState().sidebarCollapsed).toBe(true);
    expect(localStorage.getItem("ahk_sidebar_collapsed")).toBe("true");

    useTreeStore.getState().toggleSidebarCollapsed();
    expect(useTreeStore.getState().sidebarCollapsed).toBe(false);
    expect(localStorage.getItem("ahk_sidebar_collapsed")).toBe("false");
  });
});

// ─── sidebarWidth (localStorage persisted) ─────────────────────

describe("sidebarWidth", () => {
  it("defaults to 288 when localStorage is empty", () => {
    expect(useTreeStore.getState().sidebarWidth).toBe(288);
  });

  it("setSidebarWidth updates state and localStorage", () => {
    useTreeStore.getState().setSidebarWidth(400);
    expect(useTreeStore.getState().sidebarWidth).toBe(400);
    expect(localStorage.getItem("ahk_sidebar_width")).toBe("400");
  });
});

// ─── tagIcons ──────────────────────────────────────────────────

describe("tagIcons", () => {
  it("starts empty", () => {
    expect(useTreeStore.getState().tagIcons).toEqual({});
  });

  it("setTagIcons replaces all icons", () => {
    useTreeStore.getState().setTagIcons({ work: "briefcase", play: "gamepad" });
    expect(useTreeStore.getState().tagIcons).toEqual({ work: "briefcase", play: "gamepad" });
  });

  it("setTagIcon adds or updates a single icon", () => {
    useTreeStore.getState().setTagIcon("work", "briefcase");
    expect(useTreeStore.getState().tagIcons.work).toBe("briefcase");

    useTreeStore.getState().setTagIcon("work", "laptop");
    expect(useTreeStore.getState().tagIcons.work).toBe("laptop");
  });

  it("removeTagIcon removes one icon", () => {
    useTreeStore.getState().setTagIcons({ work: "briefcase", play: "gamepad" });
    useTreeStore.getState().removeTagIcon("work");
    expect(useTreeStore.getState().tagIcons).toEqual({ play: "gamepad" });
  });

  it("removeTagIcon on missing key is safe", () => {
    useTreeStore.getState().removeTagIcon("nonexistent");
    expect(useTreeStore.getState().tagIcons).toEqual({});
  });
});

// ─── iconCache ─────────────────────────────────────────────────

describe("iconCache", () => {
  it("starts empty", () => {
    expect(useTreeStore.getState().iconCache).toEqual({});
  });

  it("setIconCache replaces entire cache", () => {
    const cache = { briefcase: ["M0 0", "M1 1"] as [string, string] };
    useTreeStore.getState().setIconCache(cache);
    expect(useTreeStore.getState().iconCache).toEqual(cache);
  });

  it("addToIconCache adds a single entry", () => {
    useTreeStore.getState().addToIconCache("briefcase", ["M0 0", "M1 1"]);
    useTreeStore.getState().addToIconCache("gamepad", ["M2 2", "M3 3"]);
    expect(useTreeStore.getState().iconCache).toEqual({
      briefcase: ["M0 0", "M1 1"],
      gamepad: ["M2 2", "M3 3"],
    });
  });

  it("addToIconCache overwrites existing entry", () => {
    useTreeStore.getState().addToIconCache("briefcase", ["M0 0", "M1 1"]);
    useTreeStore.getState().addToIconCache("briefcase", ["M4 4", "M5 5"]);
    expect(useTreeStore.getState().iconCache.briefcase).toEqual(["M4 4", "M5 5"]);
  });
});

// ─── iconPickerTag ─────────────────────────────────────────────

describe("iconPickerTag", () => {
  it("defaults to null", () => {
    expect(useTreeStore.getState().iconPickerTag).toBeNull();
  });

  it("setIconPickerTag sets and clears", () => {
    useTreeStore.getState().setIconPickerTag("work");
    expect(useTreeStore.getState().iconPickerTag).toBe("work");

    useTreeStore.getState().setIconPickerTag(null);
    expect(useTreeStore.getState().iconPickerTag).toBeNull();
  });
});
