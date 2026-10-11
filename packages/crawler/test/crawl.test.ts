import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, BrowserContext } from "playwright";
import { crawlFinished, crawlNext, guardedContext, initCrawl, launchBrowser, pageMedia, processImage, sectionTextsOf, type CrawledPage } from "./helpers";
import { startFixtureServer } from "./server";

const opts = { allowPrivate: true };

describe("crawl fixture site end-to-end", () => {
  let fixture: Awaited<ReturnType<typeof startFixtureServer>>;
  let browser: Browser;
  let context: BrowserContext;
  const pages: CrawledPage[] = [];

  beforeAll(async () => {
    fixture = await startFixtureServer();
    browser = await launchBrowser({ executablePath: process.env["CHROMIUM_PATH"] ?? "/opt/pw-browsers/chromium" });
    context = await guardedContext(browser, opts);
    let state = await initCrawl(`${fixture.origin}/`, { ...opts, limit: 20 });
    while (!crawlFinished(state)) {
      const step = await crawlNext(state, context, opts);
      state = step.state;
      if (step.page) pages.push(step.page);
    }
  }, 120_000);
  afterAll(async () => {
    await context?.close();
    await browser?.close();
    await fixture?.close();
  });

  it("discovers pages via sitemap and links, respecting robots.txt", () => {
    const paths = pages.map((p) => p.path).sort();
    expect(paths).toEqual(["/", "/kontakt", "/om-oss", "/om-oss/historia", "/tjanster"]);
    expect(pages.every((p) => p.error === null)).toBe(true);
  });

  it("extracts hero, verbatim sections, media and links from the rendered DOM", () => {
    const home = pages.find((p) => p.path === "/")!.source!;
    expect(home.lang).toBe("sv");
    expect(home.title).toBe("Byggfirma Ek – Totalentreprenad i Stockholm");
    expect(home.hero.heading).toBe("Vi bygger hem som håller i generationer");
    const heroText = sectionTextsOf(home.hero).join(" ");
    expect(heroText).toContain("Totalentreprenad för kök, badrum och tillbyggnader i hela Stockholmsområdet.");
    expect(heroText).toContain("Boka hembesök");
    const headings = home.sections.map((s) => s.heading);
    expect(headings).toEqual(expect.arrayContaining(["Våra tjänster", "Därför väljer kunder oss", "Det säger våra kunder", "Aktuellt", "Se vår film"]));
    const services = home.sections.find((s) => s.heading === "Våra tjänster")!;
    const servicesText = sectionTextsOf(services);
    expect(servicesText).toEqual(expect.arrayContaining(["Köksrenovering", "Badrum", "Tillbyggnader", "Våtrumscertifierade enligt BKR. Alltid med intyg."]));
    expect(services.blocks.filter((b) => b.type === "media")).toHaveLength(3);
    // JS-rendered content is captured.
    expect(home.sections.find((s) => s.heading === "Aktuellt")).toBeTruthy();
    // Embeds and quotes.
    expect(home.sections.flatMap((s) => s.blocks).some((b) => b.type === "embed" && b.embed.kind === "youtube")).toBe(true);
    expect(home.sections.flatMap((s) => s.blocks).some((b) => b.type === "quote" && b.cite === "Anna, Bromma")).toBe(true);
    // Cookie banner is ignored.
    expect(JSON.stringify(home)).not.toContain("Vi använder cookies");
    // Hero background image detected.
    expect(home.hero.blocks.some((b) => b.type === "media" && b.media.src.endsWith("/img/hero.jpg"))).toBe(true);
  });

  it("captures navigation, inline-SVG logo screenshot, palette and facts", () => {
    const home = pages.find((p) => p.path === "/")!;
    expect(home.source!.nav.map((l) => l.label)).toEqual(expect.arrayContaining(["Hem", "Tjänster", "Om oss", "Kontakt", "Begär offert"]));
    expect(home.logoPng?.byteLength).toBeGreaterThan(100);
    expect(home.source!.logo?.role).toBe("logo");
    expect(home.source!.palette[0]).toBe("#0b6e4f");
    const facts = home.source!.facts;
    expect(facts.organizationName).toBe("Byggfirma Ek AB");
    expect(facts.phones).toContain("+4681234567");
    expect(facts.emails).toContain("info@byggfirmaek.se");
    expect(facts.addresses.join(" ")).toContain("Storgatan 12");
    expect(facts.schemaTypes).toContain("GeneralContractor");
    expect(home.screenshot?.byteLength).toBeGreaterThan(5000);
  });

  it("extracts forms without hidden backend tokens and tables", () => {
    const contact = pages.find((p) => p.path === "/kontakt")!.source!;
    const form = [contact.hero, ...contact.sections].flatMap((s) => s.blocks).find((b) => b.type === "form");
    expect(form && form.type === "form" && form.form.fields.map((f) => f.name)).toEqual(["namn", "epost", "meddelande"]);
    expect(form && form.type === "form" && form.form.submitLabel).toBe("Skicka förfrågan");
    const services = pages.find((p) => p.path === "/tjanster")!.source!;
    const table = services.sections.flatMap((s) => s.blocks).find((b) => b.type === "table");
    expect(table && table.type === "table" && table.rows[1]).toEqual(["Badrum 4 m²", "145 000 kr"]);
  });

  it("downloads media through the guard and writes responsive variants", async () => {
    const home = pages.find((p) => p.path === "/")!.source!;
    const photo = pageMedia(home).find((m) => m.src.endsWith("/img/kok.jpg"))!;
    const written: string[] = [];
    const result = await processImage(photo.src, "proj/media-1", { put: async (path) => void written.push(path) }, opts);
    expect(result.width).toBe(1200);
    expect(result.variants.some((v) => v.format === "avif")).toBe(true);
    expect(result.variants.some((v) => v.format === "webp" && v.width === 960)).toBe(true);
    expect(result.placeholder).toMatch(/^data:image\/webp;base64,/);
    expect(written).toContain("proj/media-1/original.jpg");
  });
});
