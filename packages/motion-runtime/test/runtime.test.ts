import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { startDemoServer } from "./server";

let server: Awaited<ReturnType<typeof startDemoServer>>;
let browser: Browser;

beforeAll(async () => {
  server = await startDemoServer();
  browser = await chromium.launch({ executablePath: process.env["CHROMIUM_PATH"] ?? "/opt/pw-browsers/chromium", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
}, 30_000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
});

async function open(options: Parameters<Browser["newPage"]>[0] = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, ...options });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  return { page, errors };
}

async function scrollThrough(page: Page) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 400) {
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(1500);
}

describe("motion runtime", () => {
  it("arms effects, animates them in and keeps text intact", async () => {
    const { page, errors } = await open();
    await page.goto(`${server.origin}/`);
    await page.waitForFunction(() => document.documentElement.classList.contains("m-armed"));
    // Split text keeps the accessible name.
    expect(await page.getAttribute("#title", "aria-label")).toBe("Vi bygger hem som håller");
    expect(await page.locator("#title .m-word").count()).toBe(5);
    // Below-the-fold reveal is hidden before scrolling.
    expect(await page.$eval("#cards h2", (el) => getComputedStyle(el).opacity)).toBe("0");
    await scrollThrough(page);
    expect(await page.$eval("#cards h2", (el) => getComputedStyle(el).opacity)).toBe("1");
    expect(await page.$$eval("#cards .card", (els) => els.map((e) => getComputedStyle(e).opacity))).toEqual(["1", "1", "1"]);
    // Counter restores the exact original text.
    await page.waitForTimeout(2500);
    expect(await page.textContent("#count span")).toBe("1 200");
    // Structural effects.
    expect(await page.$eval("#pin", (el) => el.getBoundingClientRect().height)).toBeGreaterThan(2000);
    expect(await page.locator("#mq .m-marquee-group").count()).toBe(2);
    expect(await page.getAttribute("#mq .m-marquee-group:nth-child(2)", "aria-hidden")).toBe("true");
    expect(await page.locator(".m-progress").count()).toBe(1);
    expect(errors).toEqual([]);
    await page.close();
  }, 60_000);

  it("lazy-loads WebGL scenes near the viewport", async () => {
    const { page, errors } = await open();
    await page.goto(`${server.origin}/`);
    await page.waitForFunction(() => document.querySelector("#hero")?.matches("[data-webgl-ready],[data-webgl-fallback]"), null, { timeout: 15_000 });
    const ready = await page.$eval("#hero", (el) => el.hasAttribute("data-webgl-ready"));
    if (ready) expect(await page.locator("#hero canvas.m-webgl").count()).toBe(1);
    expect(await page.locator("#blob canvas").count()).toBe(0); // not loaded until near viewport
    expect(errors.filter((e) => !/WebGL|GPU|swiftshader/i.test(e))).toEqual([]);
    await page.close();
  }, 30_000);

  it("respects prefers-reduced-motion: nothing hidden, no splitting, no smooth scroll", async () => {
    const { page, errors } = await open({ reducedMotion: "reduce" });
    await page.goto(`${server.origin}/`);
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => document.documentElement.className)).toContain("m-reduced");
    expect(await page.locator(".m-word").count()).toBe(0);
    const hidden = await page.$$eval("[data-motion]", (els) => els.filter((e) => getComputedStyle(e).opacity === "0").length);
    expect(hidden).toBe(0);
    expect(await page.locator("canvas").count()).toBe(0);
    expect(errors).toEqual([]);
    await page.close();
  });

  it("content is visible without JavaScript", async () => {
    const { page } = await open({ javaScriptEnabled: false });
    await page.goto(`${server.origin}/`);
    const hidden = await page.$$eval("[data-motion]", (els) => els.filter((e) => getComputedStyle(e).opacity === "0" || getComputedStyle(e).visibility === "hidden").length);
    expect(hidden).toBe(0);
    await page.close();
  });

  it("fails safe when the runtime cannot load", async () => {
    const { page } = await open();
    await page.route("**/runtime/motion.js", (r) => r.abort());
    await page.goto(`${server.origin}/`);
    await page.waitForTimeout(2800);
    expect(await page.$eval("#title", (el) => getComputedStyle(el).visibility)).toBe("visible");
    expect(await page.$eval("#lead", (el) => getComputedStyle(el).opacity)).toBe("1");
    await page.close();
  });
});
