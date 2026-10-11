import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "@tailwindcss/node";
import { FONT_CATALOG, RADIUS_PX, SECTION_SPACING, type DesignSystem } from "@redesign/schema";
import { fontFaceCss } from "@redesign/fonts";
import { runtimeCss } from "@redesign/motion-runtime";


const TRACKING: Record<DesignSystem["typography"]["displayTracking"], string> = {
  tighter: "-0.045em",
  tight: "-0.025em",
  normal: "0em",
  wide: "0.04em",
};

const GUTTER: Record<DesignSystem["layout"]["gutter"], string> = {
  tight: "clamp(1rem, 3vw, 2rem)",
  normal: "clamp(1.25rem, 5vw, 4rem)",
  wide: "clamp(1.5rem, 7vw, 7rem)",
};

/** Fluid size: `min` at 375px viewport, `max` at 1440px. */
const fluid = (minPx: number, maxPx: number) => {
  const slope = (maxPx - minPx) / (1440 - 375);
  const intercept = minPx - slope * 375;
  return `clamp(${(minPx / 16).toFixed(3)}rem, ${(intercept / 16).toFixed(3)}rem + ${(slope * 100).toFixed(3)}vw, ${(maxPx / 16).toFixed(3)}rem)`;
};

/** Type scale derived from the design system (desktop sizes; mobile scales down fluidly). */
export function typeScale(ds: DesignSystem) {
  const { baseSize: b, scale: r } = ds.typography;
  const step = (n: number) => b * r ** n;
  return {
    "display-1": fluid(Math.max(44, step(4.2) * 0.62), Math.min(220, step(7.2))),
    "display-2": fluid(Math.max(38, step(3.6) * 0.62), Math.min(160, step(6))),
    h1: fluid(Math.max(34, step(3) * 0.7), step(5)),
    h2: fluid(Math.max(28, step(2.4) * 0.75), step(4)),
    h3: fluid(Math.max(22, step(1.8) * 0.8), step(2.6)),
    h4: fluid(Math.max(18, step(1.2) * 0.9), step(1.6)),
    lead: fluid(b * 1.08, step(1)),
    body: fluid(b * 0.95, b),
    small: fluid(b * 0.82, b * 0.875),
    eyebrow: fluid(11.5, 13),
  };
}

/**
 * Tailwind v4 entry CSS for a generated site. The design system becomes theme tokens and a small set
 * of semantic utilities (container-site, section-y, text-h1.., btn, card...) so every page and every
 * language shares one consistent system, while sections can still use any standard utility.
 */
export function tailwindEntry(ds: DesignSystem): string {
  const display = FONT_CATALOG[ds.typography.display];
  const body = FONT_CATALOG[ds.typography.body];
  const scale = typeScale(ds);
  const [spaceMin, spaceMax] = SECTION_SPACING[ds.layout.sectionSpacing];
  const radius = RADIUS_PX[ds.shape.radius];
  const c = ds.colors;
  return `
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities);

@theme static {
  --color-bg: ${c.bg};
  --color-surface: ${c.surface};
  --color-surface-2: ${c["surface-2"]};
  --color-fg: ${c.fg};
  --color-muted: ${c.muted};
  --color-line: ${c.line};
  --color-accent: ${c.accent};
  --color-accent-fg: ${c["accent-fg"]};
  --color-brand: ${c.brand};
  --font-display: "${display.family}", ${display.fallback};
  --font-body: "${body.family}", ${body.fallback};
  --radius-ds: ${radius};
  --container-site: ${ds.layout.container}px;
${Object.entries(scale)
  .map(([k, v]) => `  --text-${k}: ${v};`)
  .join("\n")}
  --text-display-1--line-height: 0.92;
  --text-display-2--line-height: 0.95;
  --text-h1--line-height: 1.02;
  --text-h2--line-height: 1.08;
  --text-h3--line-height: 1.15;
  --text-h4--line-height: 1.25;
  --text-lead--line-height: 1.5;
  --text-body--line-height: 1.65;
  --text-eyebrow--line-height: 1.2;
}

@custom-variant scrolled (&:where(html[data-scrolled] *));
@custom-variant scroll-down (&:where(html[data-scroll-dir="down"] *));
@custom-variant menu-open (&:where(html[data-menu-open] *));
@custom-variant open (&[data-open]);
@custom-variant step-active (&[data-active]);

@utility container-site {
  width: 100%;
  max-width: calc(var(--container-site) + 2 * ${GUTTER[ds.layout.gutter]});
  margin-inline: auto;
  padding-inline: ${GUTTER[ds.layout.gutter]};
}
@utility section-y { padding-block: clamp(${spaceMin}, 9vw, ${spaceMax}); }
@utility section-y-sm { padding-block: clamp(calc(${spaceMin} * .6), 6vw, calc(${spaceMax} * .6)); }
@utility heading {
  font-family: var(--font-display);
  font-weight: ${ds.typography.displayWeight};
  letter-spacing: ${TRACKING[ds.typography.displayTracking]};
  text-transform: ${ds.typography.displayCase === "uppercase" ? "uppercase" : "none"};
  text-wrap: balance;
}
@utility eyebrow {
  font-family: var(--font-body);
  font-size: var(--text-eyebrow);
  font-weight: 600;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: var(--color-muted);
}
@utility prose-site {
  max-width: 68ch;
  & p + p { margin-top: 1em; }
  & ul { list-style: disc; padding-left: 1.25em; }
  & ol { list-style: decimal; padding-left: 1.25em; }
  & li + li { margin-top: .35em; }
  & a { text-decoration: underline; text-underline-offset: .2em; }
}
@utility btn {
  display: inline-flex; align-items: center; justify-content: center; gap: .6em;
  min-height: 3rem; padding: .85em 1.5em;
  border-radius: ${ds.shape.radius === "none" ? "0px" : ds.shape.radius === "full" ? "9999px" : radius};
  font-family: var(--font-body); font-weight: 600; font-size: var(--text-small); letter-spacing: .01em;
  transition: transform .4s cubic-bezier(.16,1,.3,1), background-color .3s, color .3s, border-color .3s, box-shadow .3s;
  will-change: transform;
}
@utility btn-primary {
  background: var(--color-accent); color: var(--color-accent-fg);
  &:hover { box-shadow: 0 10px 40px -10px color-mix(in srgb, var(--color-accent) 70%, transparent); transform: translateY(-1px); }
}
@utility btn-secondary {
  border: ${Math.max(1, ds.shape.borderWidth)}px solid currentColor; color: inherit; background: transparent;
  &:hover { background: var(--color-fg); color: var(--color-bg); border-color: var(--color-fg); }
}
@utility btn-ghost {
  color: inherit; padding-inline: 0; min-height: auto;
  background-image: linear-gradient(currentColor, currentColor); background-size: 100% 1px; background-position: 0 100%; background-repeat: no-repeat;
  &:hover { background-size: 0% 1px; background-position: 100% 100%; }
}
@utility card {
  background: var(--color-surface);
  border-radius: ${radius};
  ${ds.shape.borderWidth ? `border: ${ds.shape.borderWidth}px solid var(--color-line);` : ""}
}
@utility media-frame { overflow: hidden; border-radius: ${radius}; background: var(--color-surface-2); }
@utility divider { border-top: ${Math.max(1, ds.shape.borderWidth)}px solid var(--color-line); }
@utility grain {
  position: relative;
  &::after {
    content: ""; position: absolute; inset: 0; pointer-events: none; opacity: .07; mix-blend-mode: overlay;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  }
}
@utility glass {
  background: color-mix(in srgb, var(--color-surface) 62%, transparent);
  backdrop-filter: blur(18px) saturate(1.4);
  -webkit-backdrop-filter: blur(18px) saturate(1.4);
}
@utility text-gradient {
  background: linear-gradient(100deg, var(--color-fg) 10%, var(--color-accent) 55%, var(--color-brand) 95%);
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
`;
}

/** Base element styles (outside Tailwind preflight, which we intentionally keep minimal). */
export function baseCss(ds: DesignSystem, assetBase: string): string {
  const fonts = [...new Set([ds.typography.display, ds.typography.body])].map((f) => fontFaceCss(f, assetBase)).join("\n");
  return `@layer theme, base, components, utilities;
${fonts}
@layer base {
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;border:0 solid}
html{color-scheme:${ds.mode};-webkit-text-size-adjust:100%;text-size-adjust:100%;scroll-behavior:smooth;background:var(--color-bg)}
html.m-smooth{scroll-behavior:auto}
body{min-height:100vh;font-family:var(--font-body);font-weight:${ds.typography.bodyWeight};font-size:var(--text-body);line-height:1.65;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility;overflow-x:clip}
h1,h2,h3,h4,h5,h6{font-family:var(--font-display);font-weight:${ds.typography.displayWeight};letter-spacing:${TRACKING[ds.typography.displayTracking]};line-height:1.08;text-wrap:balance;${ds.typography.displayCase === "uppercase" ? "text-transform:uppercase;" : ""}}
p{text-wrap:pretty}
img,svg,video,canvas,iframe{display:block;max-width:100%}
img,video{height:auto}
img[width][height]{height:auto}
a{color:inherit;text-decoration:none}
ul,ol{list-style:none}
button,input,textarea,select{font:inherit;color:inherit;background:transparent}
input,textarea,select{width:100%;padding:.85em 1em;border:1px solid var(--color-line);border-radius:${RADIUS_PX[ds.shape.radius] === "9999px" ? "14px" : RADIUS_PX[ds.shape.radius]};background:var(--color-surface)}
input[type=checkbox],input[type=radio]{width:auto}
textarea{min-height:9rem;resize:vertical}
button{cursor:pointer}
table{border-collapse:collapse;width:100%}
th,td{text-align:left;padding:.75em 1em;border-bottom:1px solid var(--color-line)}
::selection{background:var(--color-accent);color:var(--color-accent-fg)}
:focus-visible{outline:2px solid var(--color-accent);outline-offset:3px;border-radius:4px}
[hidden]{display:none!important}
[data-section-index]{display:contents}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.skip-link{position:absolute;left:1rem;top:-4rem;z-index:1000;padding:.75rem 1rem;background:var(--color-accent);color:var(--color-accent-fg);border-radius:8px}
.skip-link:focus{top:1rem}
.lang-switch{display:flex;gap:.5rem;font-size:var(--text-small)}
.lang-switch a[aria-current]{text-decoration:underline;text-underline-offset:.25em}
}
${ds.texture.grain ? "body::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:60;opacity:.035;background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")}" : ""}
`;
}

/** Directory from which "tailwindcss" is resolvable (this package). */
function defaultBase(): string {
  return process.env["REDESIGN_TAILWIND_BASE"] ?? dirname(dirname(fileURLToPath(import.meta.url)));
}

/** Collects class tokens from HTML fragments (Tailwind candidates). */
export function classCandidates(fragments: readonly string[]): string[] {
  const out = new Set<string>();
  for (const html of fragments) {
    for (const m of html.matchAll(/\sclass="([^"]*)"/g)) {
      for (const token of m[1]!.replace(/&amp;/g, "&").replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&quot;/g, '"').split(/\s+/)) {
        if (token) out.add(token);
      }
    }
  }
  return [...out];
}

/** Compiles the complete stylesheet for a site: fonts + base + tailwind utilities + motion runtime. */
export async function buildSiteCss(ds: DesignSystem, fragments: readonly string[], assetBase = "", base = defaultBase()): Promise<string> {
  const compiler = await compile(tailwindEntry(ds), { base, onDependency: () => {} });
  const utilities = compiler.build(classCandidates(fragments));
  return `${baseCss(ds, assetBase)}\n${utilities}\n${runtimeCss()}`;
}
