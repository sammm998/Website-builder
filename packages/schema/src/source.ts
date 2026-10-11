import { z } from "zod";

/**
 * Verbatim snapshot of one crawled page. Text is stored exactly as rendered by the source site
 * (whitespace-normalized only). It is the single source of truth for generated pages: nothing is
 * summarized, invented or dropped.
 */

export const mediaRefSchema = z.object({
  /** Absolute original URL. */
  src: z.string().url(),
  /** Set once the asset is cached in our storage (media table id). */
  mediaId: z.string().uuid().optional(),
  alt: z.string().default(""),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  kind: z.enum(["image", "video"]).default("image"),
  role: z.enum(["photo", "logo", "icon", "avatar", "badge", "illustration", "background"]).default("photo"),
});
export type MediaRef = z.infer<typeof mediaRefSchema>;

export const linkSchema = z.object({
  label: z.string(),
  href: z.string(),
  /** Same-origin page link (path is preserved in the new site). */
  internal: z.boolean(),
  /** Visually a call to action (button-like) on the source site. */
  primary: z.boolean().default(false),
});
export type Link = z.infer<typeof linkSchema>;

export const formFieldSchema = z.object({
  name: z.string(),
  type: z.enum(["text", "email", "tel", "number", "url", "date", "textarea", "select", "checkbox", "radio", "hidden"]),
  label: z.string().default(""),
  placeholder: z.string().default(""),
  required: z.boolean().default(false),
  options: z.array(z.string()).default([]),
});

export const formSpecSchema = z.object({
  key: z.string().regex(/^[a-z0-9-]{1,64}$/),
  originalAction: z.string().default(""),
  method: z.enum(["get", "post"]).default("post"),
  fields: z.array(formFieldSchema),
  submitLabel: z.string().default(""),
});
export type FormSpec = z.infer<typeof formSpecSchema>;

export const embedSchema = z.object({
  kind: z.enum(["youtube", "vimeo", "google-maps", "other"]),
  src: z.string().url(),
  title: z.string().default(""),
});
export type Embed = z.infer<typeof embedSchema>;

export const blockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("heading"), level: z.number().int().min(1).max(6), text: z.string() }),
  z.object({ type: z.literal("paragraph"), text: z.string() }),
  z.object({ type: z.literal("list"), ordered: z.boolean(), items: z.array(z.string()) }),
  z.object({ type: z.literal("quote"), text: z.string(), cite: z.string().default("") }),
  z.object({ type: z.literal("media"), media: mediaRefSchema }),
  z.object({ type: z.literal("links"), links: z.array(linkSchema) }),
  z.object({ type: z.literal("form"), form: formSpecSchema }),
  z.object({ type: z.literal("embed"), embed: embedSchema }),
  z.object({ type: z.literal("table"), rows: z.array(z.array(z.string())), header: z.boolean() }),
]);
export type Block = z.infer<typeof blockSchema>;

export const sourceSectionSchema = z.object({
  heading: z.string().default(""),
  blocks: z.array(blockSchema),
});
export type SourceSection = z.infer<typeof sourceSectionSchema>;

export const factsSchema = z.object({
  organizationName: z.string().default(""),
  phones: z.array(z.string()).default([]),
  emails: z.array(z.string()).default([]),
  addresses: z.array(z.string()).default([]),
  socials: z.array(z.string()).default([]),
  /** schema.org types already declared by the source site (e.g. LocalBusiness, Restaurant). */
  schemaTypes: z.array(z.string()).default([]),
  openingHours: z.array(z.string()).default([]),
});
export type Facts = z.infer<typeof factsSchema>;

export const sourcePageSchema = z.object({
  version: z.literal(1),
  url: z.string().url(),
  path: z.string(),
  lang: z.string().default(""),
  title: z.string().default(""),
  description: z.string().default(""),
  canonical: z.string().default(""),
  hreflang: z.array(z.object({ lang: z.string(), href: z.string() })).default([]),
  og: z.record(z.string(), z.string()).default({}),
  robots: z.string().default(""),
  logo: mediaRefSchema.nullable().default(null),
  nav: z.array(linkSchema).default([]),
  hero: sourceSectionSchema,
  sections: z.array(sourceSectionSchema),
  footer: sourceSectionSchema,
  facts: factsSchema,
  /** Dominant brand colors (hex), most important first. */
  palette: z.array(z.string().regex(/^#[0-9a-f]{6}$/)).default([]),
  fonts: z.array(z.string()).default([]),
  wordCount: z.number().int().default(0),
  /** Words found in headings + paragraphs (for SEO). */
  headings: z.array(z.object({ level: z.number().int(), text: z.string() })).default([]),
  jsonLd: z.array(z.unknown()).default([]),
});
export type SourcePage = z.infer<typeof sourcePageSchema>;

/** All verbatim text strings of a section, in order (used to verify nothing is lost). */
export function sectionTexts(section: SourceSection): string[] {
  const out: string[] = [];
  if (section.heading) out.push(section.heading);
  for (const block of section.blocks) {
    switch (block.type) {
      case "heading":
      case "paragraph":
        out.push(block.text);
        break;
      case "quote":
        out.push(block.text);
        if (block.cite) out.push(block.cite);
        break;
      case "list":
        out.push(...block.items);
        break;
      case "links":
        out.push(...block.links.map((l) => l.label));
        break;
      case "table":
        out.push(...block.rows.flat());
        break;
      case "form":
        out.push(...block.form.fields.map((f) => f.label).filter(Boolean));
        if (block.form.submitLabel) out.push(block.form.submitLabel);
        break;
      default:
        break;
    }
  }
  return out.map((t) => t.trim()).filter(Boolean);
}

export function sectionMedia(section: SourceSection): MediaRef[] {
  return section.blocks.flatMap((b) => (b.type === "media" ? [b.media] : []));
}

export function sectionLinks(section: SourceSection): Link[] {
  return section.blocks.flatMap((b) => (b.type === "links" ? b.links : []));
}

export function sectionForms(section: SourceSection): FormSpec[] {
  return section.blocks.flatMap((b) => (b.type === "form" ? [b.form] : []));
}

/** Ordered sections including hero (index -1) and footer (index = sections.length) for mapping. */
export function allSections(page: SourcePage): { index: number; section: SourceSection }[] {
  return [
    { index: -1, section: page.hero },
    ...page.sections.map((section, index) => ({ index, section })),
  ];
}
