import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { cardDrawVersionPlugin } from "./scripts/card-draw-version-plugin.mjs";
import { assessmentContentPlugin } from "./integration/assessment/public-content-plugin.mjs";
// Minimal local preview/build config for this machine's incomplete optional
// @builder.io dependency. Application source and production gating are identical.
export default defineConfig({
  root: path.resolve(import.meta.dirname, "client"),
  base: process.env.GITHUB_ACTIONS ? "/history-quest/" : "/",
  plugins: [
    cardDrawVersionPlugin(import.meta.dirname),
    assessmentContentPlugin(import.meta.dirname),
    tailwindcss(),
  ],
  esbuild: { jsx: "automatic" },
  cacheDir: path.resolve(import.meta.dirname, "tmp/vite-draw-cache"),
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client/src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    host: "127.0.0.1",
    port: 4340,
    strictPort: true,
    fs: {
      strict: true,
      deny: [
        "**/.*",
        "**/private-assessments/**",
        "**/integration/**",
        "**/tmp/**",
      ],
    },
  },
});
