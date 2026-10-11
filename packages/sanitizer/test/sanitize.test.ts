import { describe, expect, it } from "vitest";
import { sanitizeFragment, safeHref, textSegments, applyTextSegments } from "../src";

const MEDIA = "3f2b6a1e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
const ctx = { isKnownMedia: (id: string) => id === MEDIA, formKeys: new Set(["contact"]) };
const clean = (html: string) => sanitizeFragment(html, ctx);

describe("sanitizeFragment – XSS vectors", () => {
  const vectors = [
    `<script>alert(1)</script><p>ok</p>`,
    `<img src=x onerror=alert(1)>`,
    `<a href="javascript:alert(1)">x</a>`,
    `<a href="  java\tscript:alert(1)">x</a>`,
    `<a href="JaVaScRiPt:alert(1)">x</a>`,
    `<a href="data:text/html,<script>alert(1)</script>">x</a>`,
    `<a href="vbscript:msgbox(1)">x</a>`,
    `<svg><script>alert(1)</script></svg>`,
    `<svg onload=alert(1)></svg>`,
    `<svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>`,
    `<svg><use href="data:image/svg+xml,..."/></svg>`,
    `<svg><animate attributeName="href" to="javascript:alert(1)"/></svg>`,
    `<iframe src="javascript:alert(1)"></iframe>`,
    `<iframe srcdoc="<script>alert(1)</script>"></iframe>`,
    `<object data="x.swf"></object><embed src="x">`,
    `<style>body{background:url(javascript:alert(1))}</style>`,
    `<div style="background:url(javascript:alert(1))">x</div>`,
    `<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>`,
    `<form action="https://evil.example"><input name=a></form>`,
    `<button formaction="javascript:alert(1)">x</button>`,
    `<meta http-equiv="refresh" content="0;url=javascript:alert(1)">`,
    `<base href="https://evil.example/">`,
    `<div class="bg-[url(https://evil.example/x.png)]">x</div>`,
    `<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>`,
    `<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>`,
    `<template><script>alert(1)</script></template>`,
    `<details open ontoggle=alert(1)>`,
    `<video><source onerror=alert(1)></video>`,
    `<a href="//evil.example">x</a>`,
    `<a href="/\\evil.example">x</a>`,
  ];
  it.each(vectors)("neutralizes %s", (vector) => {
    const { html } = clean(vector);
    expect(html).not.toMatch(/<script|<style|<iframe|<object|<embed|<meta|<base|<math|<template/i);
    expect(html).not.toMatch(/\son[a-z]+=/i);
    expect(html).not.toMatch(/javascript:|vbscript:|data:text/i);
    expect(html).not.toMatch(/url\(https?:/i);
    expect(html).not.toMatch(/href="\/\//);
    expect(html).not.toMatch(/formaction|xlink:href|srcdoc/i);
  });

  it("escapes decoded text instead of re-emitting markup", () => {
    expect(clean(`<p>&lt;script&gt;x&lt;/script&gt;</p>`).html).toBe("<p>&lt;script&gt;x&lt;/script&gt;</p>");
  });
});

describe("sanitizeFragment – allowed content", () => {
  it("keeps semantic markup, tailwind classes and known media", () => {
    const r = clean(
      `<section class="relative grid md:grid-cols-[1.2fr_1fr] gap-8 bg-surface"><h2 class="font-display text-[clamp(2rem,5vw,4rem)]">Våra tjänster</h2><img src="media:${MEDIA}" alt="Kök"></section>`,
    );
    expect(r.html).toContain(`class="relative grid md:grid-cols-[1.2fr_1fr] gap-8 bg-surface"`);
    expect(r.html).toContain(`text-[clamp(2rem,5vw,4rem)]`);
    expect(r.html).toContain(`<img src="media:${MEDIA}" alt="Kök">`);
    expect(r.media).toEqual([MEDIA]);
    expect(r.text).toBe("Våra tjänster");
  });

  it("drops images that reference unknown or external media", () => {
    const r = clean(`<img src="https://cdn.example/x.jpg"><img src="media:00000000-0000-0000-0000-000000000000">`);
    expect(r.html).toBe("");
    expect(r.removed.length).toBeGreaterThan(0);
  });

  it("validates motion attributes and clamps params", () => {
    const r = clean(
      `<h1 data-motion="split-text reveal bogus" data-split-text-by="chars" data-reveal-distance="9999" data-reveal-ease="evil" data-x="1">Hej</h1>`,
    );
    expect(r.html).toBe(`<h1 data-motion="split-text reveal" data-split-text-by="chars" data-reveal-distance="240">Hej</h1>`);
    expect(r.motion.sort()).toEqual(["reveal", "split-text"]);
    expect(r.removed.join(" ")).toMatch(/bogus/);
  });

  it("adds rel to blank targets and keeps internal paths, mailto and tel", () => {
    const r = clean(
      `<a href="/kontakt">K</a><a href="mailto:info@firma.se">M</a><a href="tel:+46701234567">T</a><a href="https://x.se" target="_blank">X</a>`,
    );
    expect(r.html).toContain(`href="/kontakt"`);
    expect(r.html).toContain(`href="mailto:info@firma.se"`);
    expect(r.html).toContain(`href="tel:+46701234567"`);
    expect(r.html).toContain(`target="_blank" rel="noopener noreferrer"`);
    expect(r.links).toHaveLength(4);
  });

  it("allows allowlisted embeds with forced sandbox", () => {
    const r = clean(`<iframe src="https://www.youtube-nocookie.com/embed/abc"></iframe><iframe src="https://evil.example/embed"></iframe>`);
    expect(r.html.match(/<iframe/g)).toHaveLength(1);
    expect(r.html).toContain(`sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"`);
  });

  it("only accepts form placeholders for known form keys", () => {
    expect(clean(`<form action="form:contact"><input type="email" name="email" required></form>`).html).toBe(
      `<form action="form:contact" method="post"><input type="email" name="email" required></form>`,
    );
    expect(clean(`<form action="form:other"><input name="a"></form>`).html).toBe(`<input name="a">`);
  });

  it("keeps a safe svg subset with camelCase attributes", () => {
    const r = clean(`<svg viewBox="0 0 10 10"><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient><path d="M0 0L10 10" fill="url(#g)"/></svg>`);
    expect(r.html).toContain(`viewBox="0 0 10 10"`);
    expect(r.html).toContain(`<linearGradient id="g">`);
    expect(r.html).toContain(`fill="url(#g)"`);
  });

  it("forces muted + playsinline on autoplay video", () => {
    expect(clean(`<video src="media:${MEDIA}" autoplay loop></video>`).html).toBe(
      `<video src="media:${MEDIA}" autoplay loop muted playsinline></video>`,
    );
  });
});

describe("safeHref", () => {
  it.each([
    ["https://a.se/x?y=1", "https://a.se/x?y=1"],
    ["/om-oss#team", "/om-oss#team"],
    ["#kontakt", "#kontakt"],
    ["https://user:pass@a.se", null],
    ["ftp://a.se", null],
    ["", null],
  ])("%s -> %s", (input, expected) => expect(safeHref(input)).toBe(expected));
});

describe("translation segments", () => {
  it("round-trips structure and replaces text + alt in order", () => {
    const html = `<section class="a"><h2 data-motion="reveal">Hej världen</h2><img src="media:${MEDIA}" alt="Ett kök"><p> Vi bygger <strong>kök</strong>. </p></section>`;
    const sanitized = clean(html).html;
    const segs = textSegments(sanitized);
    expect(segs).toEqual(["Hej världen", "Ett kök", "Vi bygger", "kök", "."]);
    const out = applyTextSegments(sanitized, ["Hello world", "A kitchen", "We build", "kitchens", "."]);
    expect(out).toBe(
      `<section class="a"><h2 data-motion="reveal">Hello world</h2><img src="media:${MEDIA}" alt="A kitchen"><p> We build <strong>kitchens</strong>. </p></section>`,
    );
    expect(() => applyTextSegments(sanitized, ["x"])).toThrow(/segments/);
  });
});
