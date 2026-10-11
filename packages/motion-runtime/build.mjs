// Builds the runtime into dist/: boot.js (sync, tiny), motion.js (ESM, deferred) + lazy webgl chunk.
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, copyFileSync } from "node:fs";

const out = new URL("./dist/", import.meta.url).pathname;
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await build({
  entryPoints: { motion: "src/index.ts" },
  outdir: out,
  bundle: true,
  format: "esm",
  splitting: true,
  minify: true,
  target: ["es2020", "safari15"],
  chunkNames: "chunks/[name]-[hash]",
  legalComments: "none",
  logLevel: "warning",
});
await build({
  entryPoints: { boot: "src/boot.ts" },
  outdir: out,
  bundle: true,
  format: "iife",
  minify: true,
  target: ["es2018"],
  logLevel: "warning",
});
copyFileSync("src/runtime.css", `${out}/runtime.css`);

const sri = (file) => `sha384-${createHash("sha384").update(readFileSync(file)).digest("base64")}`;
const chunks = readdirSync(`${out}/chunks`).map((f) => `chunks/${f}`);
const manifest = {
  version: JSON.parse(readFileSync("package.json", "utf8")).version,
  files: {
    "boot.js": { integrity: sri(`${out}/boot.js`), bytes: readFileSync(`${out}/boot.js`).length },
    "motion.js": { integrity: sri(`${out}/motion.js`), bytes: readFileSync(`${out}/motion.js`).length },
    ...Object.fromEntries(chunks.map((c) => [c, { integrity: sri(`${out}/${c}`), bytes: readFileSync(`${out}/${c}`).length }])),
  },
};
writeFileSync(`${out}/manifest.json`, JSON.stringify(manifest, null, 2));
console.log(Object.entries(manifest.files).map(([f, m]) => `${f}: ${(m.bytes / 1024).toFixed(1)} KB`).join("\n"));
