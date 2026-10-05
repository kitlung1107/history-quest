import { defineConfig } from "vitest/config";
import path from "node:path";
import { cardDrawVersionPlugin } from "./scripts/card-draw-version-plugin.mjs";
export default defineConfig({
  plugins: [cardDrawVersionPlugin(import.meta.dirname)],
  resolve: { alias: { "@": path.resolve("client/src") } },
  cacheDir: path.resolve("tmp/vitest-draw-reminders"),
  test: { include: ["client/src/lib/drawAvailability.test.ts"], pool: "forks", poolOptions: { forks: { singleFork: true } } },
});
