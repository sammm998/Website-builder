import { describe, expect, it } from "vitest";
import { appOrigin, isAppHost, sitesSubdomainSlug } from "./hosts";

const railway = { RAILWAY_PUBLIC_DOMAIN: "redesignweb-production.up.railway.app" };

describe("hosts", () => {
  it("treats the Railway domain as the app, not as a customer domain", () => {
    expect(isAppHost("redesignweb-production.up.railway.app", railway)).toBe(true);
    expect(isAppHost("redesignweb-production.up.railway.app", {})).toBe(true);
    expect(isAppHost("localhost:3000", {})).toBe(true);
    expect(isAppHost("[::1]:3000", {})).toBe(true);
  });

  it("treats the configured origin as the app and other hosts as customer domains", () => {
    const env = { APP_ORIGIN: "https://redesign.se/" };
    expect(isAppHost("redesign.se", env)).toBe(true);
    expect(isAppHost("REDESIGN.SE.", env)).toBe(true);
    expect(isAppHost("kund.se", env)).toBe(false);
  });

  it("derives the origin from Railway when APP_ORIGIN is unset", () => {
    expect(appOrigin(railway)).toBe("https://redesignweb-production.up.railway.app");
    expect(appOrigin({ ...railway, APP_ORIGIN: "https://redesign.se/" })).toBe("https://redesign.se");
    expect(appOrigin({})).toBe("http://localhost:3000");
  });

  it("extracts site slugs from <slug>.<SITES_DOMAIN>", () => {
    const env = { SITES_DOMAIN: "sites.redesign.se" };
    expect(sitesSubdomainSlug("cafe-bla.sites.redesign.se", env)).toBe("cafe-bla");
    expect(sitesSubdomainSlug("a.b.sites.redesign.se", env)).toBeNull();
    expect(sitesSubdomainSlug("cafe.sites.redesign.se", {})).toBeNull();
  });
});
