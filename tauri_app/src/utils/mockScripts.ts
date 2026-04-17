import type { Script } from "../api";

const TAGS = ["game", "utility", "automation", "macro", "hotkey", "dev", "work", "personal", "test", "legacy", "experimental", "daily", "backup"];
const FOLDERS = ["scripts", "autohotkey", "macros", "tools", "gaming", "work", "personal", "dev", "automation", "legacy"];
const SUBFOLDERS = ["v1", "v2", "old", "new", "backup", "temp", "archive", "utils", "core", "plugins", "modules", "lib", "src", "config"];
const NAMES = ["clicker", "typer", "mapper", "toggler", "launcher", "helper", "fixer", "watcher", "runner", "builder", "parser", "sender", "logger", "timer", "counter", "switcher", "mover", "resizer", "hider", "finder"];
const PREFIXES = ["auto", "quick", "smart", "super", "mini", "mega", "ultra", "turbo", "fast", "easy"];

export function generateMockScripts(count: number): Script[] {
  const scripts: Script[] = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const folder = FOLDERS[i % FOLDERS.length];
    const depth = (i % 4); // 0-3 levels deep
    const pathParts = ["C:", folder];
    for (let d = 0; d < depth; d++) {
      pathParts.push(SUBFOLDERS[(i + d * 7) % SUBFOLDERS.length]);
    }
    const prefix = PREFIXES[i % PREFIXES.length];
    const name = NAMES[(i * 3 + 7) % NAMES.length];
    const filename = `${prefix}_${name}_${i}.ahk`;
    pathParts.push(filename);
    const path = pathParts.join("/");

    const tagCount = i % 5 === 0 ? 0 : (i % 3) + 1;
    const tags: string[] = [];
    for (let t = 0; t < tagCount; t++) {
      const tag = TAGS[(i + t * 5) % TAGS.length];
      if (!tags.includes(tag)) tags.push(tag);
    }

    const created = new Date(now - (count - i) * 86400000).toISOString();
    const modified = new Date(now - (count - i) * 43200000).toISOString();

    scripts.push({
      id: `mock-${i}`,
      path,
      filename,
      parent: pathParts[pathParts.length - 2],
      tags,
      is_hidden: i % 50 === 0,
      is_running: i % 20 === 0,
      has_ui: i % 40 === 0,
      size: 100 + (i * 137) % 50000,
      created_at: created,
      modified_at: modified,
      last_run: i % 5 === 0 ? modified : "",
      is_hub: i % 15 === 0,
    });
  }
  return scripts;
}
