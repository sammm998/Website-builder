import type { DesignSystem, Direction, SourcePage } from "@redesign/schema";

/**
 * Deterministic fixtures shared by tests, the fake AI provider and local demos.
 * The source page mirrors packages/crawler/test/fixtures/site (a Swedish construction company).
 */

export const MEDIA = {
  hero: "11111111-1111-4111-8111-111111111111",
  kok: "22222222-2222-4222-8222-222222222222",
  badrum: "33333333-3333-4333-8333-333333333333",
  tillbyggnad: "44444444-4444-4444-8444-444444444444",
  logo: "55555555-5555-4555-8555-555555555555",
} as const;

export const ORIGIN = "https://www.byggfirmaek.se";

export const sampleSourcePage: SourcePage = {
  version: 1,
  url: `${ORIGIN}/`,
  path: "/",
  lang: "sv",
  title: "Byggfirma Ek – Totalentreprenad i Stockholm",
  description: "Vi bygger om kök, badrum och hela hus i Stockholm sedan 1998.",
  canonical: `${ORIGIN}/`,
  hreflang: [],
  og: { "og:site_name": "Byggfirma Ek" },
  robots: "",
  logo: { src: `${ORIGIN}/__redesign/logo.png`, mediaId: MEDIA.logo, alt: "", width: 140, height: 40, kind: "image", role: "logo" },
  nav: [
    { label: "Hem", href: `${ORIGIN}/`, internal: true, primary: false },
    { label: "Tjänster", href: `${ORIGIN}/tjanster`, internal: true, primary: false },
    { label: "Om oss", href: `${ORIGIN}/om-oss`, internal: true, primary: false },
    { label: "Kontakt", href: `${ORIGIN}/kontakt`, internal: true, primary: false },
    { label: "Begär offert", href: `${ORIGIN}/kontakt`, internal: true, primary: true },
  ],
  hero: {
    heading: "Vi bygger hem som håller i generationer",
    blocks: [
      { type: "media", media: { src: `${ORIGIN}/img/hero.jpg`, mediaId: MEDIA.hero, alt: "", width: 1600, height: 900, kind: "image", role: "background" } },
      { type: "paragraph", text: "Totalentreprenad för kök, badrum och tillbyggnader i hela Stockholmsområdet. Fast pris, egna hantverkare och tio års garanti." },
      {
        type: "links",
        links: [
          { label: "Boka hembesök", href: `${ORIGIN}/kontakt`, internal: true, primary: true },
          { label: "Se våra tjänster", href: `${ORIGIN}/tjanster`, internal: true, primary: false },
        ],
      },
    ],
  },
  sections: [
    {
      heading: "Våra tjänster",
      blocks: [
        { type: "paragraph", text: "Från första skiss till sista penseldrag." },
        { type: "media", media: { src: `${ORIGIN}/img/kok.jpg`, mediaId: MEDIA.kok, alt: "Nyrenoverat kök i ek", width: 1200, height: 800, kind: "image", role: "photo" } },
        { type: "heading", level: 3, text: "Köksrenovering" },
        { type: "paragraph", text: "Vi river, bygger och installerar – du får nycklarna till ett färdigt kök." },
        { type: "media", media: { src: `${ORIGIN}/img/badrum.jpg`, mediaId: MEDIA.badrum, alt: "Kaklat badrum", width: 1200, height: 800, kind: "image", role: "photo" } },
        { type: "heading", level: 3, text: "Badrum" },
        { type: "paragraph", text: "Våtrumscertifierade enligt BKR. Alltid med intyg." },
        { type: "media", media: { src: `${ORIGIN}/img/tillbyggnad.jpg`, mediaId: MEDIA.tillbyggnad, alt: "Tillbyggnad i trä", width: 1200, height: 800, kind: "image", role: "photo" } },
        { type: "heading", level: 3, text: "Tillbyggnader" },
        { type: "paragraph", text: "Mer plats utan att flytta." },
      ],
    },
    {
      heading: "Därför väljer kunder oss",
      blocks: [
        { type: "list", ordered: false, items: ["Fast pris utan överraskningar", "Egna snickare – inga underentreprenörer", "10 års garanti på allt arbete"] },
        { type: "paragraph", text: "Över 1 200 genomförda projekt sedan 1998." },
      ],
    },
    {
      heading: "Det säger våra kunder",
      blocks: [{ type: "quote", text: "Fantastiskt jobb med vårt kök, allt blev klart i tid.", cite: "Anna, Bromma" }],
    },
  ],
  footer: {
    heading: "",
    blocks: [
      { type: "heading", level: 4, text: "Byggfirma Ek AB" },
      { type: "paragraph", text: "Storgatan 12, 111 22 Stockholm" },
      { type: "paragraph", text: "Telefon: 08-123 45 67" },
      { type: "paragraph", text: "E-post: info@byggfirmaek.se" },
      { type: "links", links: [{ label: "Instagram", href: "https://www.instagram.com/byggfirmaek/", internal: false, primary: false }] },
      { type: "paragraph", text: "© 2026 Byggfirma Ek AB. Org.nr 556000-0000" },
    ],
  },
  facts: {
    organizationName: "Byggfirma Ek AB",
    phones: ["+4681234567"],
    emails: ["info@byggfirmaek.se"],
    addresses: ["Storgatan 12, 111 22, Stockholm"],
    socials: ["https://www.instagram.com/byggfirmaek/"],
    schemaTypes: ["GeneralContractor", "PostalAddress"],
    openingHours: ["Mo-Fr 07:00-16:00"],
  },
  palette: ["#0b6e4f", "#222222", "#ffffff"],
  fonts: ["Georgia"],
  wordCount: 120,
  headings: [
    { level: 1, text: "Vi bygger hem som håller i generationer" },
    { level: 2, text: "Våra tjänster" },
  ],
  jsonLd: [
    { "@context": "https://schema.org", "@type": "GeneralContractor", name: "Byggfirma Ek AB" },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [{ "@type": "Question", name: "Har ni garanti?", acceptedAnswer: { "@type": "Answer", text: "Ja, tio år." } }] },
  ],
};

export const sampleDesignSystem: DesignSystem = {
  name: "Nordisk ek",
  mode: "dark",
  colors: {
    bg: "#0e0f0c",
    surface: "#171914",
    "surface-2": "#22251d",
    fg: "#f3efe6",
    muted: "#a9a597",
    line: "#2f3328",
    accent: "#c8f169",
    "accent-fg": "#0e0f0c",
    brand: "#0b6e4f",
  },
  typography: {
    display: "fraunces",
    body: "inter-tight",
    displayWeight: 400,
    bodyWeight: 400,
    displayTracking: "tight",
    displayCase: "normal",
    scale: 1.3,
    baseSize: 17,
  },
  shape: { radius: "xl", borderWidth: 1 },
  layout: { container: 1320, sectionSpacing: "airy", gutter: "normal" },
  motion: { personality: "cinematic", smoothScroll: true, intensity: 0.75, cursor: "ring", pageTransition: "curtain" },
  texture: { grain: true, accents: "gradients" },
};

const header = `<header class="fixed inset-x-0 top-0 z-50 transition-all duration-500 scrolled:bg-bg/80 scrolled:backdrop-blur-xl scroll-down:-translate-y-full">
  <div class="container-site flex h-20 items-center justify-between gap-8">
    <a href="/" class="flex items-center" aria-label="Byggfirma Ek – startsida"><img src="media:${MEDIA.logo}" alt="Byggfirma Ek" class="h-8 w-auto"></a>
    <nav class="hidden items-center gap-8 text-small lg:flex" aria-label="Huvudmeny">
      <a href="/" class="btn-ghost">Hem</a><a href="/tjanster" class="btn-ghost">Tjänster</a><a href="/om-oss" class="btn-ghost">Om oss</a><a href="/kontakt" class="btn-ghost">Kontakt</a>
    </nav>
    <div class="flex items-center gap-4"><div data-lang-switch class="hidden md:flex"></div><a href="/kontakt" class="btn btn-primary hidden sm:inline-flex" data-motion="magnetic">Begär offert</a>
    <button type="button" class="lg:hidden" data-toggle="menu" data-target="mobile-menu" aria-label="Meny"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 7h18M3 17h18"/></svg></button></div>
  </div>
  <div id="mobile-menu" class="hidden open:flex flex-col gap-6 bg-bg px-6 pb-10 pt-4 text-h3 heading lg:hidden"><a href="/">Hem</a><a href="/tjanster">Tjänster</a><a href="/om-oss">Om oss</a><a href="/kontakt">Kontakt</a></div>
  <div data-motion="scroll-progress"></div>
</header>`;

const footer = `<footer class="relative overflow-hidden border-t border-line section-y-sm">
  <div class="container-site grid gap-12 md:grid-cols-[2fr_1fr_1fr]">
    <div><h4 class="heading text-h2 max-w-md" data-motion="split-text">Byggfirma Ek AB</h4><p class="mt-6 text-muted">Storgatan 12, 111 22 Stockholm</p></div>
    <div class="space-y-2"><p>Telefon: <a href="tel:+4681234567" class="btn-ghost">08-123 45 67</a></p><p>E-post: <a href="mailto:info@byggfirmaek.se" class="btn-ghost">info@byggfirmaek.se</a></p></div>
    <div><a href="https://www.instagram.com/byggfirmaek/" target="_blank" class="btn btn-secondary">Instagram</a></div>
  </div>
  <p class="container-site mt-16 text-small text-muted">© 2026 Byggfirma Ek AB. Org.nr 556000-0000</p>
</footer>`;

export const sampleDirection: Direction = {
  name: "Nordisk ek",
  rationale: "Mörk, filmisk riktning med varm serif och limegrön accent som lyfter hantverket.",
  designSystem: sampleDesignSystem,
  headerHtml: header,
  footerHtml: footer,
  sections: [
    {
      sourceIndex: -1,
      archetype: "hero",
      html: `<section class="relative isolate flex min-h-svh items-end overflow-hidden pb-[12vh] pt-40" data-motion="webgl-gradient" data-webgl-gradient-intensity="0.5">
  <div class="absolute inset-0 -z-10 opacity-60"><img src="media:${MEDIA.hero}" alt="" class="h-full w-full object-cover" data-motion="scale-scroll" data-scale-scroll-from="1.15" data-scale-scroll-to="1"></div>
  <div class="absolute inset-0 -z-10 bg-gradient-to-t from-bg via-bg/40 to-transparent"></div>
  <div class="container-site">
    <h1 class="heading text-display-1 max-w-[14ch]" data-motion="split-text" data-split-text-by="words" data-split-text-style="rise">Vi bygger hem som håller i generationer</h1>
    <div class="mt-10 grid gap-8 md:grid-cols-[1fr_auto] md:items-end">
      <p class="max-w-xl text-lead text-muted" data-motion="reveal" data-reveal-delay="0.4">Totalentreprenad för kök, badrum och tillbyggnader i hela Stockholmsområdet. Fast pris, egna hantverkare och tio års garanti.</p>
      <div class="flex flex-wrap gap-4" data-motion="reveal" data-reveal-delay="0.6"><a href="/kontakt" class="btn btn-primary" data-motion="magnetic">Boka hembesök</a><a href="/tjanster" class="btn btn-secondary">Se våra tjänster</a></div>
    </div>
  </div>
</section>`,
    },
    {
      sourceIndex: 0,
      archetype: "cards",
      html: `<section class="section-y">
  <div class="container-site">
    <div class="flex flex-col justify-between gap-6 md:flex-row md:items-end"><h2 class="heading text-h1" data-motion="split-text" data-split-text-style="rise">Våra tjänster</h2><p class="max-w-sm text-muted" data-motion="reveal">Från första skiss till sista penseldrag.</p></div>
    <div class="mt-16 grid gap-6 md:grid-cols-3" data-motion="stagger">
      <article class="card group overflow-hidden" data-motion="tilt-3d" data-tilt-3d-max="6"><div class="media-frame aspect-[4/5] rounded-none"><img src="media:${MEDIA.kok}" alt="Nyrenoverat kök i ek" class="h-full w-full object-cover" data-motion="image-hover-zoom"></div><div class="p-8"><h3 class="heading text-h3">Köksrenovering</h3><p class="mt-3 text-muted">Vi river, bygger och installerar – du får nycklarna till ett färdigt kök.</p></div></article>
      <article class="card group overflow-hidden md:translate-y-16" data-motion="tilt-3d" data-tilt-3d-max="6"><div class="media-frame aspect-[4/5] rounded-none"><img src="media:${MEDIA.badrum}" alt="Kaklat badrum" class="h-full w-full object-cover" data-motion="image-hover-zoom"></div><div class="p-8"><h3 class="heading text-h3">Badrum</h3><p class="mt-3 text-muted">Våtrumscertifierade enligt BKR. Alltid med intyg.</p></div></article>
      <article class="card group overflow-hidden" data-motion="tilt-3d" data-tilt-3d-max="6"><div class="media-frame aspect-[4/5] rounded-none"><img src="media:${MEDIA.tillbyggnad}" alt="Tillbyggnad i trä" class="h-full w-full object-cover" data-motion="image-hover-zoom"></div><div class="p-8"><h3 class="heading text-h3">Tillbyggnader</h3><p class="mt-3 text-muted">Mer plats utan att flytta.</p></div></article>
    </div>
  </div>
</section>`,
    },
    {
      sourceIndex: 1,
      archetype: "stats",
      html: `<section class="section-y bg-accent text-accent-fg" data-motion="bg-shift" data-bg-shift-tone="accent">
  <div class="container-site grid gap-16 lg:grid-cols-2">
    <h2 class="heading text-display-2" data-motion="split-text" data-split-text-by="lines">Därför väljer kunder oss</h2>
    <div><ul class="divide-y divide-accent-fg/20 border-y border-accent-fg/20 text-h4" data-motion="stagger"><li class="py-6">Fast pris utan överraskningar</li><li class="py-6">Egna snickare – inga underentreprenörer</li><li class="py-6">10 års garanti på allt arbete</li></ul>
    <p class="mt-10 text-lead">Över <span class="heading text-h1" data-motion="counter">1 200</span> genomförda projekt sedan 1998.</p></div>
  </div>
</section>`,
    },
    {
      sourceIndex: 2,
      archetype: "testimonial",
      html: `<section class="section-y">
  <h2 class="eyebrow container-site mb-10 text-center" data-motion="reveal">Det säger våra kunder</h2>
  <figure class="container-site max-w-5xl text-center"><blockquote class="heading text-h1" data-motion="text-highlight">Fantastiskt jobb med vårt kök, allt blev klart i tid.</blockquote><figcaption class="eyebrow mt-10">Anna, Bromma</figcaption></figure>
</section>`,
    },
  ],
};

/** Media metadata for rendering fixtures (URLs are placeholders; tests may override them). */
export const sampleMedia = [
  { id: MEDIA.hero, width: 1600, height: 900, alt: "" },
  { id: MEDIA.kok, width: 1200, height: 800, alt: "Nyrenoverat kök i ek" },
  { id: MEDIA.badrum, width: 1200, height: 800, alt: "Kaklat badrum" },
  { id: MEDIA.tillbyggnad, width: 1200, height: 800, alt: "Tillbyggnad i trä" },
  { id: MEDIA.logo, width: 280, height: 80, alt: "Byggfirma Ek" },
];
