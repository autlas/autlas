// Shim for @tauri-apps/api/webviewWindow — no-op in the browser.

export class WebviewWindow {
  label = "main";
  async listen<T = unknown>(_event: string, _cb: (ev: { payload: T }) => void): Promise<() => void> { return () => {}; }
  async setSize(_size: unknown): Promise<void> {}
  async show(): Promise<void> {}
  async hide(): Promise<void> {}
  async close(): Promise<void> {}
  async setFocus(): Promise<void> {}
  async setAlwaysOnTop(_flag: boolean): Promise<void> {}
  async onFocusChanged(_cb: (ev: { payload: boolean }) => void): Promise<() => void> { return () => {}; }
  static getByLabel(_label: string): WebviewWindow | null { return browserWin; }
}

const browserWin = new WebviewWindow();

export function getCurrentWebviewWindow(): WebviewWindow {
  return browserWin;
}
