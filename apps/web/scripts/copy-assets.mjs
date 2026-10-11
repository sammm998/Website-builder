// Copies the motion runtime and the self-hosted font files into public/ so the app can serve them
// (with CORS) to previews and published sites.
import { cpSync, mkdirSync, rmSync, existsSync, copyFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const { runtimeDir: getRuntimeDir } = await import("@redesign/motion-runtime");
const runtimeDir = getRuntimeDir();
if (!existsSync(join(runtimeDir, "manifest.json"))) {
  execSync("pnpm --filter @redesign/motion-runtime build", { stdio: "inherit" });
}
rmSync("public/runtime", { recursive: true, force: true });
mkdirSync("public/runtime/v1", { recursive: true });
cpSync(runtimeDir, "public/runtime/v1", { recursive: true });

const { allFontSources } = await import("@redesign/fonts/node");
mkdirSync("public/fonts", { recursive: true });
let count = 0;
for (const [file, source] of allFontSources()) {
  copyFileSync(source, join("public/fonts", file));
  count++;
}
console.log(`copied runtime + ${count} font files`);
