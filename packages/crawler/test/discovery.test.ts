import { describe, expect, it } from "vitest";
import { normalizePageUrl, parseRobots, robotsAllows } from "../src";

const start = new URL("https://www.firma.se/");

describe("normalizePageUrl", () => {
  it.each([
    ["https://www.firma.se/om-oss/", "https://www.firma.se/om-oss"],
    ["https://firma.se/om-oss#team", "https://www.firma.se/om-oss"],
    ["/kontakt?utm_source=x", "https://www.firma.se/kontakt"],
    ["/produkter?page=2", null],
    ["https://annan.se/", null],
    ["/broschyr.pdf", null],
    ["mailto:info@firma.se", null],
    ["/wp-admin/edit.php", null],
    ["https://www.firma.se", "https://www.firma.se/"],
  ])("%s -> %s", (input, expected) => expect(normalizePageUrl(input, start)).toBe(expected));
});

describe("robots", () => {
  const rules = parseRobots(`User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /admin\nDisallow: /*.pdf$\nAllow: /admin/public\nSitemap: https://www.firma.se/sitemap.xml`);
  it("uses the wildcard group and longest match", () => {
    expect(rules.sitemaps).toEqual(["https://www.firma.se/sitemap.xml"]);
    expect(robotsAllows(rules, "/")).toBe(true);
    expect(robotsAllows(rules, "/admin")).toBe(false);
    expect(robotsAllows(rules, "/admin/public/x")).toBe(true);
    expect(robotsAllows(rules, "/files/a.pdf")).toBe(false);
  });
});
