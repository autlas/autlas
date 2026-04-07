import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import EmptyState from "./EmptyState";

// Mock Element.prototype.animate (happy-dom doesn't support Web Animations API)
if (typeof Element.prototype.animate === "undefined") {
  Element.prototype.animate = vi.fn().mockReturnValue({
    cancel: vi.fn(),
    playState: "running",
    onfinish: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

const defaults = {
  isPathsEmpty: false,
  hasContent: true,
  searchQuery: "",
  filterTag: "all",
};

describe("EmptyState", () => {
  // ─── isPathsEmpty ─────────────────────────────────────────────

  it("isPathsEmpty → renders 'Library is Empty' title and add button", () => {
    render(<EmptyState {...defaults} isPathsEmpty={true} hasContent={false} />);
    expect(screen.getByText("Library is Empty")).toBeInTheDocument();
    expect(screen.getByText("settings.add_path")).toBeInTheDocument();
  });

  it("isPathsEmpty → onAddPath called on button click", () => {
    const onAddPath = vi.fn();
    render(<EmptyState {...defaults} isPathsEmpty={true} hasContent={false} onAddPath={onAddPath} />);
    fireEvent.click(screen.getByText("settings.add_path"));
    expect(onAddPath).toHaveBeenCalledOnce();
  });

  // ─── no content ───────────────────────────────────────────────

  it("no content with scanPaths → renders paths list", () => {
    const paths = ["c:/scripts", "d:/autohotkey"];
    render(<EmptyState {...defaults} hasContent={false} scanPaths={paths} />);
    expect(screen.getByText("No Scripts Detected")).toBeInTheDocument();
    expect(screen.getByText("c:/scripts")).toBeInTheDocument();
    expect(screen.getByText("d:/autohotkey")).toBeInTheDocument();
  });

  it("no content → onRemovePath called with correct path", () => {
    const onRemovePath = vi.fn();
    const paths = ["c:/scripts", "d:/autohotkey"];
    render(<EmptyState {...defaults} hasContent={false} scanPaths={paths} onRemovePath={onRemovePath} />);
    // Each path row has two buttons: folder icon and close icon.
    // The close (remove) button is the second button in each row.
    const pathRows = screen.getAllByText((_, el) => {
      return el?.tagName === "SPAN" && el?.classList.contains("font-mono") && paths.includes(el.textContent || "") || false;
    });
    // Click the remove button (CloseIcon) in the first path row
    const firstRow = pathRows[0].closest("div[class*='flex items-center space-x-3']")!;
    const buttons = firstRow.querySelectorAll("button");
    // Second button is the remove button (after folder icon)
    fireEvent.click(buttons[1]);
    expect(onRemovePath).toHaveBeenCalledWith("c:/scripts");
  });

  it("no content → onRefresh called", () => {
    const onRefresh = vi.fn();
    render(<EmptyState {...defaults} hasContent={false} onRefresh={onRefresh} />);
    fireEvent.click(screen.getByText("Refresh Scan"));
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  // ─── search with no results ───────────────────────────────────

  it("search with no results → renders 'Nothing Found'", () => {
    render(<EmptyState {...defaults} searchQuery="foobar" />);
    expect(screen.getByText("Nothing Found")).toBeInTheDocument();
  });

  it("search → onRefresh and onOpenSettings buttons work", () => {
    const onRefresh = vi.fn();
    const onOpenSettings = vi.fn();
    render(
      <EmptyState {...defaults} searchQuery="foobar" onRefresh={onRefresh} onOpenSettings={onOpenSettings} />,
    );
    fireEvent.click(screen.getByText("Refresh Scan"));
    expect(onRefresh).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByText("sidebar.settings"));
    expect(onOpenSettings).toHaveBeenCalledOnce();
  });

  // ─── default (filter tag) ────────────────────────────────────

  it("default empty → renders filter tag text", () => {
    render(<EmptyState {...defaults} filterTag="gaming" />);
    expect(screen.getByText("hub.empty_channel")).toBeInTheDocument();
  });

  it("default empty with filterTag='all' → renders empty tree text", () => {
    render(<EmptyState {...defaults} filterTag="all" />);
    expect(screen.getByText("hub.empty_tree")).toBeInTheDocument();
  });

  // ─── isRefreshing ─────────────────────────────────────────────

  it("isRefreshing prop → refresh icon SVG rendered", () => {
    const { container } = render(
      <EmptyState {...defaults} hasContent={false} isRefreshing={true} />,
    );
    // SyncIcon renders an SVG inside the RefreshSyncIcon wrapper
    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThan(0);
  });
});
