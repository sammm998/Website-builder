import type { DesignSystem, Facts, GeneratedSection, SourcePage } from "@redesign/schema";

export interface MediaVariantRef {
  width: number;
  height?: number;
  format: string;
  url: string;
}

export interface MediaAsset {
  id: string;
  kind: "image" | "video";
  /** Public URL of the normalized original. */
  url: string;
  width?: number | null;
  height?: number | null;
  variants: MediaVariantRef[];
  alt?: string | null;
}

export interface SitePageRef {
  path: string;
  lang: string;
  title: string;
  noindex?: boolean;
}

export interface SiteContext {
  siteName: string;
  /** Absolute origin used for canonical/hreflang/sitemap URLs, e.g. https://www.firma.se */
  origin: string;
  /** Path prefix when the site is not served at the domain root ("/site/slug", "/preview/<id>"). */
  basePath: string;
  /** Origin/prefix where /runtime and /fonts are served ("" = same origin). */
  assetBase: string;
  defaultLang: string;
  languages: string[];
  pages: SitePageRef[];
  media: ReadonlyMap<string, MediaAsset>;
  designSystem: DesignSystem;
  facts: Facts;
  logoMediaId?: string | undefined;
  /** Origin of the old site; absolute links to it are rewritten to the new pages. */
  sourceOrigin: string;
  mode: "preview" | "publish";
  /** Form endpoint for a source form key. */
  formAction: (formKey: string, pagePath: string) => string;
  /** External stylesheet URL; when omitted the CSS is inlined. */
  cssHref?: string | undefined;
}

export interface PageInput {
  path: string;
  lang: string;
  title: string;
  description: string;
  sections: GeneratedSection[];
  header: string;
  footer: string;
  source?: SourcePage | null;
}
