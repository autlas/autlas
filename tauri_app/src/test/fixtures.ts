import type { Script } from "../api";

export function makeScript(overrides: Partial<Script> = {}): Script {
  return {
    id: overrides.id ?? "uuid-" + Math.random().toString(36).slice(2, 8),
    path: overrides.path ?? "c:/scripts/test.ahk",
    filename: overrides.filename ?? "test.ahk",
    parent: overrides.parent ?? "scripts",
    tags: overrides.tags ?? [],
    is_hidden: overrides.is_hidden ?? false,
    is_running: overrides.is_running ?? false,
    has_ui: overrides.has_ui ?? false,
    size: overrides.size ?? 1024,
    is_hub: overrides.is_hub ?? false,
    created_at: overrides.created_at ?? "",
    modified_at: overrides.modified_at ?? "",
    last_run: overrides.last_run ?? "",
  };
}

export const SCRIPTS = {
  basic: makeScript({ id: "id-1", path: "c:/scripts/hello.ahk", filename: "hello.ahk" }),
  withTags: makeScript({ id: "id-2", path: "c:/scripts/util.ahk", filename: "util.ahk", tags: ["utility", "daily"] }),
  running: makeScript({ id: "id-3", path: "c:/scripts/daemon.ahk", filename: "daemon.ahk", is_running: true, has_ui: true }),
  hidden: makeScript({ id: "id-4", path: "c:/scripts/secret.ahk", filename: "secret.ahk", is_hidden: true }),
  hub: makeScript({ id: "id-5", path: "c:/scripts/fav.ahk", filename: "fav.ahk", tags: ["hub", "gaming"], is_hub: true }),
  noTags: makeScript({ id: "id-6", path: "c:/work/task.ahk", filename: "task.ahk", tags: [] }),
  deep: makeScript({ id: "id-7", path: "c:/scripts/sub/deep/nested.ahk", filename: "nested.ahk", tags: ["nested"] }),
  big: makeScript({ id: "id-8", path: "c:/scripts/big.ahk", filename: "big.ahk", size: 50000 }),
  small: makeScript({ id: "id-9", path: "c:/scripts/small.ahk", filename: "small.ahk", size: 100 }),
};

export const ALL_SCRIPTS = Object.values(SCRIPTS);
