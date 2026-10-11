import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Path segment under which the web app serves the runtime: /runtime/v<major>/... */
export const RUNTIME_VERSION = "1";
export const RUNTIME_BASE = `/runtime/v${RUNTIME_VERSION}`;

export interface RuntimeManifest {
  version: string;
  files: Record<string, { integrity: string; bytes: number }>;
}

let configuredDir: string | null = process.env["REDESIGN_RUNTIME_DIR"] ?? null;

/**
 * Directory with the built runtime (boot.js, motion.js, runtime.css, manifest.json). Defaults to this
 * package's dist/; bundled apps (Next.js) set REDESIGN_RUNTIME_DIR or call configureRuntimeDir().
 */
export function runtimeDir(): string {
  return configuredDir ?? join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
}

export function configureRuntimeDir(dir: string) {
  configuredDir = dir;
  manifestCache = null;
  cssCache = null;
}

let manifestCache: RuntimeManifest | null = null;
let cssCache: string | null = null;

export function runtimeManifest(): RuntimeManifest {
  manifestCache ??= JSON.parse(readFileSync(join(runtimeDir(), "manifest.json"), "utf8")) as RuntimeManifest;
  return manifestCache;
}

export function runtimeCss(): string {
  cssCache ??= readFileSync(join(runtimeDir(), "runtime.css"), "utf8");
  return cssCache;
}

