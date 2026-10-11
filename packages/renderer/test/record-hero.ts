// Records the landing-page hero reel from real renderer output (three design systems over the fixture
// content). Usage: pnpm --filter @redesign/renderer exec tsx test/record-hero.ts <outDir>
import { mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { sampleDirection } from "@redesign/fixtures";
import type { DesignSystem } from "@redesign/schema";
import { buildSiteCss, renderPage } from "../src";
import { context, homePage, startSiteServer } from "./site";

const out = process.argv[2] ?? "hero-reel";
mkdirSync(out, { recursive: true });

const variants: DesignSystem[] = [
  sampleDirection.designSystem,
  { ...sampleDirection.designSystem, name: "Ljus", mode: "light", colors: { bg: "#f4f0e8", surface: "#ffffff", "surface-2": "#e7e1d5", fg: "#141310", muted: "#5b574e", line: "#d6cfc1", accent: "#1f3d2b", "accent-fg": "#f4f0e8", brand: "#0b6e4f" }, typography: { ...sampleDirection.designSystem.typography, display: "instrument-serif", body: "inter", scale: 1.36 }, motion: { ...sampleDirection.designSystem.motion, cursor: "none" } },
  { ...sampleDirection.designSystem, name: "Kinetisk", mode: "light", colors: { bg: "#ffffff", surface: "#f1f1f1", "surface-2": "#e4e4e4", fg: "#0a0a0a", muted: "#555555", line: "#dddddd", accent: "#ff4d00", "accent-fg": "#0a0a0a", brand: "#ff4d00" }, typography: { ...sampleDirection.designSystem.typography, display: "big-shoulders-display", body: "space-grotesk", displayWeight: 800, displayCase: "uppercase", scale: 1.5 }, shape: { radius: "none", borderWidth: 2 }, motion: { ...sampleDirection.designSystem.motion, cursor: "none" } },
];

let html = "";
const server = await startSiteServer(() => html);
const browser = await chromium.launch({ executablePath: process.env["CHROMIUM_PATH"] ?? "/opt/pw-browsers/chromium", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const clips: string[] = [];
for (const [i, ds] of variants.entries()) {
  const ctx = context(server.origin, { designSystem: ds });
  const page = homePage();
  const css = await buildSiteCss(ds, [page.header, page.footer, ...page.sections.map((s) => s.html)], server.origin);
  html = renderPage(page, ctx, css).html;
  const dir = join(out, `raw-${i}`);
  rmSync(dir, { recursive: true, force: true });
  const bctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir, size: { width: 1280, height: 720 } } });
  const p = await bctx.newPage();
  await p.goto(server.origin);
  await p.waitForTimeout(2200);
  for (let y = 0; y < 26; y++) {
    await p.mouse.wheel(0, 70);
    await p.waitForTimeout(90);
  }
  await p.waitForTimeout(600);
  await bctx.close();
  const file = readdirSync(dir).find((f) => f.endsWith(".webm"))!;
  const clip = join(out, `clip-${i}.webm`);
  renameSync(join(dir, file), clip);
  rmSync(dir, { recursive: true, force: true });
  clips.push(clip);
}
await browser.close();
await server.close();

// Trim the blank first frames, crossfade-free concat, encode MP4 + WebM + poster.
const list = join(out, "list.txt");
const trimmed = clips.map((c, i) => {
  const t = join(out, `t-${i}.mp4`);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", "0.8", "-i", c, "-t", "4.6", "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-crf", "18", "-an", t]);
  return t;
});
execFileSync("sh", ["-c", `printf "${trimmed.map((t) => `file '${t.split("/").pop()}'\\n`).join("")}" > ${list}`]);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-c:v", "libx264", "-preset", "slow", "-crf", "27", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", join(out, "hero.mp4")]);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", join(out, "hero.mp4"), "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "40", "-row-mt", "1", "-an", join(out, "hero.webm")]);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", "1.5", "-i", join(out, "hero.mp4"), "-frames:v", "1", "-q:v", "4", join(out, "hero-poster.jpg")]);
for (const f of [...clips, ...trimmed, list]) rmSync(f, { force: true });
console.log("done", out);
