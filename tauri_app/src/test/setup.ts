import { afterEach, vi } from "vitest";
import { randomFillSync } from "node:crypto";

// Polyfill localStorage for node environment (jsdom has ESM compat issues)
if (typeof globalThis.localStorage === "undefined") {
  const _storage = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => _storage.get(key) ?? null,
    setItem: (key: string, value: string) => _storage.set(key, String(value)),
    removeItem: (key: string) => _storage.delete(key),
    clear: () => _storage.clear(),
    get length() { return _storage.size; },
    key: (i: number) => [..._storage.keys()][i] ?? null,
  };
}

// Conditional imports for jsdom-only deps
const hasDOM = typeof window !== "undefined" && typeof document !== "undefined";
if (hasDOM) {
  const { cleanup } = await import("@testing-library/react");
  await import("@testing-library/jest-dom/vitest");
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });
} else {
  afterEach(() => {
    localStorage.clear();
  });
}

// WebCrypto polyfill (required for Tauri IPC mocking in jsdom)
Object.defineProperty(globalThis, "crypto", {
  value: {
    getRandomValues: (buffer: NodeJS.ArrayBufferView) => randomFillSync(buffer),
  },
});

// ResizeObserver mock
globalThis.ResizeObserver = class {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
} as any;

// window.matchMedia mock (skip in non-jsdom environments)
if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// scrollIntoView mock (jsdom doesn't implement it)
if (typeof Element !== "undefined") {
  Element.prototype.scrollIntoView = vi.fn();
}

// Mock react-i18next — return keys as-is for stable assertions
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
    i18n: { changeLanguage: () => Promise.resolve(), language: "en" },
  }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

// Mock Tauri APIs
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => {
  const listeners = new Map<string, Set<Function>>();

  return {
    listen: vi.fn((event: string, handler: Function) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler);
      return Promise.resolve(() => {
        listeners.get(event)?.delete(handler);
      });
    }),
    emit: vi.fn((event: string, payload: unknown) => {
      listeners.get(event)?.forEach((fn) => fn({ event, payload }));
      return Promise.resolve();
    }),
    __listeners: listeners,
    __emit: (event: string, payload: unknown) => {
      listeners.get(event)?.forEach((fn) => fn({ event, payload }));
    },
    __clear: () => listeners.clear(),
    __count: (event: string) => listeners.get(event)?.size ?? 0,
  };
});

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}));
