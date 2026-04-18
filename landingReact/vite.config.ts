import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

const r = (p: string) => path.resolve(__dirname, p);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "./",
  resolve: {
    alias: [
      { find: "@tauri-apps/api/core", replacement: r("src/shims/tauri-core.ts") },
      { find: "@tauri-apps/api/event", replacement: r("src/shims/tauri-event.ts") },
      { find: "@tauri-apps/api/webviewWindow", replacement: r("src/shims/tauri-webview.ts") },
      { find: "@tauri-apps/api/dpi", replacement: r("src/shims/tauri-dpi.ts") },
      { find: "@tauri-apps/plugin-dialog", replacement: r("src/shims/tauri-dialog.ts") },
    ],
  },
  server: {
    port: 1421,
    strictPort: true,
  },
});
