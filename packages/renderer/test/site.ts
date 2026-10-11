import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import sharp from "sharp";
import { sampleDirection, sampleMedia, sampleSourcePage, MEDIA, ORIGIN } from "@redesign/fixtures";
import { fontFiles } from "@redesign/fonts";
import { RUNTIME_DIST_DIR } from "@redesign/motion-runtime";
import { buildSiteCss, renderPage, type MediaAsset, type SiteContext, type PageInput } from "../src";

export const COLORS: Record<string, string> = { [MEDIA.hero]: "#1d3b2a", [MEDIA.kok]: "#8a5a2b", [MEDIA.badrum]: "#2b5a8a", [MEDIA.tillbyggnad]: "#5a8a2b", [MEDIA.logo]: "#f3efe6" };

export function mediaMap(base: string): Map<string, MediaAsset> {
  return new Map(
    sampleMedia.map((m) => [
      m.id,
      {
        id: m.id,
        kind: "image" as const,
        url: `${base}/media/${m.id}/original.jpg`,
        width: m.width,
        height: m.height,
        alt: m.alt,
        variants: [480, 960, m.width].filter((w) => w <= m.width).map((w) => ({ width: w, format: "webp", url: `${base}/media/${m.id}/${w}.webp` })),
      },
    ]),
  );
}

export function context(base: string, overrides: Partial<SiteContext> = {}): SiteContext {
  return {
    siteName: "Byggfirma Ek",
    origin: "https://byggfirmaek.se",
    basePath: "",
    assetBase: base,
    defaultLang: "sv",
    languages: ["sv", "en"],
    pages: [
      { path: "/", lang: "sv", title: "Byggfirma Ek – Totalentreprenad i Stockholm" },
      { path: "/", lang: "en", title: "Byggfirma Ek – Design-build in Stockholm" },
      { path: "/tjanster", lang: "sv", title: "Tjänster – Byggfirma Ek" },
      { path: "/tjanster", lang: "en", title: "Services – Byggfirma Ek" },
      { path: "/kontakt", lang: "sv", title: "Kontakt – Byggfirma Ek" },
    ],
    media: mediaMap(base),
    designSystem: sampleDirection.designSystem,
    facts: sampleSourcePage.facts,
    logoMediaId: MEDIA.logo,
    sourceOrigin: ORIGIN,
    mode: "publish",
    formAction: (key) => `/api/forms/site-1/${key}`,
    ...overrides,
  };
}

export function homePage(): PageInput {
  return {
    path: "/",
    lang: "sv",
    title: sampleSourcePage.title,
    description: sampleSourcePage.description,
    sections: sampleDirection.sections,
    header: sampleDirection.headerHtml,
    footer: sampleDirection.footerHtml,
    source: sampleSourcePage,
  };
}

export async function renderHome(base: string, overrides: Partial<SiteContext> = {}) {
  const ctx = context(base, overrides);
  const page = homePage();
  const css = await buildSiteCss(ctx.designSystem, [page.header, page.footer, ...page.sections.map((s) => s.html)], base);
  return { ctx, page, css, ...renderPage(page, ctx, css) };
}

/** Serves rendered HTML plus runtime, fonts and generated images. */
export async function startSiteServer(getHtml: () => string) {
  const fonts = new Map(["fraunces", "inter-tight"].flatMap((f) => fontFiles(f as "fraunces").map((x) => [x.file, x.source] as const)));
  const cache = new Map<string, Buffer>();
  const server = createServer(async (req, res) => {
    const url = (req.url ?? "/").split("?")[0]!;
    if (url.startsWith("/runtime/v1/")) {
      const file = join(RUNTIME_DIST_DIR, url.slice("/runtime/v1/".length));
      if (!existsSync(file)) return void res.writeHead(404).end();
      return void res.writeHead(200, { "content-type": extname(file) === ".js" ? "text/javascript" : "text/css", "access-control-allow-origin": "*" }).end(readFileSync(file));
    }
    if (url.startsWith("/fonts/")) {
      const src = fonts.get(url.slice(7));
      if (!src) return void res.writeHead(404).end();
      return void res.writeHead(200, { "content-type": "font/woff2", "access-control-allow-origin": "*" }).end(readFileSync(src));
    }
    const m = /^\/media\/([0-9a-f-]+)\/(\d+|original)\.(webp|jpg)$/.exec(url);
    if (m) {
      const key = url;
      if (!cache.has(key)) {
        const meta = sampleMedia.find((x) => x.id === m[1])!;
        const w = m[2] === "original" ? meta.width : Number(m[2]);
        const h = Math.round((meta.height / meta.width) * w);
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${COLORS[m[1]!]}"/><stop offset="1" stop-color="#0e0f0c"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="${w * 0.7}" cy="${h * 0.4}" r="${h * 0.3}" fill="#ffffff22"/></svg>`;
        const img = sharp(Buffer.from(svg));
        cache.set(key, await (m[3] === "webp" ? img.webp() : img.jpeg()).toBuffer());
      }
      return void res.writeHead(200, { "content-type": m[3] === "webp" ? "image/webp" : "image/jpeg" }).end(cache.get(key));
    }
    if (url === "/favicon.ico") return void res.writeHead(204).end();
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(getHtml());
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  return { origin: `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`, close: () => new Promise<void>((r) => server.close(() => r())) };
}
