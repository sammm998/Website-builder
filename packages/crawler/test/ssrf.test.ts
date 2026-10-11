import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertPublicUrl, assertUrlShape, BlockedUrlError, guardedAgent, isPublicAddress, safeFetch } from "../src";
import { startFixtureServer } from "./server";

describe("isPublicAddress", () => {
  it.each([
    ["8.8.8.8", true],
    ["93.184.216.34", true],
    ["2606:4700:4700::1111", true],
    ["127.0.0.1", false],
    ["10.1.2.3", false],
    ["172.16.0.1", false],
    ["192.168.1.1", false],
    ["169.254.169.254", false],
    ["100.64.0.1", false],
    ["0.0.0.0", false],
    ["224.0.0.1", false],
    ["255.255.255.255", false],
    ["::1", false],
    ["fc00::1", false],
    ["fe80::1", false],
    ["::ffff:127.0.0.1", false],
    ["::ffff:10.0.0.1", false],
    ["198.18.0.1", false],
    ["not-an-ip", false],
  ])("%s -> %s", (ip, expected) => expect(isPublicAddress(ip)).toBe(expected));
});

describe("assertUrlShape", () => {
  it.each([
    "ftp://example.com",
    "file:///etc/passwd",
    "http://user:pass@example.com",
    "http://localhost/",
    "http://LOCALHOST./",
    "http://intranet/",
    "http://foo.internal/",
    "http://printer.local/",
    "http://127.0.0.1/",
    "http://[::1]/",
    "http://169.254.169.254/latest/meta-data/",
    "https://example.com:8443/",
    "http://0x7f000001/",
    "http://2130706433/",
  ])("blocks %s", (url) => expect(() => assertUrlShape(url)).toThrow(BlockedUrlError));

  it("allows public https URLs", () => {
    expect(assertUrlShape("https://www.example.se/om-oss").hostname).toBe("www.example.se");
  });
});

describe("assertPublicUrl DNS checks", () => {
  it("rejects hostnames resolving to private addresses (DNS rebinding style)", async () => {
    await expect(assertPublicUrl("https://evil.example", { resolver: async () => ["93.184.216.34", "10.0.0.5"] })).rejects.toThrow(/non-public/);
    await expect(assertPublicUrl("https://evil.example", { resolver: async () => ["127.0.0.1"] })).rejects.toThrow(BlockedUrlError);
  });
  it("accepts hostnames with only public addresses", async () => {
    await expect(assertPublicUrl("https://ok.example", { resolver: async () => ["93.184.216.34"] })).resolves.toBeInstanceOf(URL);
  });
});

describe("network enforcement", () => {
  let fixture: Awaited<ReturnType<typeof startFixtureServer>>;
  beforeAll(async () => {
    fixture = await startFixtureServer();
  });
  afterAll(() => fixture.close());

  it("safeFetch refuses loopback targets", async () => {
    await expect(safeFetch(`${fixture.origin}/`)).rejects.toThrow(BlockedUrlError);
  });

  it("guarded agent blocks private addresses at connect time", async () => {
    const port = new URL(fixture.origin).port;
    const err = await fetch(`http://localhost:${port}/`, {
      // @ts-expect-error undici option
      dispatcher: guardedAgent(),
    }).catch((e: Error & { cause?: unknown }) => e.cause ?? e);
    expect(err).toBeInstanceOf(BlockedUrlError);
  });

  it("re-validates every redirect hop", async () => {
    // Even with private hosts allowed for the fixture itself, a redirect to the metadata IP must be
    // checked again; with allowPrivate=false the very first hop is already refused.
    await expect(safeFetch(`${fixture.origin}/redirect-internal`)).rejects.toThrow(BlockedUrlError);
  });

  it("enforces size limits", async () => {
    await expect(safeFetch(`${fixture.origin}/img/hero.jpg`, { allowPrivate: true, maxBytes: 1000 })).rejects.toThrow(/exceeded|too large/);
  });
});
