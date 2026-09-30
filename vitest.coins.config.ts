import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  resolve: { alias: { "@": path.resolve("client/src") } },
  test: {
    include: ["scripts/coins.integration.test.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
