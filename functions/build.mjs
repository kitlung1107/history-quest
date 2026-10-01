import { build } from "esbuild";
await build({
  absWorkingDir: import.meta.dirname,
  entryPoints: ["src/index.ts"],
  outfile: "lib/index.js",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  packages: "external",
});
