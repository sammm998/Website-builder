import { FONT_CATALOG, type FontId } from "@redesign/schema";
import { AVAILABLE_FILES } from "./files.gen";
import { STATIC_WEIGHTS, SUBSETS } from "./spec";

/**
 * Self-hosted font files (Fontsource, OFL licensed). Only latin + latin-ext subsets are shipped,
 * which cover Swedish, the other Nordic languages and most European languages. This entry point is
 * bundler-safe (no filesystem access); see ./node for source paths.
 */

export interface FontFile {
  font: FontId;
  /** File name under the public /fonts directory. */
  file: string;
  subset: string;
  unicodeRange: string;
  weight: string;
  style: "normal" | "italic";
}

export function fontFiles(font: FontId): FontFile[] {
  const available = new Set(AVAILABLE_FILES[font] ?? []);
  const id = FONT_CATALOG[font].file;
  const out: FontFile[] = [];
  for (const subset of SUBSETS) {
    for (const style of ["normal", "italic"] as const) {
      const weights = STATIC_WEIGHTS[font];
      for (const w of weights ?? ["wght"]) {
        const file = `${id}-${subset.name}-${w}-${style}.woff2`;
        if (available.has(file)) out.push({ font, file, subset: subset.name, unicodeRange: subset.range, weight: weights ? String(w) : "100 900", style });
      }
    }
  }
  return out;
}

/** @font-face rules for a font, referencing `${baseUrl}/fonts/<file>`. */
export function fontFaceCss(font: FontId, baseUrl: string): string {
  const family = FONT_CATALOG[font].family;
  return fontFiles(font)
    .map((f) => `@font-face{font-family:"${family}";font-style:${f.style};font-weight:${f.weight};font-display:swap;src:url(${baseUrl}/fonts/${f.file}) format("woff2");unicode-range:${f.unicodeRange}}`)
    .join("\n");
}

/** The latin normal file, worth preloading for the display font. */
export function preloadFile(font: FontId): string {
  return fontFiles(font).find((f) => f.subset === "latin" && f.style === "normal")!.file;
}
