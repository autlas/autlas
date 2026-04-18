// Minimal shim for @tauri-apps/plugin-dialog — no-ops in the browser demo.

export interface OpenDialogOptions {
  title?: string;
  directory?: boolean;
  multiple?: boolean;
  defaultPath?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
}

export async function open(opts?: OpenDialogOptions): Promise<string | string[] | null> {
  const picked = window.prompt(
    `[demo] ${opts?.title ?? "pick a path"}\n${opts?.directory ? "(folder)" : "(file)"}`,
    opts?.defaultPath ?? "D:/ahk",
  );
  if (!picked) return null;
  return opts?.multiple ? [picked] : picked;
}

export async function save(opts?: OpenDialogOptions): Promise<string | null> {
  return (await open(opts)) as string | null;
}

export async function ask(message: string): Promise<boolean> {
  return window.confirm(message);
}

export async function confirm(message: string): Promise<boolean> {
  return window.confirm(message);
}

export async function message(msg: string): Promise<void> {
  window.alert(msg);
}
