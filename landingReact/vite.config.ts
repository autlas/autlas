import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "./",
  resolve: {
    alias: {
      "@ahk": path.resolve(__dirname, "../tauri_app/src"),
    },
  },
  server: {
    port: 1421,
    strictPort: true,
  },
});
