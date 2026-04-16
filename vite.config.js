import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => ({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    // esbuild minifier is ~20-40x faster than terser with near-identical output.
    minify: "esbuild",
    target: "es2020",
    cssMinify: true,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Split vendor code (node_modules) into its own chunk so the webview
        // can parse the main app chunk earlier on startup. The virtualizer +
        // React together are ~160kb; isolating them means code edits don't
        // invalidate that chunk on rebuild.
        manualChunks(id) {
          if (id.includes("node_modules")) return "vendor";
        },
      },
    },
  },
  esbuild: {
    // Strip console/debugger only in production — keep them in dev for debugging.
    drop: command === "build" ? ["console", "debugger"] : [],
  },
}));
