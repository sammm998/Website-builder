import type { BrowserContext } from "playwright";
import type { MediaRef, SourcePage } from "@redesign/schema";
import { assertPublicUrl, safeFetch, type GuardOptions } from "./ssrf";
import { fetchRobots, fetchSitemapUrls, normalizePageUrl, pathOf, robotsAllows, type RobotsRules } from "./discovery";
import { extractRaw, fullPageScreenshot, openPage } from "./browser";
import { toSourcePage } from "./extract";

export interface CrawlQueueItem {
  url: string;
  depth: number;
}

/** Serializable crawl state; persisted between steps so crawls are resumable. */
export interface CrawlState {
  start: string;
  queue: CrawlQueueItem[];
  seen: string[];
  processed: number;
  limit: number;
  maxDepth: number;
  robots: Pick<RobotsRules, "allow" | "disallow">;
  sitemapCount: number;
}

export interface CrawledPage {
  url: string;
  path: string;
  depth: number;
  status: number;
  source: SourcePage | null;
  screenshot: Buffer | null;
  /** PNG screenshot of an SVG/inline logo, when the logo could not be referenced as a raster file. */
  logoPng: Buffer | null;
  error: string | null;
}

/** Pseudo source URL used for logos captured as element screenshots. */
export const LOGO_SCREENSHOT_PATH = "/__redesign/logo.png";

export async function initCrawl(
  startUrl: string,
  opts: GuardOptions & { limit?: number; maxDepth?: number } = {},
): Promise<CrawlState> {
  // Follow redirects first (dinsajt.se -> https://www.dinsajt.se/sv/) so the crawl uses the site's real origin.
  const start = await assertPublicUrl(await resolveStartUrl(startUrl, opts), opts);
  const normalized = normalizePageUrl(start.href, start) ?? `${start.origin}/`;
  const robots = await fetchRobots(start.origin, opts);
  const sitemapUrls = await fetchSitemapUrls(
    robots.sitemaps.length ? robots.sitemaps : [`${start.origin}/sitemap.xml`, `${start.origin}/sitemap_index.xml`],
    start,
    { ...opts, limit: 500 },
  );
  const limit = Math.min(opts.limit ?? 50, 50);
  const seen = new Set<string>([normalized]);
  const queue: CrawlQueueItem[] = [{ url: normalized, depth: 0 }];
  const fromSitemap = sitemapUrls
    .map((u) => normalizePageUrl(u, start))
    .filter((u): u is string => !!u && !seen.has(u))
    // Shallow paths first: they are usually the main pages of the site.
    .sort((a, b) => pathOf(a).split("/").length - pathOf(b).split("/").length || a.length - b.length);
  for (const url of fromSitemap) {
    if (seen.has(url)) continue;
    seen.add(url);
    queue.push({ url, depth: pathOf(url).split("/").filter(Boolean).length });
  }
  return {
    start: normalized,
    queue,
    seen: [...seen],
    processed: 0,
    limit,
    maxDepth: opts.maxDepth ?? 4,
    robots: { allow: robots.allow, disallow: robots.disallow },
    sitemapCount: sitemapUrls.length,
  };
}

/** Final URL after redirects (each hop SSRF-checked); the input itself when the site refuses plain requests. */
export async function resolveStartUrl(startUrl: string, opts: GuardOptions = {}): Promise<string> {
  try {
    const res = await safeFetch(startUrl, { ...opts, maxBytes: 2_000_000, timeoutMs: 15_000 });
    return res.url || startUrl;
  } catch {
    return startUrl;
  }
}

export function crawlFinished(state: CrawlState): boolean {
  return state.processed >= state.limit || state.queue.length === 0;
}

/** Crawls the next queued page. Returns the new state and the page result (null when finished). */
export async function crawlNext(
  state: CrawlState,
  context: BrowserContext,
  opts: GuardOptions & { screenshot?: boolean } = {},
): Promise<{ state: CrawlState; page: CrawledPage | null }> {
  const start = new URL(state.start);
  const queue = [...state.queue];
  const seen = new Set(state.seen);
  const robots = { ...state.robots, sitemaps: [], raw: "" };
  let item = queue.shift();
  while (item && !robotsAllows(robots, pathOf(item.url))) item = queue.shift();
  if (!item || state.processed >= state.limit) return { state: { ...state, queue: [] }, page: null };

  const result: CrawledPage = {
    url: item.url,
    path: pathOf(item.url),
    depth: item.depth,
    status: 0,
    source: null,
    screenshot: null,
    logoPng: null,
    error: null,
  };
  let page;
  try {
    const opened = await openPage(context, item.url);
    page = opened.page;
    result.status = opened.status;
    if (opened.status >= 400) throw new Error(`HTTP ${opened.status}`);
    const contentType = await page.evaluate(() => document.contentType).catch(() => "text/html");
    if (!contentType.includes("html")) throw new Error(`Not an HTML page (${contentType}).`);
    const raw = await extractRaw(page);
    let logo: MediaRef | null = null;
    if (raw.logoSelector) {
      const el = await page.$(raw.logoSelector);
      if (el) {
        result.logoPng = await el.screenshot({ type: "png", omitBackground: true }).catch(() => null);
        const box = await el.boundingBox();
        if (result.logoPng && box) {
          logo = {
            src: `${start.origin}${LOGO_SCREENSHOT_PATH}`,
            alt: "",
            width: Math.round(box.width),
            height: Math.round(box.height),
            kind: "image",
            role: "logo",
          };
        }
      }
    }
    result.source = toSourcePage(raw, item.url, logo);
    if (opts.screenshot !== false) result.screenshot = await fullPageScreenshot(page);
    if (item.depth < state.maxDepth) {
      for (const href of raw.links ?? []) {
        const next = normalizePageUrl(href, start);
        if (next && !seen.has(next) && seen.size < state.limit * 6) {
          seen.add(next);
          queue.push({ url: next, depth: item.depth + 1 });
        }
      }
    }
  } catch (error) {
    result.error = (error as Error).message.slice(0, 500);
  } finally {
    await page?.close().catch(() => {});
  }
  // Keep the queue breadth-first by depth.
  queue.sort((a, b) => a.depth - b.depth);
  return {
    state: { ...state, queue, seen: [...seen], processed: state.processed + 1 },
    page: result,
  };
}
