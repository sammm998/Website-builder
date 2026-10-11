import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync } from "node:fs";
import { chromium, type Browser } from "playwright";
import { sampleSourcePage, sampleDirection } from "@redesign/fixtures";
import { sectionTexts, normalizeText } from "@redesign/schema";
import { renderHome, startSiteServer } from "./site";

const OUT = process.env["SCREENSHOT_DIR"];
let browser: Browser;
let server: Awaited<ReturnType<typeof startSiteServer>>;
let html = "";

beforeAll(async () => {
  server = await startSiteServer(() => html);
  html = (await renderHome(server.origin)).html;
  browser = await chromium.launch({ executablePath: process.env["CHROMIUM_PATH"] ?? "/opt/pw-browsers/chromium", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  if (OUT) mkdirSync(OUT, { recursive: true });
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
});

describe.each([
  ["desktop", { width: 1440, height: 900 }],
  ["mobile", { width: 390, height: 844 }],
])("rendered site on %s", (name, viewport) => {
  it("loads without errors or horizontal overflow and shows all source text", async () => {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && !/WebGL|GPU stall|swiftshader/i.test(m.text()) && errors.push(m.text()));
    await page.goto(server.origin, { waitUntil: "load" });
    await page.waitForFunction(() => document.documentElement.classList.contains("m-armed"));
    if (OUT) await page.screenshot({ path: `${OUT}/${name}-top.png` });
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < height; y += 500) {
      await page.mouse.wheel(0, 500);
      await page.waitForTimeout(80);
    }
    await page.waitForTimeout(1800);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const text = normalizeText(await page.evaluate(() => document.body.textContent ?? ""));
    const expected = [sampleSourcePage.hero, ...sampleSourcePage.sections].flatMap(sectionTexts).map(normalizeText);
    const missing = expected.filter((t) => !text.includes(t));
    expect(missing).toEqual([]);
    const brokenImages = await page.$$eval("img", (imgs) => imgs.filter((i) => i.complete && i.naturalWidth === 0).length);
    expect(brokenImages).toBe(0);
    if (OUT) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${OUT}/${name}-full.png`, fullPage: true });
    }
    expect(errors).toEqual([]);
    await page.close();
  }, 60_000);
});

it("fixture direction covers every source section exactly once", () => {
  const indices = sampleDirection.sections.map((s) => s.sourceIndex).sort();
  expect(indices).toEqual([-1, 0, 1, 2]);
});
