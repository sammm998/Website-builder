import type { SourcePage } from "@redesign/schema";
import { sectionTexts } from "@redesign/schema";

/**
 * Deterministic SEO audit of the crawled source site. Only evidence from the crawl is used; checks we
 * cannot verify (Core Web Vitals field data, backlinks, indexing) are reported as "unknown" and are
 * excluded from the score. Metadata suggestions only reuse text that exists on the page.
 */

export interface AuditPage {
  url: string;
  path: string;
  status: number;
  source: SourcePage | null;
}

export interface SeoCheck {
  id: string;
  category: "technical" | "metadata" | "content" | "media" | "structured" | "links" | "international";
  status: "pass" | "fail" | "warn" | "unknown";
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  paths: string[];
}

export interface MetadataSuggestion {
  path: string;
  field: "title" | "description";
  current: string;
  suggested: string;
  reason: string;
}

export interface SeoReport {
  version: 1;
  checkedAt: string;
  pages: number;
  score: number | null;
  checks: SeoCheck[];
  suggestions: MetadataSuggestion[];
}

const shorten = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max + 1).replace(/\s+\S*$/, "").trim()}…`);

function duplicates(pages: AuditPage[], pick: (p: SourcePage) => string): AuditPage[] {
  const counts = new Map<string, number>();
  for (const p of pages) {
    const v = p.source ? pick(p.source).trim().toLowerCase() : "";
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return pages.filter((p) => p.source && (counts.get(pick(p.source).trim().toLowerCase()) ?? 0) > 1);
}

export function auditSeo(all: AuditPage[], site: { origin: string; robotsTxt: boolean; sitemapUrls: number; languages: string[] }): SeoReport {
  const pages = all.filter((p) => p.source);
  const checks: SeoCheck[] = [];
  const add = (c: Omit<SeoCheck, "status" | "paths"> & { bad: AuditPage[]; known?: boolean; warnOnly?: boolean }) => {
    const { bad, known = true, warnOnly = false, ...rest } = c;
    checks.push({ ...rest, status: !known ? "unknown" : bad.length === 0 ? "pass" : warnOnly ? "warn" : "fail", paths: bad.map((p) => p.path).slice(0, 50) });
  };
  const src = (p: AuditPage) => p.source!;

  add({ id: "http-errors", category: "technical", severity: "high", title: "Sidor som svarar med fel", detail: "Sidor som inte gick att hämta (4xx/5xx) eller inte är HTML.", bad: all.filter((p) => !p.source || p.status >= 400) });
  add({ id: "https", category: "technical", severity: "high", title: "HTTPS", detail: "Alla sidor bör serveras över HTTPS.", bad: pages.filter((p) => !p.url.startsWith("https:")) });
  add({ id: "robots-txt", category: "technical", severity: "low", title: "robots.txt", detail: site.robotsTxt ? "robots.txt hittades." : "Ingen robots.txt hittades.", bad: site.robotsTxt ? [] : pages.slice(0, 1) , warnOnly: true });
  add({ id: "sitemap", category: "technical", severity: "medium", title: "XML-sitemap", detail: site.sitemapUrls ? `${site.sitemapUrls} URL:er i sitemap.` : "Ingen sitemap hittades.", bad: site.sitemapUrls ? [] : pages.slice(0, 1) });
  add({ id: "noindex", category: "technical", severity: "high", title: "Sidor blockerade från indexering", detail: "Sidor med robots noindex.", bad: pages.filter((p) => /noindex|none/i.test(src(p).robots)), warnOnly: true });
  add({ id: "canonical", category: "technical", severity: "medium", title: "Canonical-länk", detail: "Sidor utan rel=canonical.", bad: pages.filter((p) => !src(p).canonical) });
  add({
    id: "canonical-foreign",
    category: "technical",
    severity: "medium",
    title: "Canonical pekar på annan sida",
    detail: "Canonical som pekar på en annan URL än sidan själv.",
    bad: pages.filter((p) => {
      const c = src(p).canonical;
      if (!c) return false;
      try {
        return new URL(c).pathname.replace(/\/$/, "") !== new URL(p.url).pathname.replace(/\/$/, "");
      } catch {
        return true;
      }
    }),
    warnOnly: true,
  });
  add({ id: "title-missing", category: "metadata", severity: "high", title: "Saknad sidtitel", detail: "Sidor utan <title>.", bad: pages.filter((p) => !src(p).title.trim()) });
  add({ id: "title-duplicate", category: "metadata", severity: "medium", title: "Dubblerade titlar", detail: "Flera sidor delar samma titel.", bad: duplicates(pages, (s) => s.title) });
  add({ id: "title-length", category: "metadata", severity: "low", title: "Titellängd", detail: "Titlar kortare än 15 eller längre än 65 tecken kan kortas i sökresultat.", bad: pages.filter((p) => { const l = src(p).title.length; return l > 0 && (l < 15 || l > 65); }), warnOnly: true });
  add({ id: "description-missing", category: "metadata", severity: "medium", title: "Saknad metabeskrivning", detail: "Sidor utan meta description.", bad: pages.filter((p) => !src(p).description.trim()) });
  add({ id: "description-duplicate", category: "metadata", severity: "low", title: "Dubblerade metabeskrivningar", detail: "Flera sidor delar samma beskrivning.", bad: duplicates(pages, (s) => s.description) });
  add({ id: "description-length", category: "metadata", severity: "low", title: "Beskrivningslängd", detail: "Beskrivningar kortare än 70 eller längre än 160 tecken.", bad: pages.filter((p) => { const l = src(p).description.length; return l > 0 && (l < 70 || l > 160); }), warnOnly: true });
  add({ id: "h1-missing", category: "content", severity: "high", title: "Saknad H1", detail: "Sidor utan huvudrubrik.", bad: pages.filter((p) => !src(p).headings.some((h) => h.level === 1)) });
  add({ id: "h1-multiple", category: "content", severity: "low", title: "Flera H1", detail: "Sidor med mer än en H1.", bad: pages.filter((p) => src(p).headings.filter((h) => h.level === 1).length > 1), warnOnly: true });
  add({ id: "thin-content", category: "content", severity: "medium", title: "Tunt innehåll", detail: "Sidor med under 150 ord.", bad: pages.filter((p) => src(p).wordCount < 150), warnOnly: true });
  add({ id: "lang", category: "international", severity: "medium", title: "Språkattribut", detail: "Sidor utan <html lang>.", bad: pages.filter((p) => !src(p).lang) });
  add({
    id: "hreflang",
    category: "international",
    severity: "medium",
    title: "hreflang",
    detail: site.languages.length > 1 ? "Flerspråkig sajt: sidor utan hreflang-alternativ." : "Enspråkig sajt.",
    bad: site.languages.length > 1 ? pages.filter((p) => src(p).hreflang.length === 0) : [],
  });
  const missingAlt = pages.filter((p) =>
    [src(p).hero, ...src(p).sections].some((s) => s.blocks.some((b) => b.type === "media" && b.media.kind === "image" && b.media.role === "photo" && !b.media.alt.trim())),
  );
  add({ id: "alt-text", category: "media", severity: "medium", title: "Bilder utan alt-text", detail: "Innehållsbilder saknar beskrivande alt-text.", bad: missingAlt });
  add({ id: "structured-data", category: "structured", severity: "medium", title: "Strukturerad data", detail: "Sidor utan JSON-LD.", bad: pages.filter((p) => src(p).jsonLd.length === 0), warnOnly: true });
  const linked = new Set<string>();
  for (const p of pages) {
    for (const s of [src(p).hero, ...src(p).sections, src(p).footer]) {
      for (const b of s.blocks) if (b.type === "links") b.links.filter((l) => l.internal).forEach((l) => linked.add(safePath(l.href)));
    }
    src(p).nav.filter((l) => l.internal).forEach((l) => linked.add(safePath(l.href)));
  }
  add({ id: "orphans", category: "links", severity: "medium", title: "Sidor utan interna länkar", detail: "Sidor som ingen annan sida länkar till.", bad: pages.filter((p) => p.path !== "/" && !linked.has(p.path)), warnOnly: true });
  for (const [id, title] of [["core-web-vitals", "Core Web Vitals (fältdata)"], ["backlinks", "Externa länkar"], ["index-coverage", "Indexering i Google"]] as const) {
    checks.push({ id, category: "technical", status: "unknown", severity: "low", title, detail: "Kräver Search Console/CrUX-data; ingår inte i poängen.", paths: [] });
  }

  const suggestions: MetadataSuggestion[] = [];
  const dupTitles = new Set(duplicates(pages, (s) => s.title).map((p) => p.path));
  const dupDesc = new Set(duplicates(pages, (s) => s.description).map((p) => p.path));
  const siteName = pages.find((p) => p.path === "/")?.source?.facts.organizationName || new URL(site.origin).hostname.replace(/^www\./, "");
  for (const p of pages) {
    const s = src(p);
    const h1 = s.hero.heading || s.headings.find((h) => h.level === 1)?.text || "";
    if ((!s.title.trim() || dupTitles.has(p.path)) && h1) {
      suggestions.push({ path: p.path, field: "title", current: s.title, suggested: shorten(`${h1} | ${siteName}`, 65), reason: s.title ? "Dubblerad titel" : "Titel saknas" });
    }
    if (!s.description.trim() || dupDesc.has(p.path)) {
      const body = [s.hero, ...s.sections].flatMap(sectionTexts).find((t) => t.length > 60);
      if (body) suggestions.push({ path: p.path, field: "description", current: s.description, suggested: shorten(body, 155), reason: s.description ? "Dubblerad beskrivning" : "Beskrivning saknas" });
    }
  }

  const weights = { high: 3, medium: 2, low: 1 } as const;
  const known = checks.filter((c) => c.status !== "unknown");
  const total = known.reduce((n, c) => n + weights[c.severity], 0);
  const passed = known.reduce((n, c) => n + (c.status === "pass" ? weights[c.severity] : c.status === "warn" ? weights[c.severity] * 0.5 : 0), 0);
  return { version: 1, checkedAt: new Date().toISOString(), pages: all.length, score: total ? Math.round((passed / total) * 100) : null, checks, suggestions };
}

function safePath(href: string): string {
  try {
    const p = new URL(href).pathname;
    return p.length > 1 ? p.replace(/\/$/, "") : "/";
  } catch {
    return href;
  }
}
