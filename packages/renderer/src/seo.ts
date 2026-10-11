import type { Facts, SourcePage } from "@redesign/schema";
import type { SiteContext, PageInput } from "./types";
import { absoluteUrl, localizedPath } from "./paths";

const LOCAL_BUSINESS = /LocalBusiness|Restaurant|Store|Dentist|Physician|Hotel|Bakery|CafeOrCoffeeShop|AutoRepair|BeautySalon|HairSalon|Plumber|Electrician|RealEstateAgent|LegalService|Attorney|AccountingService|HomeAndConstructionBusiness|GeneralContractor|RoofingContractor|MedicalBusiness|HealthAndBeautyBusiness|ProfessionalService|FoodEstablishment|SportsActivityLocation|AutoDealer|ChildCare|Library|LodgingBusiness|TravelAgency|EmploymentAgency|FinancialService|InsuranceAgency|MovingCompany|HousePainter|Locksmith|HVACBusiness/;
/** Types we generate ourselves; source declarations of these are replaced, everything else is kept. */
const GENERATED = /^(Organization|Corporation|WebSite|WebPage|BreadcrumbList|SiteNavigationElement|ImageObject|WPHeader|WPFooter)$/;

/** Serializes JSON-LD safely for embedding in a <script type="application/ld+json"> data block. */
export function jsonLdScript(data: unknown): string {
  const json = JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
  return `<script type="application/ld+json">${json}</script>`;
}

export function organizationType(facts: Facts): string {
  return facts.schemaTypes.find((t) => LOCAL_BUSINESS.test(t)) ?? (facts.addresses.length || facts.openingHours.length ? "LocalBusiness" : "Organization");
}

/** Organization/LocalBusiness built only from facts extracted from the source site. */
export function organizationLd(ctx: SiteContext): Record<string, unknown> {
  const f = ctx.facts;
  const logo = ctx.logoMediaId ? ctx.media.get(ctx.logoMediaId) : undefined;
  const node: Record<string, unknown> = {
    "@type": organizationType(f),
    "@id": `${absoluteUrl(ctx, "/", ctx.defaultLang)}#organization`,
    name: f.organizationName || ctx.siteName,
    url: absoluteUrl(ctx, "/", ctx.defaultLang),
  };
  if (logo) node["logo"] = logo.url;
  if (f.phones[0]) node["telephone"] = f.phones[0];
  if (f.emails[0]) node["email"] = f.emails[0];
  if (f.addresses[0]) node["address"] = f.addresses[0];
  if (f.socials.length) node["sameAs"] = f.socials;
  if (f.openingHours.length && node["@type"] !== "Organization") node["openingHours"] = f.openingHours;
  if (logo && node["@type"] !== "Organization") node["image"] = logo.url;
  return node;
}

function crumbName(ctx: SiteContext, path: string, lang: string): string {
  const page = ctx.pages.find((p) => p.path === path && p.lang === lang);
  if (page?.title) return page.title.split(/\s[|–—-]\s/)[0]!.trim() || page.title;
  const seg = path.split("/").filter(Boolean).pop() ?? "";
  return decodeURIComponent(seg).replace(/[-_]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function breadcrumbLd(ctx: SiteContext, page: PageInput): Record<string, unknown> | null {
  if (page.path === "/") return null;
  const parts = page.path.split("/").filter(Boolean);
  const items = [{ path: "/", name: crumbName(ctx, "/", page.lang) || ctx.siteName }];
  parts.forEach((_, i) => {
    const path = `/${parts.slice(0, i + 1).join("/")}`;
    items.push({ path, name: crumbName(ctx, path, page.lang) });
  });
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: absoluteUrl(ctx, item.path, page.lang),
    })),
  };
}

/** Source-declared structured data that we do not regenerate (FAQPage, Product, Event, ...). */
export function preservedSourceLd(source: SourcePage | null | undefined): unknown[] {
  if (!source) return [];
  const out: unknown[] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    if (Array.isArray(obj["@graph"])) return (obj["@graph"] as unknown[]).forEach(visit);
    const types = (Array.isArray(obj["@type"]) ? obj["@type"] : [obj["@type"]]).filter((t): t is string => typeof t === "string");
    if (types.length && !types.some((t) => GENERATED.test(t) || LOCAL_BUSINESS.test(t))) out.push(obj);
  };
  source.jsonLd.forEach(visit);
  return out.slice(0, 10);
}

export function structuredData(ctx: SiteContext, page: PageInput): string {
  const graph: Record<string, unknown>[] = [organizationLd(ctx)];
  if (page.path === "/") {
    graph.push({
      "@type": "WebSite",
      "@id": `${absoluteUrl(ctx, "/", ctx.defaultLang)}#website`,
      name: ctx.siteName,
      url: absoluteUrl(ctx, "/", ctx.defaultLang),
      inLanguage: ctx.languages,
      publisher: { "@id": `${absoluteUrl(ctx, "/", ctx.defaultLang)}#organization` },
    });
  }
  graph.push({
    "@type": "WebPage",
    "@id": absoluteUrl(ctx, page.path, page.lang),
    url: absoluteUrl(ctx, page.path, page.lang),
    name: page.title,
    description: page.description || undefined,
    inLanguage: page.lang,
    isPartOf: { "@id": `${absoluteUrl(ctx, "/", ctx.defaultLang)}#website` },
  });
  const crumbs = breadcrumbLd(ctx, page);
  if (crumbs) graph.push(crumbs);
  const scripts = [jsonLdScript({ "@context": "https://schema.org", "@graph": graph })];
  if (page.lang === ctx.defaultLang) {
    for (const item of preservedSourceLd(page.source)) scripts.push(jsonLdScript(item));
  }
  return scripts.join("");
}

export function hreflangLinks(ctx: SiteContext, path: string): { lang: string; href: string }[] {
  const langs = ctx.languages.filter((lang) => ctx.pages.some((p) => p.path === path && p.lang === lang));
  if (langs.length < 2) return [];
  return [
    ...langs.map((lang) => ({ lang, href: absoluteUrl(ctx, path, lang) })),
    { lang: "x-default", href: absoluteUrl(ctx, path, ctx.defaultLang) },
  ];
}

const xmlEscape = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

export function sitemapXml(ctx: SiteContext, lastmod?: string): string {
  const entries = ctx.pages
    .filter((p) => !p.noindex)
    .map((p) => {
      const alternates = hreflangLinks(ctx, p.path)
        .map((l) => `<xhtml:link rel="alternate" hreflang="${xmlEscape(l.lang)}" href="${xmlEscape(l.href)}"/>`)
        .join("");
      return `<url><loc>${xmlEscape(absoluteUrl(ctx, p.path, p.lang))}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}${alternates}</url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries}\n</urlset>\n`;
}

export function robotsTxt(ctx: SiteContext): string {
  if (ctx.mode === "preview") return "User-agent: *\nDisallow: /\n";
  return `User-agent: *\nAllow: /\n\nSitemap: ${ctx.origin}${ctx.basePath}/sitemap.xml\n`;
}

export { localizedPath };
