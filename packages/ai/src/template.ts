import { escapeAttr, escapeText } from "@redesign/sanitizer";
import type { Archetype, DesignSystem } from "@redesign/schema";
import type { PromptSection } from "./content";

/**
 * Deterministic section composer. Used by the fake provider (tests, local development without an API
 * key) and as a content-complete fallback. It renders every source block verbatim with the design
 * system utilities and motion vocabulary, choosing an archetype from the content shape.
 */

type B = PromptSection["blocks"][number];
const isImage = (b: B): b is Extract<B, { image: string }> => "image" in b;
const isP = (b: B): b is Extract<B, { p: string }> => "p" in b;

const t = escapeText;
const a = escapeAttr;

function links(block: Extract<B, { links: unknown }>, hero = false): string {
  return `<div class="mt-8 flex flex-wrap items-center gap-4"${hero ? ' data-motion="reveal" data-reveal-delay="0.5"' : ""}>${block.links
    .map((l, i) => {
      const external = /^https?:/.test(l.href);
      const cls = l.primary || (hero && i === 0) ? "btn btn-primary" : hero ? "btn btn-secondary" : "btn-ghost";
      return `<a href="${a(l.href)}" class="${cls}"${l.primary ? ' data-motion="magnetic"' : ""}${external ? ' target="_blank"' : ""}>${t(l.label)}</a>`;
    })
    .join("")}</div>`;
}

function block(b: B, opts: { hero?: boolean } = {}): string {
  if ("heading" in b) return `<h3 class="heading text-h3 mt-10">${t(b.heading)}</h3>`;
  if (isP(b)) return `<p class="${opts.hero ? "text-lead text-muted max-w-2xl" : "text-muted"}">${t(b.p)}</p>`;
  if ("list" in b) {
    const tag = b.ordered ? "ol" : "ul";
    return `<${tag} class="mt-6 divide-y divide-line border-y border-line" data-motion="stagger">${b.list.map((item, i) => `<li class="flex gap-6 py-5 text-lead"><span class="eyebrow pt-1">${String(i + 1).padStart(2, "0")}</span><span>${t(item)}</span></li>`).join("")}</${tag}>`;
  }
  if ("quote" in b) return `<figure class="my-10"><blockquote class="heading text-h2" data-motion="text-highlight">${t(b.quote)}</blockquote>${b.cite ? `<figcaption class="eyebrow mt-6">${t(b.cite)}</figcaption>` : ""}</figure>`;
  if (isImage(b)) {
    if (b.role === "icon" || b.role === "badge" || b.role === "logo" || b.role === "avatar") {
      return `<img src="${a(b.image)}" alt="${a(b.alt)}" class="h-12 w-auto">`;
    }
    return `<div class="media-frame aspect-[4/3] mt-8" data-motion="clip-reveal"><img src="${a(b.image)}" alt="${a(b.alt)}" class="h-full w-full object-cover" data-motion="parallax" data-parallax-speed="0.15"></div>`;
  }
  if ("video" in b) return `<div class="media-frame aspect-video mt-8"><video src="${a(b.video)}" autoplay muted loop playsinline class="h-full w-full object-cover"></video></div>`;
  if ("links" in b) return links(b, opts.hero);
  if ("form" in b) {
    const fields = b.fields
      .map((f) => {
        const label = f.label || f.placeholder || f.name;
        const id = `f-${f.name}`.replace(/[^\w-]/g, "-");
        const control =
          f.type === "textarea"
            ? `<textarea id="${a(id)}" name="${a(f.name)}"${f.placeholder ? ` placeholder="${a(f.placeholder)}"` : ""}${f.required ? " required" : ""}></textarea>`
            : f.type === "select"
              ? `<select id="${a(id)}" name="${a(f.name)}"${f.required ? " required" : ""}>${f.options.map((o) => `<option>${t(o)}</option>`).join("")}</select>`
              : `<input id="${a(id)}" type="${a(f.type)}" name="${a(f.name)}"${f.placeholder ? ` placeholder="${a(f.placeholder)}"` : ""}${f.required ? " required" : ""}>`;
        return `<div class="grid gap-2"><label for="${a(id)}" class="text-small text-muted">${t(label)}</label>${control}</div>`;
      })
      .join("");
    return `<form action="${a(b.form)}" class="card mt-8 grid gap-5 p-8">${fields}<button type="submit" class="btn btn-primary justify-self-start" data-motion="magnetic">${t(b.submit || "Skicka")}</button></form>`;
  }
  if ("embed" in b) return `<div class="media-frame aspect-video mt-8"><iframe src="${a(b.embed)}" title="${a(b.title || b.kind)}" class="h-full w-full"></iframe></div>`;
  if ("table" in b) {
    const [head, ...rows] = b.header ? b.table : [undefined, ...b.table];
    return `<div class="mt-8 overflow-x-auto"><table>${head ? `<thead><tr>${head.map((c) => `<th>${t(c)}</th>`).join("")}</tr></thead>` : ""}<tbody>${rows.map((r) => `<tr>${(r ?? []).map((c) => `<td>${t(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }
  return "";
}

function chooseArchetype(s: PromptSection): Archetype {
  const images = s.blocks.filter((b) => isImage(b) && b.role === "photo").length;
  const subheads = s.blocks.filter((b) => "heading" in b).length;
  if (s.blocks.some((b) => "form" in b)) return "contact";
  if (s.blocks.some((b) => "quote" in b)) return "testimonial";
  if (images >= 2 && subheads >= 2) return "cards";
  if (images >= 3) return "gallery";
  if (s.blocks.some((b) => "list" in b)) return "feature-list";
  if (images === 1) return "split";
  if (s.blocks.filter(isP).join(" ").length < 220 && s.heading) return "statement";
  return "text";
}

/** Groups a section's blocks into cards: each sub-heading starts a card with the image before it. */
function cardGroups(blocks: B[]): B[][] {
  const groups: B[][] = [];
  let pending: B[] = [];
  const intro: B[] = [];
  for (const b of blocks) {
    if (!groups.length && !pending.length && !isImage(b) && !("heading" in b)) {
      intro.push(b);
      continue;
    }
    if (isImage(b) && b.role === "photo") {
      pending.push(b);
      continue;
    }
    if ("heading" in b) {
      groups.push([...pending, b]);
      pending = [];
      continue;
    }
    if (groups.length) groups[groups.length - 1]!.push(b);
    else pending.push(b);
  }
  if (pending.length) groups.push(pending);
  return intro.length ? [intro, ...groups] : groups;
}

export function templateHero(s: PromptSection, ds: DesignSystem): string {
  const bg = s.blocks.find((b) => isImage(b) && (b.role === "photo" || b.role === "background")) as Extract<B, { image: string }> | undefined;
  const rest = s.blocks.filter((b) => b !== bg);
  const webgl = ds.motion.personality === "cinematic" ? "webgl-gradient" : ds.motion.personality === "kinetic" ? "webgl-particles" : "";
  return `<section class="relative isolate flex min-h-[92svh] items-end overflow-hidden pb-[10vh] pt-40"${webgl ? ` data-motion="${webgl}"` : ""}>
${bg ? `<div class="absolute inset-0 -z-10"><img src="${a(bg.image)}" alt="${a(bg.alt)}" class="h-full w-full object-cover opacity-70" data-motion="scale-scroll"></div><div class="absolute inset-0 -z-10 bg-gradient-to-t from-bg via-bg/50 to-bg/10"></div>` : ""}
<div class="container-site">
${s.heading ? `<h1 class="heading text-display-1 max-w-[16ch]" data-motion="split-text" data-split-text-by="words">${t(s.heading)}</h1>` : ""}
<div class="mt-10 grid gap-6" data-motion="reveal" data-reveal-delay="0.3">${rest.map((b) => block(b, { hero: true })).join("")}</div>
</div>
</section>`;
}

export function templateSection(s: PromptSection, index: number): { archetype: Archetype; html: string } {
  const archetype = chooseArchetype(s);
  const heading = s.heading ? `<h2 class="heading text-h1 max-w-[18ch]" data-motion="split-text" data-split-text-style="rise">${t(s.heading)}</h2>` : "";
  const tone = index % 3 === 1 ? " bg-surface" : "";
  if (archetype === "cards") {
    const groups = cardGroups(s.blocks);
    const intro = groups[0] && !groups[0].some((b) => "heading" in b) ? groups.shift()! : [];
    return {
      archetype,
      html: `<section class="section-y${tone}"><div class="container-site">${heading}<div class="mt-6 max-w-xl">${intro.map((b) => block(b)).join("")}</div>
<div class="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3" data-motion="stagger">${groups
        .map((g) => {
          const img = g.find((b) => isImage(b)) as Extract<B, { image: string }> | undefined;
          return `<article class="card overflow-hidden" data-motion="tilt-3d" data-tilt-3d-max="6">${img ? `<div class="aspect-[4/3] overflow-hidden"><img src="${a(img.image)}" alt="${a(img.alt)}" class="h-full w-full object-cover" data-motion="image-hover-zoom"></div>` : ""}<div class="p-8">${g
            .filter((b) => b !== img)
            .map((b) => ("heading" in b ? `<h3 class="heading text-h3">${t(b.heading)}</h3>` : block(b)))
            .join("")}</div></article>`;
        })
        .join("")}</div></div></section>`,
    };
  }
  if (archetype === "split") {
    const img = s.blocks.find((b) => isImage(b) && b.role === "photo") as Extract<B, { image: string }>;
    const rest = s.blocks.filter((b) => b !== img);
    const flip = index % 2 === 1;
    return {
      archetype,
      html: `<section class="section-y${tone}"><div class="container-site grid items-center gap-12 lg:grid-cols-2">
<div class="${flip ? "lg:order-2" : ""}" data-motion="reveal">${heading}<div class="mt-8 grid gap-4">${rest.map((b) => block(b)).join("")}</div></div>
<div class="media-frame aspect-[4/5]" data-motion="clip-reveal" data-clip-reveal-shape="inset"><img src="${a(img.image)}" alt="${a(img.alt)}" class="h-full w-full object-cover" data-motion="scale-scroll" data-scale-scroll-from="1.2"></div>
</div></section>`,
    };
  }
  if (archetype === "statement") {
    return {
      archetype,
      html: `<section class="section-y bg-fg text-bg" data-motion="bg-shift" data-bg-shift-tone="fg"><div class="container-site grid gap-10 lg:grid-cols-[1fr_1.4fr]">${heading.replace("text-h1", "text-display-2")}<div class="grid content-end gap-6 text-lead">${s.blocks.map((b) => block(b).replace("text-muted", "")).join("")}</div></div></section>`,
    };
  }
  if (archetype === "gallery") {
    const imgs = s.blocks.filter((b) => isImage(b) && b.role === "photo") as Extract<B, { image: string }>[];
    const rest = s.blocks.filter((b) => !imgs.includes(b as never));
    return {
      archetype,
      html: `<section class="section-y overflow-hidden"><div class="container-site">${heading}<div class="mt-6 max-w-2xl grid gap-4">${rest.map((b) => block(b)).join("")}</div></div>
<div class="container-site mt-14 grid grid-cols-2 gap-4 md:grid-cols-3" data-motion="stagger">${imgs.map((img, i) => `<div class="media-frame ${i % 3 === 0 ? "row-span-2 aspect-[3/4]" : "aspect-square"}"><img src="${a(img.image)}" alt="${a(img.alt)}" class="h-full w-full object-cover" data-motion="image-hover-zoom"></div>`).join("")}</div></section>`,
    };
  }
  return {
    archetype,
    html: `<section class="section-y${tone}"><div class="container-site grid gap-12 lg:grid-cols-[0.8fr_1.2fr]"><div class="lg:sticky lg:top-28 lg:self-start">${heading}</div><div class="prose-site grid gap-4" data-motion="reveal">${s.blocks.map((b) => block(b)).join("")}</div></div></section>`,
  };
}

export function templateHeader(nav: { label: string; href: string; primary: boolean }[], logo: string | null, brand: string): string {
  const items = nav.filter((l) => !l.primary);
  const cta = nav.find((l) => l.primary);
  const linksHtml = items.map((l) => `<a href="${a(l.href)}" class="btn-ghost">${t(l.label)}</a>`).join("");
  return `<header class="fixed inset-x-0 top-0 z-50 transition-all duration-500 scrolled:bg-bg/85 scrolled:backdrop-blur-xl scroll-down:-translate-y-full">
<div class="container-site flex h-20 items-center justify-between gap-6">
<a href="/" class="flex items-center gap-3" aria-label="${a(brand)}">${logo ? `<img src="${a(logo)}" alt="${a(brand)}" class="h-9 w-auto">` : `<span class="heading text-h4">${t(brand)}</span>`}</a>
<nav class="hidden items-center gap-8 text-small lg:flex" aria-label="Meny">${linksHtml}</nav>
<div class="flex items-center gap-4"><div data-lang-switch class="hidden md:flex"></div>${cta ? `<a href="${a(cta.href)}" class="btn btn-primary hidden sm:inline-flex" data-motion="magnetic">${t(cta.label)}</a>` : ""}
<button type="button" class="lg:hidden" data-toggle="menu" data-target="mobile-menu" aria-label="Meny"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 8h18M3 16h18"/></svg></button></div>
</div>
<nav id="mobile-menu" class="hidden open:flex flex-col gap-5 bg-bg px-6 pb-10 pt-4 heading text-h3 lg:hidden" aria-label="Mobilmeny">${items.map((l) => `<a href="${a(l.href)}">${t(l.label)}</a>`).join("")}${cta ? `<a href="${a(cta.href)}">${t(cta.label)}</a>` : ""}</nav>
<div data-motion="scroll-progress"></div>
</header>`;
}

export function templateFooter(footer: PromptSection): string {
  return `<footer class="border-t border-line section-y-sm"><div class="container-site grid gap-6 md:grid-cols-2">${footer.blocks.map((b) => block(b)).join("")}</div></footer>`;
}
