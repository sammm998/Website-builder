import { readFileSync } from "node:fs";

/** Path segment under which the web app serves the runtime: /runtime/v<major>/... */
export const RUNTIME_VERSION = "1";
export const RUNTIME_BASE = `/runtime/v${RUNTIME_VERSION}`;

export interface RuntimeManifest {
  version: string;
  files: Record<string, { integrity: string; bytes: number }>;
}

/** Reads the built manifest (requires `pnpm --filter @redesign/motion-runtime build`). */
export function runtimeManifest(): RuntimeManifest {
  return JSON.parse(readFileSync(new URL("../dist/manifest.json", import.meta.url), "utf8")) as RuntimeManifest;
}

export function runtimeCss(): string {
  return readFileSync(new URL("./runtime.css", import.meta.url), "utf8");
}

export const RUNTIME_DIST_DIR = new URL("../dist/", import.meta.url).pathname;
