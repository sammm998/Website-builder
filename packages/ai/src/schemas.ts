import { z } from "zod";
import { ARCHETYPES, analysisSummarySchema, designSystemSchema } from "@redesign/schema";

/** Output schemas for model calls (no defaults/transforms in the JSON contract; zod re-validates). */

export const briefsOutput = z.object({
  directions: z
    .array(
      z.object({
        name: z.string(),
        concept: z.string(),
        mode: z.enum(["light", "dark"]),
        color: z.string(),
        typography: z.string(),
        layout: z.string(),
        motion: z.string(),
        hero: z.string(),
      }),
    )
    .length(3),
});
export type Brief = z.infer<typeof briefsOutput>["directions"][number];

export const sectionOutput = z.object({
  sourceIndex: z.number().int(),
  archetype: z.enum(ARCHETYPES),
  html: z.string(),
});

export const directionOutput = z.object({
  name: z.string(),
  rationale: z.string(),
  designSystem: designSystemSchema,
  headerHtml: z.string(),
  footerHtml: z.string(),
  sections: z.array(sectionOutput),
});

export const pageOutput = z.object({ sections: z.array(sectionOutput) });

export const repairOutput = z.object({
  sections: z.array(sectionOutput),
  headerHtml: z.string(),
  footerHtml: z.string(),
});

export const translationOutput = z.object({
  segments: z.array(z.string()),
});

export const metaTranslationOutput = z.object({ title: z.string(), description: z.string() });

export const analysisOutput = analysisSummarySchema;

export const critiqueOutput = z.object({
  score: z.number().min(0).max(10),
  summary: z.string(),
  issues: z.array(
    z.object({
      /** -2 = header, -3 = footer, -1 = hero, >= 0 source section index */
      sourceIndex: z.number().int(),
      severity: z.enum(["high", "medium", "low"]),
      problem: z.string(),
      fix: z.string(),
    }),
  ),
});
export type Critique = z.infer<typeof critiqueOutput>;
