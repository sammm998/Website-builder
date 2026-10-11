import { z } from "zod";
import { designSystemSchema } from "./design-system";

export const ARCHETYPES = [
  "hero",
  "split",
  "statement",
  "feature-list",
  "cards",
  "bento",
  "media-grid",
  "gallery",
  "stats",
  "timeline",
  "steps",
  "testimonial",
  "logos",
  "faq",
  "pricing",
  "team",
  "text",
  "table",
  "contact",
  "form",
  "cta",
] as const;
export type Archetype = (typeof ARCHETYPES)[number];

/** A generated section: sanitized HTML fragment mapped to exactly one source section. */
export const generatedSectionSchema = z.object({
  /** -1 = hero; otherwise index into SourcePage.sections. */
  sourceIndex: z.number().int().min(-1),
  archetype: z.enum(ARCHETYPES),
  html: z.string(),
});
export type GeneratedSection = z.infer<typeof generatedSectionSchema>;

export const directionSchema = z.object({
  name: z.string().min(1).max(60),
  rationale: z.string().max(1200),
  designSystem: designSystemSchema,
  headerHtml: z.string(),
  footerHtml: z.string(),
  sections: z.array(generatedSectionSchema).min(1),
});
export type Direction = z.infer<typeof directionSchema>;

export const pageDocumentSchema = z.object({
  path: z.string(),
  lang: z.string(),
  title: z.string(),
  description: z.string(),
  sections: z.array(generatedSectionSchema),
});
export type PageDocument = z.infer<typeof pageDocumentSchema>;

export const analysisSummarySchema = z.object({
  businessType: z.string(),
  audience: z.string(),
  tone: z.string(),
  positioning: z.string(),
  recommendedDirection: z.string(),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  contentNotes: z.string(),
  seoFindings: z.array(
    z.object({
      severity: z.enum(["high", "medium", "low"]),
      title: z.string(),
      detail: z.string(),
    }),
  ),
});
export type AnalysisSummary = z.infer<typeof analysisSummarySchema>;
