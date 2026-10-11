import { describe, expect, it } from "vitest";
import { MEDIA, sampleDirection } from "@redesign/fixtures";
import { buildSiteCss, localizedPath, resolveRequestPath, robotsTxt, sitemapXml, renderPage } from "../src";
import { context, homePage, renderHome } from "./site";

describe("site css", () => {
  it("compiles design tokens, semantic utilities, used classes and runtime styles", async () => {
    const page = homePage();
    const css = await buildSiteCss(sampleDirection.designSystem, [page.header, ...page.sections.map((s) => s.html)], "");
    expect(css).toContain("--color-bg: #0e0f0c");
    expect(css).toContain('font-family:"Fraunces"');
    expect(css).toMatch(/\.btn-primary\s*\{/);
    expect(css).toMatch(/\.text-display-1\s*\{/);
    expect(css).toMatch(/\.container-site\s*\{/);
    expect(css).toContain("html[data-scrolled]");
    expect(css).toMatch(/\.md\\:grid-cols-3/);
    expect(css).toContain(".m-marquee");
    expect(css).not.toMatch(/\.bg-red-500/);
  });
});

describe("renderPage", () => {
  it("produces SEO-complete documents", async () => {
    const { html } = await renderHome("https://app.example");
    expect(html).toMatch(/^<!doctype html>\n<html lang="sv"/);
    expect(html).toContain("<title>Byggfirma Ek – Totalentreprenad i Stockholm</title>");
    expect(html).toContain('<link rel="canonical" href="https://byggfirmaek.se/">');
    expect(html).toContain('<link rel="alternate" hreflang="sv" href="https://byggfirmaek.se/">');
    expect(html).toContain('<link rel="alternate" hreflang="en" href="https://byggfirmaek.se/en">');
    expect(html).toContain('<link rel="alternate" hreflang="x-default" href="https://byggfirmaek.se/">');
    expect(html).toContain('"@type":"GeneralContractor"');
    expect(html).toContain('"telephone":"+4681234567"');
    expect(html).toContain('"@type":"WebSite"');
    expect(html).toContain('"@type":"FAQPage"'); // preserved from source
    expect(html).toContain('<meta property="og:image" content="https://app.example/media/');
    expect(html).toContain('<meta name="robots" content="index, follow');
    expect(html).toMatch(/<script src="https:\/\/app\.example\/runtime\/v1\/boot\.js" integrity="sha384-/);
    expect(html).toMatch(/<script type="module" src="https:\/\/app\.example\/runtime\/v1\/motion\.js" integrity="sha384-/);
  });

  it("resolves media to responsive images, restores alt text and marks the LCP image", async () => {
    const { html } = await renderHome("https://app.example");
    expect(html).not.toContain("media:");
    const hero = /<img[^>]*data-lcp[^>]*>/.exec(html)![0];
    expect(hero).toContain(`/media/${MEDIA.hero}/`);
    expect(hero).toContain('loading="eager"');
    expect(hero).toContain('fetchpriority="high"');
    expect(hero).toContain('sizes="100vw"');
    expect(html.match(/<img[^>]*data-lcp/g)).toHaveLength(1);
    expect(html).toContain(`<link rel="preload" as="image" href="https://app.example/media/${MEDIA.hero}/1600.webp"`);
    const kitchen = new RegExp(`<img[^>]*${MEDIA.kok}[^>]*>`).exec(html)![0];
    expect(kitchen).toContain('alt="Nyrenoverat kök i ek"');
    expect(kitchen).toContain('loading="lazy"');
    expect(kitchen).toContain('width="1200" height="800"');
    expect(kitchen).toMatch(/srcset="[^"]+480\.webp 480w, [^"]+960\.webp 960w, [^"]+1200\.webp 1200w"/);
  });

  it("rewrites links for base paths and languages, fills the language switch, forms", async () => {
    const ctx = context("", { basePath: "/site/ek", mode: "preview" });
    const page = { ...homePage(), lang: "en", sections: [...homePage().sections, { sourceIndex: 3, archetype: "form" as const, html: `<form action="form:form-1"><input name="namn" required><button type="submit">Skicka</button></form><a href="https://byggfirmaek.se/kontakt#form">Kontakt</a><a href="https://www.byggfirmaek.se/tjanster">Tjänster</a>` }] };
    const { html } = renderPage(page, ctx, "");
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(html).toContain('href="/site/ek/en/tjanster"');
    expect(html).toContain('href="/site/ek/kontakt#form"'); // no English kontakt page: falls back to source path
    expect(html).toContain('href="/site/ek/en" aria-current="page"');
    expect(html).toMatch(/class="hidden md:flex lang-switch"><a href="\/site\/ek" hreflang="sv" lang="sv">Svenska<\/a><a href="\/site\/ek\/en" hreflang="en" lang="en" aria-current="true">English<\/a>/);
    expect(html).toContain('<form action="/api/forms/site-1/form-1" method="post"><div class="sr-only" aria-hidden="true">');
    expect(html).toContain('name="_page" value="/"');
  });

  it("never emits inline style attributes or inline executable scripts", async () => {
    const { html } = await renderHome("");
    const body = html.slice(html.indexOf("<body>"));
    expect(body).not.toMatch(/\sstyle="/);
    const scripts = [...html.matchAll(/<script([^>]*)>/g)].map((m) => m[1]!);
    for (const attrs of scripts) expect(attrs).toMatch(/src="|type="application\/ld\+json"/);
  });
});

describe("paths, sitemap and robots", () => {
  it("localizes and resolves paths", () => {
    expect(localizedPath("/", "en", "sv")).toBe("/en");
    expect(localizedPath("/om-oss", "en", "sv")).toBe("/en/om-oss");
    expect(resolveRequestPath("/en/om-oss", ["sv", "en"], "sv")).toEqual({ lang: "en", path: "/om-oss" });
    expect(resolveRequestPath("/", ["sv", "en"], "sv")).toEqual({ lang: "sv", path: "/" });
    expect(resolveRequestPath("/engelska", ["sv", "en"], "sv")).toEqual({ lang: "sv", path: "/engelska" });
  });
  it("builds sitemap with hreflang alternates and robots", () => {
    const ctx = context("");
    const xml = sitemapXml(ctx);
    expect(xml).toContain("<loc>https://byggfirmaek.se/tjanster</loc>");
    expect(xml).toContain('<xhtml:link rel="alternate" hreflang="en" href="https://byggfirmaek.se/en/tjanster"/>');
    expect(xml.match(/<url>/g)).toHaveLength(5);
    expect(robotsTxt(ctx)).toContain("Sitemap: https://byggfirmaek.se/sitemap.xml");
    expect(robotsTxt({ ...ctx, mode: "preview" })).toContain("Disallow: /");
  });
});
