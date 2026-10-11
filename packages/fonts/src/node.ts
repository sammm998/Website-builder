import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { FONT_IDS, type FontId } from "@redesign/schema";
import { fontFiles } from "./index";
import { STATIC_WEIGHTS } from "./spec";

const require = createRequire(import.meta.url);

/** Absolute path of a font file inside node_modules (Node only: build scripts, worker). */
export function fontSource(font: FontId, file: string): string {
  const pkg = STATIC_WEIGHTS[font] ? `@fontsource/${font}` : `@fontsource-variable/${font}`;
  return join(dirname(require.resolve(`${pkg}/package.json`)), "files", file);
}

/** Map of public file name -> absolute source path for every shipped font file. */
export function allFontSources(): Map<string, string> {
  return new Map(FONT_IDS.flatMap((f) => fontFiles(f).map((x) => [x.file, fontSource(f, x.file)] as const)));
}
