import { describe, it, expect, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import {
  getScripts,
  runScript,
  killScript,
  toggleHideFolder,
  readScriptContent,
  checkEverythingStatus,
  launchEverything,
  installEverything,
} from "./api";

const mockedInvoke = vi.mocked(invoke);

beforeEach(() => {
  mockedInvoke.mockReset();
});

describe("getScripts", () => {
  it("calls invoke with 'get_scripts' and forceScan arg", async () => {
    mockedInvoke.mockResolvedValue([]);
    await getScripts();
    expect(mockedInvoke).toHaveBeenCalledWith("get_scripts", { forceScan: false });
  });

  it("defaults forceScan to false", async () => {
    mockedInvoke.mockResolvedValue([]);
    await getScripts();
    expect(mockedInvoke).toHaveBeenCalledWith("get_scripts", { forceScan: false });
  });

  it("passes forceScan: true when requested", async () => {
    mockedInvoke.mockResolvedValue([]);
    await getScripts(true);
    expect(mockedInvoke).toHaveBeenCalledWith("get_scripts", { forceScan: true });
  });

  it("returns the script list from invoke", async () => {
    const scripts = [
      {
        id: "1",
        path: "c:/test.ahk",
        filename: "test.ahk",
        parent: "c:/",
        tags: ["tag1"],
        is_hidden: false,
        is_running: true,
        has_ui: false,
        size: 100,
      },
    ];
    mockedInvoke.mockResolvedValue(scripts);
    const result = await getScripts();
    expect(result).toEqual(scripts);
  });

  it("propagates invoke errors", async () => {
    mockedInvoke.mockRejectedValue(new Error("IPC failure"));
    await expect(getScripts()).rejects.toThrow("IPC failure");
  });
});

describe("runScript", () => {
  it("calls invoke with correct command and path", async () => {
    mockedInvoke.mockResolvedValue(undefined);
    await runScript("c:/scripts/my.ahk");
    expect(mockedInvoke).toHaveBeenCalledWith("run_script", { path: "c:/scripts/my.ahk" });
  });

  it("propagates errors", async () => {
    mockedInvoke.mockRejectedValue(new Error("not found"));
    await expect(runScript("bad")).rejects.toThrow("not found");
  });
});

describe("killScript", () => {
  it("calls invoke with correct command and path", async () => {
    mockedInvoke.mockResolvedValue(undefined);
    await killScript("c:/scripts/running.ahk");
    expect(mockedInvoke).toHaveBeenCalledWith("kill_script", { path: "c:/scripts/running.ahk" });
  });

  it("propagates errors", async () => {
    mockedInvoke.mockRejectedValue(new Error("kill failed"));
    await expect(killScript("x")).rejects.toThrow("kill failed");
  });
});

describe("toggleHideFolder", () => {
  it("calls invoke with correct command and path", async () => {
    mockedInvoke.mockResolvedValue(undefined);
    await toggleHideFolder("c:/scripts/folder");
    expect(mockedInvoke).toHaveBeenCalledWith("toggle_hide_folder", { path: "c:/scripts/folder" });
  });

  it("propagates errors", async () => {
    mockedInvoke.mockRejectedValue(new Error("toggle failed"));
    await expect(toggleHideFolder("x")).rejects.toThrow("toggle failed");
  });
});

describe("readScriptContent", () => {
  it("calls invoke and returns content string", async () => {
    mockedInvoke.mockResolvedValue("MsgBox Hello");
    const result = await readScriptContent("c:/test.ahk");
    expect(mockedInvoke).toHaveBeenCalledWith("read_script_content", { path: "c:/test.ahk" });
    expect(result).toBe("MsgBox Hello");
  });

  it("propagates errors", async () => {
    mockedInvoke.mockRejectedValue(new Error("read failed"));
    await expect(readScriptContent("x")).rejects.toThrow("read failed");
  });
});

describe("checkEverythingStatus", () => {
  it("calls invoke with no extra args and returns status", async () => {
    mockedInvoke.mockResolvedValue("running");
    const result = await checkEverythingStatus();
    expect(mockedInvoke).toHaveBeenCalledWith("check_everything_status");
    expect(result).toBe("running");
  });

  it("returns 'not_installed' status", async () => {
    mockedInvoke.mockResolvedValue("not_installed");
    const result = await checkEverythingStatus();
    expect(result).toBe("not_installed");
  });

  it("propagates errors", async () => {
    mockedInvoke.mockRejectedValue(new Error("check failed"));
    await expect(checkEverythingStatus()).rejects.toThrow("check failed");
  });
});

describe("launchEverything", () => {
  it("calls invoke with correct command", async () => {
    mockedInvoke.mockResolvedValue(undefined);
    await launchEverything();
    expect(mockedInvoke).toHaveBeenCalledWith("launch_everything");
  });

  it("propagates errors", async () => {
    mockedInvoke.mockRejectedValue(new Error("launch failed"));
    await expect(launchEverything()).rejects.toThrow("launch failed");
  });
});

describe("installEverything", () => {
  it("calls invoke with correct command", async () => {
    mockedInvoke.mockResolvedValue(undefined);
    await installEverything();
    expect(mockedInvoke).toHaveBeenCalledWith("install_everything");
  });

  it("propagates errors", async () => {
    mockedInvoke.mockRejectedValue(new Error("install failed"));
    await expect(installEverything()).rejects.toThrow("install failed");
  });
});
