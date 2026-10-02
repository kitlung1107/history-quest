import { createServer } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const fixtures = args.includes("--fixtures");
const scenario = args.find(arg => arg.startsWith("--scenario="))?.split("=")[1] || "shared";
const port = Number(args.find(arg => arg.startsWith("--port="))?.split("=")[1] || 4186);
if (!["shared", "none", "blank", "stale", "broken"].includes(scenario)) {
  throw new Error(`Unknown local fixture scenario: ${scenario}`);
}

/** Serve-only review data. The CMS files and production build remain untouched. */
const reviewFixtures = {
  name: "local-card-background-review-fixtures",
  apply: "serve",
  enforce: "pre",
  transform(source, id) {
    if (!fixtures) return null;
    const filename = id.split("?")[0].replaceAll("\\", "/");
    if (filename.endsWith("/content/settings/backgrounds.json")) {
      return JSON.stringify({ backgrounds: scenario === "none" ? [] : [
        { id: "review-voyages", name: "本機示例：航海與交流", image: "/history-quest/uploads/home-voyages-exchange-v2.webp" },
        { id: "review-history", name: "本機示例：歷史探索", image: scenario === "broken" ? "/history-quest/uploads/review-deliberately-missing.webp" : "/history-quest/uploads/home-history-hero.webp" },
      ] });
    }
    if (filename.endsWith("/content/settings/cards.json")) {
      const catalogue = JSON.parse(source);
      catalogue.cards = catalogue.cards.map(card => {
        const copy = { ...card };
        if (scenario === "none") delete copy.backgroundId;
        else if (scenario === "blank") copy.backgroundId = "";
        else if (scenario === "stale") copy.backgroundId = "review-removed-background";
        else copy.backgroundId = card.id.startsWith("nile-") ? "review-history" : "review-voyages";
        return copy;
      });
      return JSON.stringify(catalogue);
    }
    return null;
  },
};

const server = await createServer({
  configFile: path.join(projectRoot, "vite.config.ts"),
  configLoader: "runner",
  cacheDir: path.join(projectRoot, "tmp", "vite-card-background-cache"),
  plugins: [reviewFixtures],
  server: { host: "127.0.0.1", port, strictPort: true },
});
await server.listen();
console.log(`Local review: http://127.0.0.1:${port}/__role-preview`);
console.log(fixtures ? `LOCAL FIXTURES ONLY (${scenario}): existing approved images; no CMS data is written.` : "Using persisted catalogue data; no fixtures injected.");
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => { await server.close(); process.exit(0); });
}
