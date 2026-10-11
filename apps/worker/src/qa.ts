import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import type { Browser } from "playwright";
import { normalizeText, sectionTexts, type SourcePage } from "@redesign/schema";
import type { Env } from "./env";
import { loadAllImages, loadHtml, renderContext } from "./render";

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

export interface QaChecks {
  overflowDesktop: number;
  overflowMobile: number;
  missingText: string[];
  brokenImages: number;
  consoleErrors: string[];
  axe: { id: string; impact: string | null; count: number }[];
  lcpMs: number | null;
  cls: number | null;
  overlappingText: number;
}

export interface QaResult {
  checks: QaChecks;
  problems: string[];
  desktop: Buffer;
  mobile: Buffer;
}

/** Deterministic checks on a rendered page + full-page screenshots for the visual critique. */
export async function runQa(browser: Browser, env: Env, html: string, source: SourcePage | null): Promise<QaResult> {
  const consoleErrors: string[] = [];
  const desktopCtx = await renderContext(browser, env, { width: 1440, height: 900, reducedMotion: true });
  const mobileCtx = await renderContext(browser, env, { width: 390, height: 844, reducedMotion: true });
  const motionCtx = await renderContext(browser, env, { width: 1440, height: 900, reducedMotion: false });
  try {
    // Web vitals with motion enabled (what visitors get).
    const vitalsPage = await motionCtx.newPage();
    vitalsPage.on("pageerror", (e) => consoleErrors.push(e.message));
    await vitalsPage.addInitScript(() => {
      const w = window as unknown as { __lcp: number | null; __cls: number };
      w.__lcp = null;
      w.__cls = 0;
      new PerformanceObserver((list) => {
        const last = list.getEntries().at(-1);
        if (last) w.__lcp = last.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) if (!e.hadRecentInput) w.__cls += e.value;
      }).observe({ type: "layout-shift", buffered: true });
    });
    await loadHtml(vitalsPage, html);
    await vitalsPage.waitForTimeout(2500);
    const vitals = await vitalsPage.evaluate(() => {
      const w = window as unknown as { __lcp: number | null; __cls: number };
      return { lcp: w.__lcp, cls: w.__cls };
    });

    const desktop = await desktopCtx.newPage();
    desktop.on("pageerror", (e) => consoleErrors.push(e.message));
    desktop.on("console", (m) => m.type() === "error" && !/WebGL|GPU|favicon/i.test(m.text()) && consoleErrors.push(m.text()));
    await loadHtml(desktop, html);
    await loadAllImages(desktop);
    const overflowDesktop = await desktop.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const pageText = normalizeText(await desktop.evaluate(() => document.body.textContent ?? ""));
    const expected = source ? [source.hero, ...source.sections].flatMap(sectionTexts).map(normalizeText) : [];
    const missingText = expected.filter((t) => t && !pageText.includes(t));
    const brokenImages = await desktop.$$eval("img", (imgs) => imgs.filter((i) => i.complete && i.naturalWidth === 0).length);
    const overlappingText = await desktop.evaluate(() => {
      // Counts visible headings/paragraphs whose boxes intersect another text block (layout collisions).
      const els = [...document.querySelectorAll("h1,h2,h3,p,li,blockquote")].filter((e) => {
        const r = e.getBoundingClientRect();
        const s = getComputedStyle(e);
        return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && Number(s.opacity) > 0.1;
      });
      const boxes = els.map((e) => ({ e, r: e.getBoundingClientRect() }));
      let hits = 0;
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i]!, b = boxes[j]!;
          if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
          const x = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
          const y = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
          if (x > 8 && y > 8) hits++;
        }
      }
      return hits;
    });
    await desktop.addScriptTag({ content: AXE });
    const axe = await desktop.evaluate(async () => {
      const w = window as unknown as { axe: { run: (ctx: Document, opts: unknown) => Promise<{ violations: { id: string; impact: string | null; nodes: unknown[] }[] }> } };
      const r = await w.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] }, resultTypes: ["violations"] });
      return r.violations.map((v) => ({ id: v.id, impact: v.impact, count: v.nodes.length }));
    });
    const height = await desktop.evaluate(() => document.documentElement.scrollHeight);
    const desktopShot = await desktop.screenshot({ type: "jpeg", quality: 70, fullPage: height <= 9000, clip: height > 9000 ? { x: 0, y: 0, width: 1440, height: 9000 } : undefined });

    const mobile = await mobileCtx.newPage();
    await loadHtml(mobile, html);
    await loadAllImages(mobile);
    const overflowMobile = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const mHeight = await mobile.evaluate(() => document.documentElement.scrollHeight);
    const mobileShot = await mobile.screenshot({ type: "jpeg", quality: 70, fullPage: mHeight <= 12000, clip: mHeight > 12000 ? { x: 0, y: 0, width: 390, height: 12000 } : undefined });

    const checks: QaChecks = { overflowDesktop, overflowMobile, missingText, brokenImages, consoleErrors, axe, lcpMs: vitals.lcp, cls: vitals.cls, overlappingText };
    return { checks, problems: problemsFrom(checks), desktop: desktopShot, mobile: mobileShot };
  } finally {
    await Promise.all([desktopCtx.close(), mobileCtx.close(), motionCtx.close()]);
  }
}

export function problemsFrom(c: QaChecks): string[] {
  const out: string[] = [];
  if (c.overflowDesktop > 0) out.push(`Horizontal overflow on desktop (${c.overflowDesktop}px).`);
  if (c.overflowMobile > 0) out.push(`Horizontal overflow on mobile (${c.overflowMobile}px).`);
  if (c.missingText.length) out.push(`Source text missing from the page: ${JSON.stringify(c.missingText.slice(0, 10))}`);
  if (c.brokenImages) out.push(`${c.brokenImages} image(s) failed to load.`);
  if (c.consoleErrors.length) out.push(`Console errors: ${c.consoleErrors.slice(0, 3).join(" | ")}`);
  if (c.overlappingText > 2) out.push(`${c.overlappingText} overlapping text blocks.`);
  for (const v of c.axe.filter((v) => v.impact === "serious" || v.impact === "critical")) out.push(`Accessibility: ${v.id} (${v.count})`);
  if (c.cls !== null && c.cls > 0.1) out.push(`Layout shift CLS ${c.cls.toFixed(3)} > 0.1.`);
  return out;
}

export function qaStatus(checks: QaChecks, score: number | null): "passed" | "warning" | "failed" {
  if (checks.missingText.length || checks.overflowMobile > 4 || checks.brokenImages) return "failed";
  if (problemsFrom(checks).length || (score !== null && score < 7)) return "warning";
  return "passed";
}
