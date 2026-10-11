import { z } from "zod";

/**
 * Curated, self-hosted fonts (all cover Swedish å ä ö and the Latin Extended range).
 * `file` names the variable woff2 copied into the public font directory at build time.
 */
export const FONT_CATALOG = {
  "inter-tight": { family: "Inter Tight", category: "sans", file: "inter-tight", fallback: "system-ui, sans-serif" },
  inter: { family: "Inter", category: "sans", file: "inter", fallback: "system-ui, sans-serif" },
  manrope: { family: "Manrope", category: "sans", file: "manrope", fallback: "system-ui, sans-serif" },
  "dm-sans": { family: "DM Sans", category: "sans", file: "dm-sans", fallback: "system-ui, sans-serif" },
  "space-grotesk": { family: "Space Grotesk", category: "sans", file: "space-grotesk", fallback: "system-ui, sans-serif" },
  sora: { family: "Sora", category: "sans", file: "sora", fallback: "system-ui, sans-serif" },
  outfit: { family: "Outfit", category: "sans", file: "outfit", fallback: "system-ui, sans-serif" },
  "plus-jakarta-sans": { family: "Plus Jakarta Sans", category: "sans", file: "plus-jakarta-sans", fallback: "system-ui, sans-serif" },
  "bricolage-grotesque": { family: "Bricolage Grotesque", category: "display", file: "bricolage-grotesque", fallback: "system-ui, sans-serif" },
  syne: { family: "Syne", category: "display", file: "syne", fallback: "system-ui, sans-serif" },
  unbounded: { family: "Unbounded", category: "display", file: "unbounded", fallback: "system-ui, sans-serif" },
  archivo: { family: "Archivo", category: "sans", file: "archivo", fallback: "system-ui, sans-serif" },
  "big-shoulders-display": { family: "Big Shoulders Display", category: "condensed", file: "big-shoulders-display", fallback: "Impact, sans-serif" },
  oswald: { family: "Oswald", category: "condensed", file: "oswald", fallback: "Impact, sans-serif" },
  fraunces: { family: "Fraunces", category: "serif", file: "fraunces", fallback: "Georgia, serif" },
  "playfair-display": { family: "Playfair Display", category: "serif", file: "playfair-display", fallback: "Georgia, serif" },
  newsreader: { family: "Newsreader", category: "serif", file: "newsreader", fallback: "Georgia, serif" },
  "eb-garamond": { family: "EB Garamond", category: "serif", file: "eb-garamond", fallback: "Georgia, serif" },
  "cormorant-garamond": { family: "Cormorant Garamond", category: "serif", file: "cormorant-garamond", fallback: "Georgia, serif" },
  "instrument-serif": { family: "Instrument Serif", category: "serif", file: "instrument-serif", fallback: "Georgia, serif" },
  "dm-serif-display": { family: "DM Serif Display", category: "serif", file: "dm-serif-display", fallback: "Georgia, serif" },
  "jetbrains-mono": { family: "JetBrains Mono", category: "mono", file: "jetbrains-mono", fallback: "ui-monospace, monospace" },
  "space-mono": { family: "Space Mono", category: "mono", file: "space-mono", fallback: "ui-monospace, monospace" },
} as const;

export type FontId = keyof typeof FONT_CATALOG;
export const FONT_IDS = Object.keys(FONT_CATALOG) as [FontId, ...FontId[]];

const hex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex color")
  .transform((v) => v.toLowerCase());

export const designSystemSchema = z.object({
  name: z.string().min(1).max(60),
  mode: z.enum(["light", "dark"]),
  colors: z.object({
    bg: hex,
    surface: hex,
    "surface-2": hex,
    fg: hex,
    muted: hex,
    line: hex,
    accent: hex,
    "accent-fg": hex,
    brand: hex,
  }),
  typography: z.object({
    display: z.enum(FONT_IDS),
    body: z.enum(FONT_IDS),
    displayWeight: z.number().int().min(100).max(900),
    bodyWeight: z.number().int().min(300).max(600),
    displayTracking: z.enum(["tighter", "tight", "normal", "wide"]),
    displayCase: z.enum(["normal", "uppercase"]),
    /** Modular type-scale ratio for heading sizes. */
    scale: z.number().min(1.125).max(1.6),
    baseSize: z.number().min(15).max(21),
  }),
  shape: z.object({
    radius: z.enum(["none", "sm", "md", "lg", "xl", "2xl", "full"]),
    borderWidth: z.number().int().min(0).max(3),
  }),
  layout: z.object({
    container: z.number().int().min(960).max(1680),
    sectionSpacing: z.enum(["compact", "normal", "airy", "cinematic"]),
    gutter: z.enum(["tight", "normal", "wide"]),
  }),
  motion: z.object({
    personality: z.enum(["calm", "editorial", "cinematic", "kinetic", "playful"]),
    smoothScroll: z.boolean(),
    /** 0 = barely any motion, 1 = maximal. Runtime scales distances/durations. */
    intensity: z.number().min(0).max(1),
    cursor: z.enum(["none", "dot", "ring", "blend"]),
    pageTransition: z.enum(["none", "fade", "curtain"]),
  }),
  texture: z.object({
    grain: z.boolean(),
    /** Decorative surface treatment allowed throughout the site. */
    accents: z.enum(["none", "lines", "gradients", "shapes", "glass"]),
  }),
});

export type DesignSystem = z.infer<typeof designSystemSchema>;

export const RADIUS_PX: Record<DesignSystem["shape"]["radius"], string> = {
  none: "0px",
  sm: "4px",
  md: "8px",
  lg: "14px",
  xl: "22px",
  "2xl": "32px",
  full: "9999px",
};

export const SECTION_SPACING: Record<DesignSystem["layout"]["sectionSpacing"], [string, string]> = {
  compact: ["3.5rem", "5rem"],
  normal: ["5rem", "8rem"],
  airy: ["6rem", "11rem"],
  cinematic: ["7rem", "14rem"],
};

/** Relative luminance contrast ratio between two hex colors (WCAG 2.x). */
export function contrastRatio(a: string, b: string): number {
  const lum = (h: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) =>
      c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
    ) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

/** Returns human-readable contrast problems for the key text/background pairs. */
export function designSystemContrastIssues(ds: DesignSystem): string[] {
  const pairs: [keyof DesignSystem["colors"], keyof DesignSystem["colors"], number][] = [
    ["fg", "bg", 7],
    ["fg", "surface", 4.5],
    ["muted", "bg", 4.5],
    ["accent-fg", "accent", 4.5],
  ];
  return pairs
    .filter(([f, b, min]) => contrastRatio(ds.colors[f], ds.colors[b]) < min)
    .map(([f, b, min]) => `${f} on ${b} contrast ${contrastRatio(ds.colors[f], ds.colors[b]).toFixed(2)} < ${min}`);
}
