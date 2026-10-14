import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, BrowserContext } from "playwright";
import { extractRaw, guardedContext, launchBrowser, openPage, toSourcePage, sectionTextsOf } from "./helpers";
import { startFixtureServer } from "./server";

/** Page-builder patterns (WordPress/Elementor + a cookie platform) that used to break extraction. */
describe("extraction on a page-builder site with a cookie dialog", () => {
  let fixture: Awaited<ReturnType<typeof startFixtureServer>>;
  let browser: Browser;
  let context: BrowserContext;
  let source: ReturnType<typeof toSourcePage>;

  beforeAll(async () => {
    fixture = await startFixtureServer();
    browser = await launchBrowser({ executablePath: process.env["CHROMIUM_PATH"] ?? "/opt/pw-browsers/chromium" });
    context = await guardedContext(browser, { allowPrivate: true });
    const { page } = await openPage(context, `${fixture.origin}/wp-like`);
    source = toSourcePage(await extractRaw(page), `${fixture.origin}/wp-like`, null);
  }, 60_000);
  afterAll(async () => {
    await context?.close();
    await browser?.close();
    await fixture?.close();
  });

  it("takes the menu from the site header, not from the cookie dialog", () => {
    expect(source.nav.map((l) => l.label)).toEqual(["Hem", "Våra tjänster", "Om oss", "Kontakta oss"]);
  });

  it("keeps content hidden in accordions, tabs, details and entrance animations", () => {
    const text = [source.hero, ...source.sections].flatMap(sectionTextsOf).join(" | ");
    for (const t of [
      "Försäkrade städare med RUT-avdrag direkt på fakturan.",
      "Du bokar enkelt via formuläret eller på telefon 08-55 55 55.",
      "Ja, vi tar med allt material och miljömärkta medel.",
      "Avbokning är kostnadsfri fram till 24 timmar innan.",
      "Plus: varje vecka med fönsterputs.",
    ]) {
      expect(text).toContain(t);
    }
    expect(source.sections.map((s) => s.heading)).toEqual(expect.arrayContaining(["Därför God Service", "Vanliga frågor", "Våra paket"]));
  });

  it("leaves the cookie dialog out of the content", () => {
    expect(JSON.stringify(source)).not.toContain("Vi använder kakor");
    expect(JSON.stringify(source)).not.toContain("Googles sekretesspolicy");
  });
});
