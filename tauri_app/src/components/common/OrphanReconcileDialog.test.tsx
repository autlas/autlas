import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import OrphanReconcileDialog, { OrphanToast, type PendingMatch } from "./OrphanReconcileDialog";

// Override the global react-i18next mock to handle interpolation objects
// The global mock returns fallback as-is, which crashes React when fallback is an object like { count: 3 }
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallbackOrOpts?: string | Record<string, unknown>) => {
      if (typeof fallbackOrOpts === "string") return fallbackOrOpts;
      return key;
    },
    i18n: { changeLanguage: () => Promise.resolve(), language: "en" },
  }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(invoke).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

const sampleMatches: PendingMatch[] = [
  {
    orphan_id: "orphan-1",
    old_path: "c:/old/scripts/hello.ahk",
    new_path: "c:/new/scripts/hello.ahk",
    match_type: "exact",
    tags: ["utility", "hub", "daily"],
  },
  {
    orphan_id: "orphan-2",
    old_path: "c:/old/scripts/world.ahk",
    new_path: "c:/new/scripts/world.ahk",
    match_type: "fuzzy",
    tags: ["gaming"],
  },
];

const onClose = vi.fn();
const onResolved = vi.fn();
const onMatchResolved = vi.fn();

function renderDialog(matches = sampleMatches) {
  return render(
    <OrphanReconcileDialog
      matches={matches}
      onClose={onClose}
      onResolved={onResolved}
      onMatchResolved={onMatchResolved}
    />,
  );
}

// ─── OrphanReconcileDialog ──────────────────────────────────────

describe("OrphanReconcileDialog", () => {
  it("renders all matches", () => {
    renderDialog();
    expect(screen.getByText("orphan.title")).toBeInTheDocument();
    // Both old filenames visible (extractFilename returns last segment)
    expect(screen.getAllByText("hello.ahk")).toHaveLength(2); // old_path + new_path have same filename
    expect(screen.getAllByText("world.ahk")).toHaveLength(2);
  });

  it("link button → invokes resolve_orphan with action 'link'", async () => {
    renderDialog();
    const linkButtons = screen.getAllByText("orphan.link");
    fireEvent.click(linkButtons[0]);
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("resolve_orphan", {
        orphanId: "orphan-1",
        action: "link",
        newPath: "c:/new/scripts/hello.ahk",
      });
    });
  });

  it("discard button → invokes resolve_orphan with action 'discard'", async () => {
    renderDialog();
    const skipButtons = screen.getAllByText("orphan.skip");
    fireEvent.click(skipButtons[0]);
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("resolve_orphan", {
        orphanId: "orphan-1",
        action: "discard",
      });
    });
  });

  it("link all button → resolves all remaining matches", async () => {
    renderDialog();
    const linkAll = screen.getByText("orphan.link_all");
    fireEvent.click(linkAll);
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledTimes(2);
      expect(invoke).toHaveBeenCalledWith("resolve_orphan", {
        orphanId: "orphan-1",
        action: "link",
        newPath: "c:/new/scripts/hello.ahk",
      });
      expect(invoke).toHaveBeenCalledWith("resolve_orphan", {
        orphanId: "orphan-2",
        action: "link",
        newPath: "c:/new/scripts/world.ahk",
      });
    });
  });

  it("resolved match → shows 'done' state", async () => {
    renderDialog();
    const linkButtons = screen.getAllByText("orphan.link");
    fireEvent.click(linkButtons[0]);
    await waitFor(() => {
      expect(screen.getByText("orphan.done")).toBeInTheDocument();
    });
  });

  it("all resolved → calls onResolved and onClose after 600ms", async () => {
    vi.useFakeTimers();
    const single: PendingMatch[] = [sampleMatches[0]];
    render(
      <OrphanReconcileDialog
        matches={single}
        onClose={onClose}
        onResolved={onResolved}
        onMatchResolved={onMatchResolved}
      />,
    );

    // Use act to handle the async invoke and state updates
    await act(async () => {
      fireEvent.click(screen.getByText("orphan.link"));
      // Let the mock invoke resolve
      await vi.mocked(invoke).mock.results[0]?.value;
    });

    // Now the component re-renders with allDone=true, scheduling setTimeout
    act(() => {
      vi.advanceTimersByTime(700);
    });

    expect(onResolved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("backdrop click → calls onClose", () => {
    renderDialog();
    // The backdrop is the outermost fixed inset-0 div
    const backdrop = document.querySelector(".fixed.inset-0")!;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it("tags displayed (excluding system tags)", () => {
    renderDialog();
    // "hub" should be filtered out, "utility" and "daily" should appear
    expect(screen.getByText("utility")).toBeInTheDocument();
    expect(screen.getByText("daily")).toBeInTheDocument();
    expect(screen.getByText("gaming")).toBeInTheDocument();
    // "hub" is a system tag and should not appear in the tag pills
    const hubElements = screen.queryAllByText("hub");
    expect(hubElements).toHaveLength(0);
  });

  it("onMatchResolved called after each resolution", async () => {
    renderDialog();
    const linkButtons = screen.getAllByText("orphan.link");
    fireEvent.click(linkButtons[0]);
    await waitFor(() => {
      expect(onMatchResolved).toHaveBeenCalledWith("orphan-1");
    });
  });

  it("error handling → does not crash on invoke failure", async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error("backend error"));
    renderDialog();
    const linkButtons = screen.getAllByText("orphan.link");
    fireEvent.click(linkButtons[0]);
    await waitFor(() => {
      expect(invoke).toHaveBeenCalled();
    });
    // Component should still be rendered
    expect(screen.getByText("orphan.title")).toBeInTheDocument();
    // The match should NOT be marked as done (resolve failed)
    expect(screen.queryByText("orphan.done")).not.toBeInTheDocument();
  });
});

// ─── OrphanToast ────────────────────────────────────────────────

describe("OrphanToast", () => {
  it("count=1 → renders singular text", () => {
    render(<OrphanToast count={1} onReview={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByText("orphan.toast_one")).toBeInTheDocument();
  });

  it("count>1 → renders plural text with count", () => {
    render(<OrphanToast count={3} onReview={vi.fn()} onDismiss={vi.fn()} />);
    // With our mock, t("orphan.toast_many", { count }) returns the key
    expect(screen.getByText("orphan.toast_many")).toBeInTheDocument();
  });

  it("review button → calls onReview", () => {
    const onReview = vi.fn();
    render(<OrphanToast count={2} onReview={onReview} onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByText("orphan.review"));
    expect(onReview).toHaveBeenCalledOnce();
  });

  it("dismiss button → calls onDismiss", () => {
    const onDismiss = vi.fn();
    const { container } = render(<OrphanToast count={2} onReview={vi.fn()} onDismiss={onDismiss} />);
    // Dismiss button is the last button (contains CloseIcon)
    const buttons = container.querySelectorAll("button");
    const dismissBtn = buttons[buttons.length - 1];
    fireEvent.click(dismissBtn);
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
