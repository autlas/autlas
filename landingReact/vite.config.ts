import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

const r = (p: string) => path.resolve(__dirname, p);

// GitHub Pages serves the site from https://eazzzymax.github.io/autlas-landing/,
// so production builds need that as the base URL. In dev we keep '/' so the
// Vite dev server works off the root.
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  base: mode === "production" ? "/autlas-landing/" : "/",
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
}));
