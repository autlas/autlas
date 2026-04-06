import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import ContextMenu from "./ContextMenu";

// Override global react-i18next mock to handle interpolation objects
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

const clipboardWriteText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(invoke).mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: clipboardWriteText },
    writable: true,
    configurable: true,
  });
});

const onClose = vi.fn();
const onStartRenameTag = vi.fn();
const onRefresh = vi.fn();
const onChooseTagIcon = vi.fn();

const baseProps = { onClose, onStartRenameTag, onRefresh, onChooseTagIcon };

const scriptData = {
  id: "id-1",
  path: "c:/scripts/test.ahk",
  tags: ["utility"],
};

const hubScriptData = {
  id: "id-2",
  path: "c:/scripts/fav.ahk",
  tags: ["hub", "gaming"],
};

const folderData = {
  fullName: "c:/scripts/subfolder",
  is_hidden: false,
  onExpandAll: vi.fn(),
};

function scriptMenu(data = scriptData) {
  return { x: 100, y: 100, type: "script" as const, data };
}

function tagMenu(tag = "utility") {
  return { x: 100, y: 100, type: "tag" as const, data: tag };
}

function folderMenu(data = folderData) {
  return { x: 100, y: 100, type: "folder" as const, data };
}

describe("ContextMenu", () => {
  // ─── null state ───────────────────────────────────────────────

  it("contextMenu=null → renders nothing", () => {
    const { container } = render(<ContextMenu {...baseProps} contextMenu={null} />);
    expect(container.innerHTML).toBe("");
  });

  // ─── script type ──────────────────────────────────────────────

  it("script type → renders pin, edit, show in folder, open with, copy path", () => {
    render(<ContextMenu {...baseProps} contextMenu={scriptMenu()} />);
    expect(screen.getByText("context.pin")).toBeInTheDocument();
    expect(screen.getByText("context.edit")).toBeInTheDocument();
    expect(screen.getByText("context.show_in_folder")).toBeInTheDocument();
    expect(screen.getByText("context.open_with")).toBeInTheDocument();
    expect(screen.getByText("context.copy_path")).toBeInTheDocument();
  });

  it("script with hub tag → renders 'unpin' instead of 'pin'", () => {
    render(<ContextMenu {...baseProps} contextMenu={scriptMenu(hubScriptData)} />);
    expect(screen.getByText("context.unpin")).toBeInTheDocument();
    expect(screen.queryByText("context.pin")).not.toBeInTheDocument();
  });

  it("script without hub tag → renders 'pin'", () => {
    render(<ContextMenu {...baseProps} contextMenu={scriptMenu(scriptData)} />);
    expect(screen.getByText("context.pin")).toBeInTheDocument();
    expect(screen.queryByText("context.unpin")).not.toBeInTheDocument();
  });

  it("pin click → invokes add_script_tag with hub tag", async () => {
    render(<ContextMenu {...baseProps} contextMenu={scriptMenu(scriptData)} />);
    fireEvent.click(screen.getByText("context.pin"));
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("add_script_tag", { id: "id-1", tag: "hub" });
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("unpin click → invokes remove_script_tag", async () => {
    render(<ContextMenu {...baseProps} contextMenu={scriptMenu(hubScriptData)} />);
    fireEvent.click(screen.getByText("context.unpin"));
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("remove_script_tag", { id: "id-2", tag: "hub" });
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("copy path → calls navigator.clipboard.writeText", () => {
    render(<ContextMenu {...baseProps} contextMenu={scriptMenu()} />);
    fireEvent.click(screen.getByText("context.copy_path"));
    expect(clipboardWriteText).toHaveBeenCalledWith("c:/scripts/test.ahk");
    expect(onClose).toHaveBeenCalled();
  });

  // ─── tag type ─────────────────────────────────────────────────

  it("tag type → renders choose icon, rename, delete", () => {
    render(<ContextMenu {...baseProps} contextMenu={tagMenu("utility")} />);
    expect(screen.getByText("Choose icon")).toBeInTheDocument();
    expect(screen.getByText("context.rename")).toBeInTheDocument();
    expect(screen.getByText("context.delete_tag")).toBeInTheDocument();
  });

  it("tag rename click → calls onStartRenameTag", () => {
    render(<ContextMenu {...baseProps} contextMenu={tagMenu("utility")} />);
    fireEvent.click(screen.getByText("context.rename"));
    expect(onStartRenameTag).toHaveBeenCalledWith("utility");
    expect(onClose).toHaveBeenCalled();
  });

  it("tag delete → shows confirm dialog", () => {
    render(<ContextMenu {...baseProps} contextMenu={tagMenu("utility")} />);
    fireEvent.click(screen.getByText("context.delete_tag"));
    // ConfirmDialog renders "Delete" and "Cancel" buttons
    expect(screen.getByText("Delete")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("tag delete confirm → invokes delete_tag + calls onRefresh", async () => {
    render(<ContextMenu {...baseProps} contextMenu={tagMenu("utility")} />);
    fireEvent.click(screen.getByText("context.delete_tag"));
    fireEvent.click(screen.getByText("Delete"));
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("delete_tag", { tag: "utility" });
    });
    expect(onClose).toHaveBeenCalled();
    expect(onRefresh).toHaveBeenCalled();
  });

  it("tag delete cancel → closes confirm dialog", () => {
    render(<ContextMenu {...baseProps} contextMenu={tagMenu("utility")} />);
    fireEvent.click(screen.getByText("context.delete_tag"));
    expect(screen.getByText("Delete")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
  });

  // ─── folder type ──────────────────────────────────────────────

  it("folder type → renders show in folder, expand all, hide folder, copy path", () => {
    render(<ContextMenu {...baseProps} contextMenu={folderMenu()} />);
    expect(screen.getByText("context.show_in_folder")).toBeInTheDocument();
    expect(screen.getByText("context.expand_all")).toBeInTheDocument();
    expect(screen.getByText("context.hide_folder")).toBeInTheDocument();
    expect(screen.getByText("context.copy_path")).toBeInTheDocument();
  });

  it("folder hide click → invokes toggle_hide_folder + calls onRefresh", async () => {
    render(<ContextMenu {...baseProps} contextMenu={folderMenu()} />);
    fireEvent.click(screen.getByText("context.hide_folder"));
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("toggle_hide_folder", { path: "c:/scripts/subfolder" });
    });
    expect(onClose).toHaveBeenCalled();
    expect(onRefresh).toHaveBeenCalled();
  });

  // ─── backdrop & positioning ───────────────────────────────────

  it("backdrop click → calls onClose", () => {
    const { container } = render(<ContextMenu {...baseProps} contextMenu={scriptMenu()} />);
    const backdrop = container.querySelector(".fixed.inset-0")!;
    fireEvent.mouseDown(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it("menu positioned within viewport bounds", () => {
    const farMenu = { x: 9999, y: 9999, type: "script" as const, data: scriptData };
    const { container } = render(<ContextMenu {...baseProps} contextMenu={farMenu} />);
    const menu = container.querySelector("[class*='min-w-']") as HTMLElement;
    const left = parseInt(menu.style.left);
    const top = parseInt(menu.style.top);
    expect(left).toBeLessThanOrEqual(window.innerWidth);
    expect(top).toBeLessThanOrEqual(window.innerHeight);
  });
});
