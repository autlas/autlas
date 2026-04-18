// Landing demo: replace window.localStorage with an in-memory Storage
// so nothing the user touches in the embedded autlas persists across
// page reloads. Reads return null for unset keys → all call sites fall
// back to their defaults on first load. Imported at the TOP of main.tsx
// before anything else so it runs before every other module init.

const mem = new Map<string, string>();
const fake: Storage = {
  get length() { return mem.size; },
  clear: () => { mem.clear(); },
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  key: (i: number) => Array.from(mem.keys())[i] ?? null,
  removeItem: (k: string) => { mem.delete(k); },
  setItem: (k: string, v: string) => { mem.set(k, String(v)); },
};

try {
  Object.defineProperty(window, "localStorage", {
    value: fake,
    configurable: true,
    writable: false,
  });
} catch {
  /* Some browsers lock the descriptor; silently ignore. */
}
