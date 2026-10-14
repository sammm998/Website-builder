import "server-only";
import { join } from "node:path";
import { configureRuntimeDir } from "@redesign/motion-runtime";
import { renderPage, resolveRequestPath, type MediaAsset, type SiteContext } from "@redesign/renderer";
import type { DesignSystem, Facts, GeneratedSection, SourcePage } from "@redesign/schema";
import { sql } from "./db";
import { env } from "./env";
import { publicMediaUrl, storageOrigin } from "./storage";

// The runtime is copied into public/ at build time (scripts/copy-assets.mjs).
configureRuntimeDir(join(/*turbopackIgnore: true*/ process.cwd(), "public/runtime/v1"));

const EMBED_HOSTS = "https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com https://www.google.com https://maps.google.com";
const WORKER_ASSET_HOST = "https://assets.redesign.internal";

/** CSP for generated documents: only our runtime may execute; everything else is data. */
export function siteCsp(opts: { preview: boolean; selfStyles: boolean }): string {
  const app = env().APP_ORIGIN;
  const media = storageOrigin();
  return [
    opts.preview ? "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox" : "",
    "default-src 'none'",
    `script-src ${app}`,
    opts.selfStyles ? "style-src 'self'" : "style-src 'unsafe-inline'",
    `img-src 'self' ${app} ${media} data: blob:`,
    `media-src ${media} ${app}`,
    `font-src ${app}`,
    `frame-src ${EMBED_HOSTS}`,
    "connect-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    opts.preview ? "form-action 'none'" : `form-action ${app}`,
    opts.preview ? "frame-ancestors 'self'" : "frame-ancestors 'none'",
  ]
    .filter(Boolean)
    .join("; ");
}

export function htmlResponse(html: string, csp: string, extra: Record<string, string> = {}) {
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": csp,
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
      ...extra,
    },
  });
}

interface MediaRow {
  id: string;
  storage_path: string;
  width: number | null;
  height: number | null;
  alt: string | null;
  mime: string | null;
  variants: { width: number; height?: number; format: string; path: string }[];
}

export async function mediaMap(projectId: string): Promise<Map<string, MediaAsset>> {
  const rows = await sql()<MediaRow[]>`
    select id, storage_path, width, height, alt, mime, variants from media
    where project_id = ${projectId} and storage_path is not null and error is null`;
  return new Map(
    rows.map((m) => [
      m.id,
      {
        id: m.id,
        kind: m.mime?.startsWith("video/") ? "video" : "image",
        url: publicMediaUrl(m.storage_path),
        width: m.width,
        height: m.height,
        alt: m.alt,
        variants: (m.variants ?? []).map((v) => ({ width: v.width, height: v.height, format: v.format, url: publicMediaUrl(v.path) })),
      },
    ]),
  );
}

const EMPTY_FACTS: Facts = { organizationName: "", phones: [], emails: [], addresses: [], socials: [], schemaTypes: [], openingHours: [] };

/**
 * Live preview of a design direction (owner only; caller checks ownership). Only the homepage exists, so
 * every path under `basePath` shows it: clicking the navigation keeps the visitor inside the preview.
 */
export async function renderDirectionPreview(userId: string, directionId: string, basePath = `/preview/direction/${directionId}`): Promise<string | null> {
  const db = sql();
  const [row] = await db<{ project_id: string; design_system: DesignSystem; header_html: string; footer_html: string; sections: GeneratedSection[]; css: string; name: string; source: SourcePage | null; lang: string | null; origin: string; brand: { logoMediaId: string | null } | null }[]>`
    select d.project_id, d.design_system, d.header_html, d.footer_html, d.sections, d.css, p.name, p.source_language as lang, p.origin, p.brand,
      (select source from pages where project_id = d.project_id and path = '/' limit 1) as source
    from design_directions d join projects p on p.id = d.project_id
    where d.id = ${directionId} and d.user_id = ${userId}`;
  if (!row) return null;
  const lang = row.lang ?? "sv";
  const ctx: SiteContext = {
    siteName: row.name,
    origin: env().APP_ORIGIN,
    basePath,
    assetBase: env().APP_ORIGIN,
    defaultLang: lang,
    languages: [lang],
    pages: [{ path: "/", lang, title: row.source?.title ?? row.name }],
    media: await mediaMap(row.project_id),
    designSystem: row.design_system,
    facts: row.source?.facts ?? EMPTY_FACTS,
    logoMediaId: row.brand?.logoMediaId ?? undefined,
    sourceOrigin: row.origin,
    mode: "preview",
    formAction: () => "#preview",
  };
  const css = (row.css ?? "").replaceAll(WORKER_ASSET_HOST, env().APP_ORIGIN);
  return renderPage(
    { path: "/", lang, title: row.source?.title ?? row.name, description: row.source?.description ?? "", sections: row.sections, header: row.header_html, footer: row.footer_html, source: row.source },
    ctx,
    css,
  ).html;
}

/**
 * Preview of a built page, navigable under `basePath` (the iframe, a new tab or a test link). Unknown
 * paths show the homepage with status 404, like the published site, so visitors are never stranded.
 */
export async function renderBuildPreview(
  userId: string,
  buildId: string,
  requestPath: string,
  basePath = `/preview/build/${buildId}`,
): Promise<{ html: string; status: number } | null> {
  const db = sql();
  const [build] = await db<{ project_id: string; css: string | null; layouts: Record<string, { header: string; footer: string }>; design_system: DesignSystem; name: string; origin: string; lang: string | null; targets: string[]; brand: { logoMediaId: string | null } | null }[]>`
    select b.project_id, b.css, b.layouts, d.design_system, p.name, p.origin, p.source_language as lang, p.target_languages as targets, p.brand
    from site_builds b join design_directions d on d.id = b.direction_id join projects p on p.id = b.project_id
    where b.id = ${buildId} and b.user_id = ${userId}`;
  if (!build) return null;
  const pages = await db<{ path: string; lang: string; title: string; description: string; sections: GeneratedSection[]; source: SourcePage | null }[]>`
    select sp.path, sp.lang, sp.title, sp.description, sp.sections, p.source from site_pages sp join pages p on p.id = sp.source_page_id
    where sp.build_id = ${buildId} and sp.user_id = ${userId}`;
  const defaultLang = build.lang ?? "sv";
  const languages = [defaultLang, ...build.targets.filter((l) => l !== defaultLang && pages.some((p) => p.lang === l))];
  const target = resolveRequestPath(requestPath, languages, defaultLang);
  const found = pages.find((p) => p.path === target.path && p.lang === target.lang) ?? pages.find((p) => p.path === target.path && p.lang === defaultLang);
  const page = found ?? pages.find((p) => p.path === "/" && p.lang === defaultLang) ?? pages[0];
  if (!page) return null;
  const layout = build.layouts[page.lang] ?? build.layouts[defaultLang]!;
  const ctx: SiteContext = {
    siteName: build.name,
    origin: env().APP_ORIGIN,
    basePath,
    assetBase: env().APP_ORIGIN,
    defaultLang,
    languages,
    pages: pages.map((p) => ({ path: p.path, lang: p.lang, title: p.title })),
    media: await mediaMap(build.project_id),
    designSystem: build.design_system,
    facts: pages.find((p) => p.path === "/")?.source?.facts ?? EMPTY_FACTS,
    logoMediaId: build.brand?.logoMediaId ?? undefined,
    sourceOrigin: build.origin,
    mode: "preview",
    formAction: () => "#preview",
  };
  const html = renderPage({ ...page, header: layout.header, footer: layout.footer, source: page.lang === defaultLang ? page.source : null }, ctx, build.css ?? "").html;
  return { html, status: found ? 200 : 404 };
}

const PREVIEW_HEADERS = { "cache-control": "private, no-store", "x-robots-tag": "noindex, nofollow", "referrer-policy": "no-referrer" };

/** Response for a preview document (sandboxed CSP: runtime scripts only, no forms). */
export function previewResponse(html: string, status = 200): Response {
  const res = htmlResponse(html, siteCsp({ preview: true, selfStyles: false }), PREVIEW_HEADERS);
  return status === 200 ? res : new Response(res.body, { status, headers: res.headers });
}

export interface PublishedSite {
  id: string;
  slug: string;
  css: string;
  version: number;
  default_lang: string;
  languages: string[];
  sitemap_xml: string;
  robots_txt: string;
}

export async function publishedBySlug(slug: string): Promise<PublishedSite | null> {
  const [site] = await sql()<PublishedSite[]>`
    select id, slug, css, version, default_lang, languages, sitemap_xml, robots_txt from published_sites where slug = ${slug} and is_published`;
  return site ?? null;
}

export async function publishedByDomain(hostname: string): Promise<PublishedSite | null> {
  const [site] = await sql()<PublishedSite[]>`
    select s.id, s.slug, s.css, s.version, s.default_lang, s.languages, s.sitemap_xml, s.robots_txt
    from domains d join published_sites s on s.id = d.site_id
    where d.hostname = ${hostname.toLowerCase()} and d.status = 'verified' and s.is_published`;
  return site ?? null;
}

/** Serves a published snapshot: pages, stylesheet, sitemap and robots. */
export async function servePublished(site: PublishedSite, requestPath: string): Promise<Response> {
  const path = `/${requestPath.replace(/^\/+/, "")}`;
  if (path === "/_site.css") {
    return new Response(site.css, { headers: { "content-type": "text/css; charset=utf-8", "cache-control": "public, max-age=31536000, immutable" } });
  }
  if (path === "/sitemap.xml") return new Response(site.sitemap_xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
  if (path === "/robots.txt") return new Response(site.robots_txt, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
  const target = resolveRequestPath(path, site.languages, site.default_lang);
  const [page] = await sql()<{ html: string }[]>`
    select html from published_pages where site_id = ${site.id} and lang = ${target.lang} and path = ${target.path}`;
  if (!page) {
    const [home] = await sql()<{ html: string }[]>`select html from published_pages where site_id = ${site.id} and lang = ${site.default_lang} and path = '/'`;
    // Unknown path: show the homepage with a 404 status so visitors are never stranded.
    return new Response(home?.html ?? "Not found", {
      status: 404,
      headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": siteCsp({ preview: false, selfStyles: true }), "cache-control": "no-store" },
    });
  }
  return htmlResponse(page.html, siteCsp({ preview: false, selfStyles: true }), { "cache-control": "public, max-age=60, stale-while-revalidate=600" });
}
