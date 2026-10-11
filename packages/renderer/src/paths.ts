import type { SiteContext } from "./types";

/** Default language lives at the source paths; other languages under /<lang>/... */
export function localizedPath(path: string, lang: string, defaultLang: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  if (lang === defaultLang) return clean;
  return clean === "/" ? `/${lang}` : `/${lang}${clean}`;
}

export function siteHref(ctx: SiteContext, path: string, lang: string): string {
  const local = localizedPath(path, lang, ctx.defaultLang);
  if (!ctx.basePath) return local;
  return local === "/" ? ctx.basePath : `${ctx.basePath}${local}`;
}

export function absoluteUrl(ctx: SiteContext, path: string, lang: string): string {
  const href = siteHref(ctx, path, lang);
  return `${ctx.origin}${href === "" ? "/" : href}`;
}

/** Maps an incoming request path (after basePath) to { path, lang }. */
export function resolveRequestPath(requestPath: string, languages: string[], defaultLang: string): { path: string; lang: string } {
  const clean = `/${requestPath.replace(/^\/+|\/+$/g, "")}`.replace(/\/{2,}/g, "/");
  const [first, ...rest] = clean.split("/").filter(Boolean);
  if (first && first !== defaultLang && languages.includes(first)) {
    return { lang: first, path: rest.length ? `/${rest.join("/")}` : "/" };
  }
  return { lang: defaultLang, path: clean === "/" ? "/" : clean };
}
