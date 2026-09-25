import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig(({ mode }) => ({
  cacheDir: resolve("node_modules", `.vite-${mode}`),
  plugins: [react()],
  root: resolve("apps", mode === "developer" ? "developer" : "pos"),
  base: "./",
  build: {
    outDir: resolve(
      "dist",
      mode === "developer" ? "developer" : "pos",
      "renderer",
    ),
    emptyOutDir: true,
  },
  server: {
    host: "127.0.0.1",
    port: mode === "developer" ? 5174 : 5173,
    strictPort: true,
  },
}));
