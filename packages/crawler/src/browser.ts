import { readFileSync } from "node:fs";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { assertPublicUrl, BlockedUrlError, safeFetch, USER_AGENT, type GuardOptions } from "./ssrf";

const EXTRACT_SCRIPT = readFileSync(new URL("./extract-dom.browser.js", import.meta.url), "utf8");

export interface BrowserOptions extends GuardOptions {
  executablePath?: string;
  headless?: boolean;
}

export async function launchBrowser(opts: BrowserOptions = {}): Promise<Browser> {
  return chromium.launch({
    headless: opts.headless ?? true,
    executablePath: opts.executablePath ?? process.env["CHROMIUM_PATH"] ?? undefined,
    args: ["--disable-dev-shm-usage", "--no-first-run", "--disable-background-networking", "--disable-sync", "--mute-audio"],
  });
}

/**
 * A browser context where *every* request is fetched by Node through the SSRF guard and fulfilled
 * back into the page. Service workers and WebSockets are blocked, downloads are disabled.
 */
export async function guardedContext(browser: Browser, opts: GuardOptions & { viewport?: { width: number; height: number }; reducedMotion?: boolean } = {}): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport: opts.viewport ?? { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    userAgent: `${USER_AGENT} Chrome/140`,
    serviceWorkers: "block",
    acceptDownloads: false,
    javaScriptEnabled: true,
    reducedMotion: opts.reducedMotion ? "reduce" : "no-preference",
    locale: "sv-SE",
  });
  const hostCache = new Map<string, Promise<boolean>>();
  const allowed = (url: string) => {
    const host = new URL(url).host;
    let p = hostCache.get(host);
    if (!p) {
      p = assertPublicUrl(url, opts).then(
        () => true,
        () => false,
      );
      hostCache.set(host, p);
    }
    return p;
  };
  await context.route("**/*", async (route) => {
    const req = route.request();
    const url = req.url();
    if (url.startsWith("data:") || url.startsWith("blob:")) return route.continue();
    const type = req.resourceType();
    if (type === "media" || type === "websocket" || type === "eventsource" || type === "manifest") return route.abort();
    if (!/^https?:/.test(url) || !(await allowed(url))) return route.abort("blockedbyclient");
    if (req.method() !== "GET") return route.abort(); // crawler never submits forms or posts data
    try {
      const res = await safeFetch(url, {
        ...opts,
        maxBytes: type === "document" ? 8_000_000 : 15_000_000,
        timeoutMs: 20_000,
        headers: { accept: req.headers()["accept"] ?? "*/*", "accept-language": "sv-SE,sv;q=0.9,en;q=0.8" },
      });
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        if (!["content-encoding", "content-length", "transfer-encoding", "set-cookie", "content-security-policy"].includes(k)) headers[k] = v;
      });
      await route.fulfill({ status: res.status, headers, body: res.body });
    } catch (error) {
      await route.abort(error instanceof BlockedUrlError ? "blockedbyclient" : "failed");
    }
  });
  await context.routeWebSocket(/.*/, (ws) => ws.close());
  return context;
}

/** Scrolls through the page to trigger lazy loading and scroll-driven reveals, then returns to top. */
export async function primePage(page: Page) {
  await page.evaluate(async () => {
    const step = Math.round(window.innerHeight * 0.8);
    const max = Math.min(document.documentElement.scrollHeight, 30000);
    for (let y = 0; y < max; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 300));
  });
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
}

export async function openPage(context: BrowserContext, url: string): Promise<{ page: Page; status: number; finalUrl: string }> {
  const page = await context.newPage();
  page.on("dialog", (d) => d.dismiss().catch(() => {}));
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForLoadState("load", { timeout: 15_000 }).catch(() => {});
  await primePage(page);
  // Dismiss common cookie banners so they don't cover screenshots.
  await page
    .evaluate(() => {
      for (const el of document.querySelectorAll<HTMLElement>("[id*=cookie i],[class*=cookie i],[id*=consent i],[class*=consent i],#onetrust-banner-sdk,#CybotCookiebotDialog,#usercentrics-root")) {
        const style = getComputedStyle(el);
        if (style.position === "fixed" || style.position === "sticky") el.remove();
      }
    })
    .catch(() => {});
  return { page, status: response?.status() ?? 0, finalUrl: page.url() };
}

export type RawExtraction = Record<string, unknown> & { logoSelector?: string; links?: string[] };

export async function extractRaw(page: Page): Promise<RawExtraction> {
  return (await page.evaluate(EXTRACT_SCRIPT)) as RawExtraction;
}

export async function fullPageScreenshot(page: Page, maxHeight = 12000): Promise<Buffer> {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  if (height <= maxHeight) return page.screenshot({ fullPage: true, type: "jpeg", quality: 72 });
  const width = page.viewportSize()?.width ?? 1440;
  return page.screenshot({ type: "jpeg", quality: 72, fullPage: true, clip: { x: 0, y: 0, width, height: maxHeight } });
}
