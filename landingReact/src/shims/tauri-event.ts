// Minimal shim for @tauri-apps/api/event — backed by DOM CustomEvent.

export type UnlistenFn = () => void;
export interface Event<T> {
  event: string;
  id: number;
  payload: T;
  windowLabel?: string;
}
export type EventCallback<T> = (ev: Event<T>) => void;

const bus: EventTarget = new EventTarget();
let nextId = 1;

export async function listen<T>(name: string, cb: EventCallback<T>): Promise<UnlistenFn> {
  const handler = (e: globalThis.Event) => {
    const detail = (e as CustomEvent<T>).detail;
    cb({ event: name, id: nextId++, payload: detail });
  };
  bus.addEventListener(name, handler);
  return () => bus.removeEventListener(name, handler);
}

export async function once<T>(name: string, cb: EventCallback<T>): Promise<UnlistenFn> {
  const unlisten = await listen<T>(name, (ev) => {
    cb(ev);
    unlisten();
  });
  return unlisten;
}

export async function emit<T>(name: string, payload?: T): Promise<void> {
  bus.dispatchEvent(new CustomEvent(name, { detail: payload }));
}

// Internal: used by the invoke shim to push mock events.
export function __mockEmit<T>(name: string, payload: T): void {
  bus.dispatchEvent(new CustomEvent(name, { detail: payload }));
}
