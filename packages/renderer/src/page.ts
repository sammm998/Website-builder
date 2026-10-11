import { escapeAttr, escapeText } from "@redesign/sanitizer";
import { preloadFile } from "@redesign/fonts";
import { RUNTIME_BASE, runtimeManifest } from "@redesign/motion-runtime";
import { getAttr, mapElements, removeAttr, setAttr, type Attrs } from "./html";
import { siteHref, absoluteUrl } from "./paths";
import { hreflangLinks, structuredData } from "./seo";
import type { MediaAsset, PageInput, SiteContext } from "./types";

const SKIP_LABEL: Record<string, string> = {
  sv: "Hoppa till innehållet",
  en: "Skip to content",
  de: "Zum Inhalt springen",
  no: "Hopp til innhold",
  nb: "Hopp til innhold",
  da: "Spring til indhold",
  fi: "Siirry sisältöön",
  fr: "Aller au contenu",
  es: "Saltar al contenido",
};
const LANG_NAMES: Record<string, string> = { sv: "Svenska", en: "English", de: "Deutsch", no: "Norsk", nb: "Norsk", da: "Dansk", fi: "Suomi", fr: "Français", es: "Español", it: "Italiano", nl: "Nederlands", pl: "Polski" };

interface RenderState {
  lcpAssigned: boolean;
  /** Images used on the page (for og:image and LCP preload). */
  images: { asset: MediaAsset; lcp: boolean }[];
}

function srcsetFor(asset: MediaAsset): { src: string; srcset: string } {
  const webp = asset.variants.filter((v) => v.format === "webp").sort((a, b) => a.width - b.width);
  if (!webp.length) return { src: asset.url, srcset: "" };
  const src = (webp.find((v) => v.width >= 1200) ?? webp[webp.length - 1]!).url;
  return { src, srcset: webp.map((v) => `${v.url} ${v.width}w`).join(", ") };
}

function isInternalHref(ctx: SiteContext, href: string): string | null {
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  try {
    const u = new URL(href);
    const src = new URL(ctx.sourceOrigin);
    if (u.hostname.replace(/^www\./, "") === src.hostname.replace(/^www\./, "")) return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return null;
  }
  return null;
}

function rewriteFragment(html: string, ctx: SiteContext, page: PageInput, state: RenderState, hero: boolean): string {
  const knownPaths = new Set(ctx.pages.filter((p) => p.lang === page.lang).map((p) => p.path));
  return mapElements(html, ({ tag, attrs }) => {
    let a: Attrs = attrs;
    if (tag === "img" || tag === "video") {
      const ref = getAttr(a, "src") ?? "";
      const id = ref.startsWith("media:") ? ref.slice(6) : "";
      const asset = id ? ctx.media.get(id) : undefined;
      if (!asset) return null; // sanitizer guarantees known ids; drop if missing at render time
      if (tag === "video") {
        a = setAttr(a, "src", asset.url);
        if (!getAttr(a, "preload")) a = setAttr(a, "preload", "metadata");
        return { tag, attrs: a };
      }
      const { src, srcset } = srcsetFor(asset);
      a = setAttr(a, "src", src);
      if (srcset) {
        a = setAttr(a, "srcset", srcset);
        a = setAttr(a, "sizes", hero ? "100vw" : "(min-width: 1024px) 55vw, 100vw");
      }
      if (!getAttr(a, "width") && asset.width) a = setAttr(a, "width", String(asset.width));
      if (!getAttr(a, "height") && asset.height) a = setAttr(a, "height", String(asset.height));
      // Preserve source alt text when the generated markup left it empty.
      if (!getAttr(a, "alt") && asset.alt) a = setAttr(a, "alt", asset.alt);
      if (!getAttr(a, "alt")) a = setAttr(a, "alt", "");
      const lcp = hero && !state.lcpAssigned && (asset.width ?? 0) >= 400;
      if (lcp) {
        state.lcpAssigned = true;
        a = setAttr(setAttr(setAttr(a, "loading", "eager"), "fetchpriority", "high"), "data-lcp", true);
      } else {
        if (!getAttr(a, "loading")) a = setAttr(a, "loading", "lazy");
        a = removeAttr(a, "fetchpriority");
      }
      a = setAttr(a, "decoding", "async");
      state.images.push({ asset, lcp });
      return { tag, attrs: a };
    }
    if (tag === "a") {
      const href = getAttr(a, "href");
      if (href) {
        const internal = isInternalHref(ctx, href);
        if (internal !== null) {
          const [pathPart, hash = ""] = internal.split("#");
          const path = (pathPart ?? "/").replace(/\/$/, "") || "/";
          const target = knownPaths.has(path) ? siteHref(ctx, path, page.lang) : `${ctx.basePath}${path}`;
          a = setAttr(a, "href", `${target || "/"}${hash ? `#${hash}` : ""}`);
          a = removeAttr(removeAttr(a, "target"), "rel");
          if (path === page.path && !hash) a = setAttr(a, "aria-current", "page");
        }
      }
      return { tag, attrs: a };
    }
    if (tag === "form") {
      const action = getAttr(a, "action") ?? "";
      const key = action.startsWith("form:") ? action.slice(5) : "";
      if (!key) return { tag, attrs: a };
      a = setAttr(a, "action", ctx.formAction(key, page.path));
      a = setAttr(a, "method", "post");
      const honeypot = `<div class="sr-only" aria-hidden="true"><label>Leave empty<input type="text" name="_hp" tabindex="-1" autocomplete="off"></label></div><input type="hidden" name="_page" value="${escapeAttr(page.path)}"><input type="hidden" name="_lang" value="${escapeAttr(page.lang)}">`;
      return { tag, attrs: a, prepend: honeypot };
    }
    if (getAttr(a, "data-lang-switch") !== undefined) {
      const langs = ctx.languages.filter((l) => ctx.pages.some((p) => p.path === page.path && p.lang === l));
      if (langs.length < 2) return { tag, attrs: a };
      const links = langs
        .map(
          (l) =>
            `<a href="${escapeAttr(siteHref(ctx, page.path, l) || "/")}" hreflang="${escapeAttr(l)}" lang="${escapeAttr(l)}"${l === page.lang ? ' aria-current="true"' : ""}>${escapeText(LANG_NAMES[l] ?? l.toUpperCase())}</a>`,
        )
        .join("");
      return { tag, attrs: setAttr(a, "class", `${getAttr(a, "class") ?? ""} lang-switch`.trim()), prepend: links };
    }
    return { tag, attrs: a };
  });
}

export interface RenderedPage {
  html: string;
  images: MediaAsset[];
}

/** Renders a complete, standalone HTML document for one page. */
export function renderPage(page: PageInput, ctx: SiteContext, css: string): RenderedPage {
  const ds = ctx.designSystem;
  const state: RenderState = { lcpAssigned: false, images: [] };
  const header = rewriteFragment(page.header, ctx, page, state, false);
  const sections = page.sections
    .map((section) => {
      const html = rewriteFragment(section.html, ctx, page, state, section.sourceIndex === -1);
      return `<div data-section-index="${section.sourceIndex}" data-archetype="${escapeAttr(section.archetype)}">${html}</div>`;
    })
    .join("\n");
  const footer = rewriteFragment(page.footer, ctx, page, state, false);

  const canonical = absoluteUrl(ctx, page.path, page.lang);
  const ogImage = state.images.find((i) => i.lcp)?.asset ?? state.images[0]?.asset;
  const manifest = runtimeManifest();
  const runtime = `${ctx.assetBase}${RUNTIME_BASE}`;
  const lcpImage = state.images.find((i) => i.lcp)?.asset;
  const lcpSrc = lcpImage ? srcsetFor(lcpImage) : null;

  const head = [
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`,
    `<title>${escapeText(page.title)}</title>`,
    page.description ? `<meta name="description" content="${escapeAttr(page.description)}">` : "",
    ctx.mode === "preview" ? `<meta name="robots" content="noindex, nofollow">` : `<meta name="robots" content="index, follow, max-image-preview:large">`,
    `<link rel="canonical" href="${escapeAttr(canonical)}">`,
    ...hreflangLinks(ctx, page.path).map((l) => `<link rel="alternate" hreflang="${escapeAttr(l.lang)}" href="${escapeAttr(l.href)}">`),
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${escapeAttr(ctx.siteName)}">`,
    `<meta property="og:title" content="${escapeAttr(page.title)}">`,
    page.description ? `<meta property="og:description" content="${escapeAttr(page.description)}">` : "",
    `<meta property="og:url" content="${escapeAttr(canonical)}">`,
    `<meta property="og:locale" content="${escapeAttr(page.lang)}">`,
    ogImage ? `<meta property="og:image" content="${escapeAttr(ogImage.url)}">` : "",
    `<meta name="twitter:card" content="${ogImage ? "summary_large_image" : "summary"}">`,
    `<meta name="theme-color" content="${escapeAttr(ds.colors.bg)}">`,
    ctx.logoMediaId && ctx.media.get(ctx.logoMediaId) ? `<link rel="icon" href="${escapeAttr(ctx.media.get(ctx.logoMediaId)!.url)}">` : "",
    `<link rel="preload" href="${escapeAttr(`${ctx.assetBase}/fonts/${preloadFile(ds.typography.display)}`)}" as="font" type="font/woff2" crossorigin>`,
    lcpSrc ? `<link rel="preload" as="image" href="${escapeAttr(lcpSrc.src)}"${lcpSrc.srcset ? ` imagesrcset="${escapeAttr(lcpSrc.srcset)}" imagesizes="100vw"` : ""} fetchpriority="high">` : "",
    ctx.cssHref ? `<link rel="stylesheet" href="${escapeAttr(ctx.cssHref)}">` : `<style>${css.replace(/<\/style/gi, "<\\/style")}</style>`,
    `<script src="${escapeAttr(`${runtime}/boot.js`)}" integrity="${manifest.files["boot.js"]!.integrity}" crossorigin="anonymous"></script>`,
    `<script type="module" src="${escapeAttr(`${runtime}/motion.js`)}" integrity="${manifest.files["motion.js"]!.integrity}" crossorigin="anonymous"></script>`,
    structuredData(ctx, page),
  ]
    .filter(Boolean)
    .join("\n");

  const html = `<!doctype html>
<html lang="${escapeAttr(page.lang)}" data-motion-intensity="${ds.motion.intensity}" data-motion-smooth="${ds.motion.smoothScroll}" data-transition="${ds.motion.pageTransition}" data-mode="${ds.mode}">
<head>
${head}
</head>
<body>
<a class="skip-link" href="#main">${escapeText(SKIP_LABEL[page.lang] ?? SKIP_LABEL["en"]!)}</a>
${ds.motion.cursor !== "none" ? `<div data-motion="cursor-follow" data-cursor-follow-style="${ds.motion.cursor}" hidden></div>` : ""}
${header}
<main id="main">
${sections}
</main>
${footer}
</body>
</html>`;
  return { html, images: state.images.map((i) => i.asset) };
}
