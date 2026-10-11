import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Browser, BrowserContext, Page } from "playwright";
import { fontFiles } from "@redesign/fonts";
import { FONT_IDS, type DesignSystem, type Facts, type GeneratedSection, type SourcePage } from "@redesign/schema";
import { RUNTIME_DIST_DIR } from "@redesign/motion-runtime";
import { buildSiteCss, renderPage, type MediaAsset, type SiteContext, type SitePageRef } from "@redesign/renderer";
import type { Sql } from "./db";
import type { Env } from "./env";
import type { Storage } from "./storage";

/** Fake origin for runtime/fonts inside worker screenshots; fulfilled from local files. */
export const ASSET_HOST = "https://assets.redesign.internal";

interface MediaRow {
  id: string;
  storage_path: string | null;
  width: number | null;
  height: number | null;
  alt: string | null;
  mime: string | null;
  variants: { width: number; height?: number; format: string; path: string }[];
}

export async function loadMedia(sql: Sql, storage: Storage, projectId: string): Promise<Map<string, MediaAsset>> {
  const rows = await sql<MediaRow[]>`
    select id, storage_path, width, height, alt, mime, variants from media
    where project_id = ${projectId} and storage_path is not null and error is null`;
  return new Map(
    rows.map((m) => [
      m.id,
      {
        id: m.id,
        kind: m.mime?.startsWith("video/") ? ("video" as const) : ("image" as const),
        url: storage.publicUrl("site-media", m.storage_path!),
        width: m.width,
        height: m.height,
        alt: m.alt,
        variants: (m.variants ?? []).map((v) => ({ width: v.width, height: v.height, format: v.format, url: storage.publicUrl("site-media", v.path) })),
      },
    ]),
  );
}

export interface ContextInput {
  siteName: string;
  origin: string;
  basePath: string;
  assetBase: string;
  defaultLang: string;
  languages: string[];
  pages: SitePageRef[];
  media: Map<string, MediaAsset>;
  designSystem: DesignSystem;
  facts: Facts;
  logoMediaId?: string | undefined;
  sourceOrigin: string;
  mode: "preview" | "publish";
  siteId?: string;
  cssHref?: string;
}

export function siteContext(input: ContextInput): SiteContext {
  const { siteId, ...rest } = input;
  return {
    ...rest,
    formAction: (key) => (input.mode === "publish" && siteId ? `${input.assetBase}/api/forms/${siteId}/${encodeURIComponent(key)}` : "#preview-form"),
  };
}

/** Renders a single page document (used for previews, screenshots and QA). */
export async function renderDocument(
  ctx: SiteContext,
  page: { path: string; lang: string; title: string; description: string; sections: GeneratedSection[]; header: string; footer: string; source?: SourcePage | null },
  css?: string,
) {
  const styles = css ?? (await buildSiteCss(ctx.designSystem, [page.header, page.footer, ...page.sections.map((s) => s.html)], ctx.assetBase));
  return { ...renderPage(page, ctx, styles), css: styles };
}

const fontFileMap = new Map(FONT_IDS.flatMap((f) => fontFiles(f).map((x) => [x.file, x.source] as const)));

/**
 * Browser context that serves the runtime and fonts from local files and the local storage driver
 * from disk, so screenshots never depend on the web app being reachable.
 */
export async function renderContext(browser: Browser, env: Env, opts: { width: number; height: number; reducedMotion: boolean }): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport: { width: opts.width, height: opts.height },
    deviceScaleFactor: 1,
    reducedMotion: opts.reducedMotion ? "reduce" : "no-preference",
    serviceWorkers: "block",
  });
  await context.route(`${ASSET_HOST}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/runtime/v1/")) {
      const file = join(RUNTIME_DIST_DIR, path.slice("/runtime/v1/".length).replace(/\.\./g, ""));
      return route.fulfill({ body: await readFile(file).catch(() => Buffer.from("")), contentType: file.endsWith(".js") ? "text/javascript" : "text/css", headers: { "access-control-allow-origin": "*" } });
    }
    if (path.startsWith("/fonts/")) {
      const src = fontFileMap.get(path.slice(7));
      if (src) return route.fulfill({ body: await readFile(src), contentType: "font/woff2", headers: { "access-control-allow-origin": "*" } });
    }
    return route.fulfill({ status: 404, body: "" });
  });
  if (env.STORAGE_DRIVER === "local") {
    const prefix = env.LOCAL_STORAGE_PUBLIC_URL.replace(/\/$/, "");
    await context.route(`${prefix}/**`, async (route) => {
      const rel = decodeURIComponent(route.request().url().slice(prefix.length + 1).split("?")[0]!);
      if (rel.includes("..")) return route.fulfill({ status: 400 });
      const file = join(resolve(process.cwd(), env.LOCAL_STORAGE_DIR), rel);
      const body = await readFile(file).catch(() => null);
      if (!body) return route.fulfill({ status: 404 });
      const type = rel.endsWith(".webp") ? "image/webp" : rel.endsWith(".avif") ? "image/avif" : rel.endsWith(".png") ? "image/png" : rel.endsWith(".mp4") ? "video/mp4" : "image/jpeg";
      return route.fulfill({ body, contentType: type });
    });
  }
  return context;
}

export async function loadHtml(page: Page, html: string) {
  await page.setContent(html, { waitUntil: "load", timeout: 45_000 });
  await page.evaluate(() => document.fonts.ready).catch(() => {});
}

/** Forces lazy images to load and waits for all of them (screenshots and broken-image checks). */
export async function loadAllImages(page: Page) {
  await page
    .evaluate(async () => {
      const imgs = [...document.images];
      imgs.forEach((img) => (img.loading = "eager"));
      await Promise.race([
        Promise.all(imgs.map((img) => (img.complete ? Promise.resolve() : new Promise<void>((r) => {
                img.addEventListener("load", () => r(), { once: true });
                img.addEventListener("error", () => r(), { once: true });
              })))),
        new Promise((r) => setTimeout(r, 10_000)),
      ]);
    })
    .catch(() => {});
}

/** Screenshot of the first viewport with motion running (thumbnails) and a static full page. */
export async function screenshots(browser: Browser, env: Env, html: string, width: number, height: number): Promise<{ hero: Buffer; full: Buffer }> {
  const motion = await renderContext(browser, env, { width, height, reducedMotion: false });
  const staticCtx = await renderContext(browser, env, { width, height, reducedMotion: true });
  try {
    const p1 = await motion.newPage();
    await loadHtml(p1, html);
    await p1.waitForTimeout(2600);
    const hero = await p1.screenshot({ type: "jpeg", quality: 80 });
    const p2 = await staticCtx.newPage();
    await loadHtml(p2, html);
    await loadAllImages(p2);
    await p2.waitForTimeout(300);
    const pageHeight = await p2.evaluate(() => document.documentElement.scrollHeight);
    const full = await p2.screenshot({ type: "jpeg", quality: 72, fullPage: pageHeight <= 9000, clip: pageHeight > 9000 ? { x: 0, y: 0, width, height: 9000 } : undefined });
    return { hero, full };
  } finally {
    await motion.close();
    await staticCtx.close();
  }
}
