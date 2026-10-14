import { applyTextSegments, textSegments } from "@redesign/sanitizer";
import {
  designSystemContrastIssues,
  type AnalysisSummary,
  type Direction,
  type GeneratedSection,
  type SourcePage,
} from "@redesign/schema";
import { AiError, type AiProvider, type ImageInput, type ObjectRequest, type Usage } from "./provider";
import { DESIGN_SYSTEM_GUIDE, DESIGNER_SYSTEM } from "./prompts/designer";
import { ANALYST_SYSTEM, CRITIC_SYSTEM, TRANSLATOR_SYSTEM } from "./prompts/other";
import { MENU_RULE, pageForPrompt, siteMenu, siteNavForPrompt, untrusted, type MenuItem, type SitePageRef } from "./content";
import {
  analysisOutput,
  briefsOutput,
  critiqueOutput,
  directionOutput,
  metaTranslationOutput,
  pageOutput,
  repairOutput,
  translationOutput,
  type Brief,
  type Critique,
} from "./schemas";
import {
  appendMissingText,
  blockingIssues,
  sourceSection,
  validateLayout,
  validateSections,
  type SectionIssue,
  type ValidationContext,
} from "./validate";

export interface PipelineDeps {
  ai: AiProvider;
  /** Called after every model call (persist cost/usage). */
  onUsage?: (usage: Usage) => void | Promise<void>;
}

async function call<T>(deps: PipelineDeps, req: ObjectRequest<T>): Promise<T> {
  let result;
  try {
    result = await deps.ai.generateObject(req);
  } catch (error) {
    // A refused, cut-off or invalid response is still billed: record it so the shown cost is real.
    if (error instanceof AiError && error.usage) await deps.onUsage?.(error.usage);
    throw error;
  }
  await deps.onUsage?.(result.usage);
  return result.data;
}

/**
 * Thinking effort per step. The look is decided in the briefs and the three directions (high); pages,
 * repairs and critiques follow an approved system, where medium keeps quality at a much lower token cost.
 */
export const EFFORT = {
  analysis: "medium",
  briefs: "high",
  direction: "high",
  page: "medium",
  repair: "medium",
  critique: "medium",
  translate: "low",
} as const;

const LANG_NAME: Record<string, string> = { sv: "Swedish", en: "English", de: "German", no: "Norwegian", nb: "Norwegian Bokmål", da: "Danish", fi: "Finnish", fr: "French", es: "Spanish", it: "Italian", nl: "Dutch", pl: "Polish" };
export const languageName = (code: string) => LANG_NAME[code.toLowerCase().split("-")[0]!] ?? code;

// ---------------------------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------------------------

export interface AnalyzeInput {
  pages: SourcePage[];
  seoSummary: { score: number | null; failing: { title: string; detail: string; severity: string; count: number }[] };
  screenshots: ImageInput[];
  outputLanguage: string;
  origin: string;
}

export async function analyzeSite(deps: PipelineDeps, input: AnalyzeInput): Promise<AnalysisSummary> {
  const overview = input.pages.slice(0, 30).map((p) => ({
    path: p.path,
    title: p.title,
    description: p.description,
    headings: p.headings.slice(0, 20),
    words: p.wordCount,
    // The analysis judges tone and structure; generation always receives full verbatim content.
    opening: [p.hero, ...p.sections].flatMap((s) => s.blocks.flatMap((b) => (b.type === "paragraph" ? [b.text] : []))).slice(0, 4),
  }));
  const home = input.pages.find((p) => p.path === "/") ?? input.pages[0];
  return call(deps, {
    purpose: "analysis",
    system: ANALYST_SYSTEM,
    effort: EFFORT.analysis,
    maxTokens: 16000,
    images: input.screenshots,
    schema: analysisOutput,
    prompt: [
      `Write all fields in ${languageName(input.outputLanguage)}.`,
      `Website: ${input.origin}. Brand palette from the site: ${JSON.stringify(home?.palette ?? [])}. Fonts: ${JSON.stringify(home?.fonts ?? [])}. Declared business facts: ${JSON.stringify(home?.facts ?? {})}.`,
      untrusted("source", overview),
      untrusted("seo_audit", input.seoSummary),
      "Analyse the business, audience, tone of voice, current design weaknesses and strengths, and recommend a redesign direction. seoFindings: summarise the most important audit results in plain language (do not invent new problems, do not promise rankings).",
    ].join("\n\n"),
  });
}

// ---------------------------------------------------------------------------------------------
// Design directions
// ---------------------------------------------------------------------------------------------

export interface DirectionContext {
  home: SourcePage;
  analysis: AnalysisSummary;
  validation: ValidationContext;
  inspiration: ImageInput[];
  /** Screenshot of the current homepage (what we are redesigning). */
  current?: ImageInput;
  /** Pages that will be built: the site menu is made of exactly these. */
  sitePages?: SitePageRef[];
}

/** Number of homepage sections (after the hero) shown in a direction preview. */
export const DIRECTION_SECTIONS = 3;

export function directionIndices(home: SourcePage): number[] {
  return [-1, ...home.sections.slice(0, DIRECTION_SECTIONS).map((_, i) => i)];
}

export async function planDirections(deps: PipelineDeps, ctx: DirectionContext): Promise<Brief[]> {
  const out = await call(deps, {
    purpose: "briefs",
    system: DESIGNER_SYSTEM,
    effort: EFFORT.briefs,
    maxTokens: 16000,
    images: [...(ctx.current ? [ctx.current] : []), ...ctx.inspiration],
    schema: briefsOutput,
    prompt: [
      "Plan THREE clearly different creative directions for the redesign. They must differ in concept, light/dark mode, typography, layout language, colour strategy and motion signature, so the client gets a real choice. All three must keep the brand recognisable (brand colour from the palette) and fit the business and audience.",
      "Typical spread: one refined editorial direction, one immersive cinematic/3D direction, one bold kinetic/graphic direction - adapt to what suits this business.",
      untrusted("analysis", ctx.analysis),
      `Brand palette: ${JSON.stringify(ctx.home.palette)}. Current fonts: ${JSON.stringify(ctx.home.fonts)}.`,
      untrusted("source", pageForPrompt(ctx.home, ctx.validation.origin, directionIndices(ctx.home))),
      ctx.inspiration.length ? "The attached inspiration screenshots show the client's taste; borrow principles (mood, rhythm, typography), never copy content." : "",
      "For each direction write: name (2-3 words), concept, mode, color strategy, typography (font ids from the list), layout language, motion signature and the hero idea.",
    ]
      .filter(Boolean)
      .join("\n\n"),
  });
  return out.directions;
}

export interface DirectionResult {
  direction: Direction;
  /** Remaining non-blocking issues (shown to QA, not to the AI again). */
  warnings: SectionIssue[];
}

function issuesText(issues: SectionIssue[]): string {
  return untrusted("issues", issues.map((i) => ({ section: i.sourceIndex, severity: i.severity, problem: i.message })));
}

export async function generateDirection(
  deps: PipelineDeps,
  ctx: DirectionContext,
  brief: Brief,
  others: Brief[],
  feedback?: { previous: Direction; text: string },
): Promise<DirectionResult> {
  const indices = directionIndices(ctx.home);
  const menu = siteMenu(ctx.home, ctx.sitePages, ctx.validation.origin);
  const raw = await call(deps, {
    purpose: "direction",
    system: DESIGNER_SYSTEM,
    effort: EFFORT.direction,
    images: [...(ctx.current ? [ctx.current] : []), ...ctx.inspiration],
    schema: directionOutput,
    // Identical for all three directions (and regenerations): read from the prompt cache after the first.
    context: [
      "Create this design direction as real, production-quality code: the design system, the site header (logo, full navigation, mobile menu, primary CTA if the source has one), the hero and the following homepage sections, and the site footer. This preview is what the client approves; every other page will be built from the same system, header and footer.",
      DESIGN_SYSTEM_GUIDE,
      untrusted("analysis", { audience: ctx.analysis.audience, tone: ctx.analysis.tone, positioning: ctx.analysis.positioning }),
      `Brand palette: ${JSON.stringify(ctx.home.palette)}.`,
      untrusted("site_navigation", siteNavForPrompt(ctx.home, ctx.validation.origin, menu)),
      MENU_RULE,
      untrusted("source", pageForPrompt(ctx.home, ctx.validation.origin, indices)),
      `Return sections for sourceIndex ${indices.join(", ")} (each exactly once, in order). headerHtml is a <header> element, footerHtml a <footer> element containing ALL footer content verbatim.`,
    ].join("\n\n"),
    prompt: [
      untrusted("brief", brief),
      `The other two directions (yours must look clearly different): ${JSON.stringify(others.map((o) => ({ name: o.name, mode: o.mode, concept: o.concept })))}`,
      feedback ? `Revise the previous version of this direction according to the client's feedback.\n${untrusted("feedback", feedback.text)}\nPrevious design system: ${JSON.stringify(feedback.previous.designSystem)}` : "",
      "Build the direction described in the brief above.",
    ]
      .filter(Boolean)
      .join("\n\n"),
  });

  let direction: Direction = { ...raw, sections: raw.sections };
  let { sections, issues } = validateSections(ctx.home, direction.sections, indices, ctx.validation);
  let layout = validateLayout(ctx.home, direction.headerHtml, direction.footerHtml, ctx.validation, menu);
  const contrast = designSystemContrastIssues(direction.designSystem).map((m) => ({ sourceIndex: -2, severity: "high" as const, message: `Design system contrast: ${m}` }));
  let blocking = blockingIssues([...issues, ...layout.issues, ...contrast]);

  if (blocking.length) {
    const fixed = await repair(deps, ctx.home, direction, sections, layout, blocking, ctx.validation, true, menu);
    direction = fixed.direction;
    ({ sections, issues } = validateSections(ctx.home, direction.sections, indices, ctx.validation));
    layout = validateLayout(ctx.home, direction.headerHtml, direction.footerHtml, ctx.validation, menu);
    blocking = blockingIssues([...issues, ...layout.issues]);
  }
  // Guarantee: no source text is lost even if the model still dropped something.
  sections = sections.map((s) => appendMissingText(s, sourceSection(ctx.home, s.sourceIndex)!, ctx.validation));
  const fixedContrast = enforceContrast(direction.designSystem);
  return {
    direction: { ...direction, designSystem: fixedContrast, sections, headerHtml: layout.headerHtml, footerHtml: layout.footerHtml },
    warnings: [...issues, ...layout.issues],
  };
}

/** Deterministically nudges text colours until the required contrast ratios hold. */
export function enforceContrast(ds: Direction["designSystem"]): Direction["designSystem"] {
  if (!designSystemContrastIssues(ds).length) return ds;
  const dark = ds.mode === "dark";
  const colors = { ...ds.colors };
  const fix = (key: "fg" | "muted" | "accent-fg", bgKey: "bg" | "accent") => {
    for (let i = 0; i < 20 && designSystemContrastIssues({ ...ds, colors }).some((m) => m.startsWith(`${key} on ${bgKey}`)); i++) {
      colors[key] = mixHex(colors[key], key === "accent-fg" ? (luminanceHex(colors[bgKey]) > 0.4 ? "#000000" : "#ffffff") : dark ? "#ffffff" : "#000000", 0.2);
    }
  };
  fix("fg", "bg");
  fix("muted", "bg");
  fix("accent-fg", "accent");
  return { ...ds, colors };
}

function mixHex(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((v, i) => Math.round(v + (pb[i]! - v) * t).toString(16).padStart(2, "0")).join("")}`;
}
function luminanceHex(h: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

async function repair(
  deps: PipelineDeps,
  page: SourcePage,
  direction: Direction,
  sections: GeneratedSection[],
  layout: { headerHtml: string; footerHtml: string },
  issues: SectionIssue[],
  validation: ValidationContext,
  includeLayout: boolean,
  menu?: MenuItem[],
): Promise<{ direction: Direction }> {
  const failing = new Set(issues.map((i) => i.sourceIndex));
  const toFix = sections.filter((s) => failing.has(s.sourceIndex));
  const missing = [...failing].filter((i) => i >= -1 && !sections.some((s) => s.sourceIndex === i));
  const out = await call(deps, {
    purpose: "repair",
    system: DESIGNER_SYSTEM,
    effort: EFFORT.repair,
    schema: repairOutput,
    context: [
      "Validation found problems in the generated code. Fix ONLY the listed problems while keeping the design, classes and motion of each section as intact as possible. Return the corrected sections (only those listed or missing), plus headerHtml and footerHtml (return them unchanged when they have no issue).",
      `Design system: ${JSON.stringify(direction.designSystem)}`,
    ].join("\n\n"),
    prompt: [
      issuesText(issues),
      untrusted("current_sections", toFix),
      includeLayout ? untrusted("current_layout", { headerHtml: layout.headerHtml, footerHtml: layout.footerHtml }) : "",
      includeLayout ? untrusted("site_navigation", siteNavForPrompt(page, validation.origin, menu)) : "",
      includeLayout ? MENU_RULE : "",
      untrusted("source", pageForPrompt(page, validation.origin, [...new Set([...toFix.map((s) => s.sourceIndex), ...missing])])),
    ]
      .filter(Boolean)
      .join("\n\n"),
  });
  const merged = sections
    .filter((s) => !out.sections.some((o) => o.sourceIndex === s.sourceIndex))
    .concat(out.sections)
    .sort((a, b) => a.sourceIndex - b.sourceIndex);
  return {
    direction: {
      ...direction,
      designSystem: enforceContrast(direction.designSystem),
      sections: merged,
      headerHtml: includeLayout && out.headerHtml.trim() ? out.headerHtml : layout.headerHtml,
      footerHtml: includeLayout && out.footerHtml.trim() ? out.footerHtml : layout.footerHtml,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Full pages
// ---------------------------------------------------------------------------------------------

export interface PageContext {
  direction: Direction;
  validation: ValidationContext;
  /** Approved screenshot of the direction (visual reference for consistency). */
  reference?: ImageInput;
}

/** Sections per page call. Most pages fit in one call, so the shared context is sent once per page. */
const CHUNK = 12;

function pageContextText(ctx: PageContext): string {
  return [
    "Build sections of a page in the APPROVED design direction. The page must feel like the same website as the approved homepage: reuse its design system tokens, typographic hierarchy, spacing rhythm, button styles, card styles and motion language, while composing each section freshly for its own content (do not clone the homepage layouts mechanically).",
    `Approved design system: ${JSON.stringify(ctx.direction.designSystem)}`,
    untrusted("approved_examples", ctx.direction.sections.slice(0, 3).map((s) => ({ archetype: s.archetype, html: s.html }))),
  ].join("\n\n");
}

/** Generates all sections of a page (except those passed in `existing`) in the approved system. */
export async function generatePage(
  deps: PipelineDeps,
  ctx: PageContext,
  page: SourcePage,
  existing: GeneratedSection[] = [],
): Promise<{ sections: GeneratedSection[]; warnings: SectionIssue[] }> {
  const all = [-1, ...page.sections.map((_, i) => i)];
  const todo = all.filter((i) => !existing.some((s) => s.sourceIndex === i));
  let produced: GeneratedSection[] = [];
  const warnings: SectionIssue[] = [];
  for (let start = 0; start < todo.length; start += CHUNK) {
    const indices = todo.slice(start, start + CHUNK);
    const recent = [...existing, ...produced].slice(-3).map((s) => ({ sourceIndex: s.sourceIndex, archetype: s.archetype }));
    const raw = await call(deps, {
      purpose: "page",
      system: DESIGNER_SYSTEM,
      effort: EFFORT.page,
      images: ctx.reference ? [ctx.reference] : [],
      schema: pageOutput,
      // Same for every page of the build (prompt cache): the approved system and examples.
      context: pageContextText(ctx),
      prompt: [
        `Build sections of the page "${page.path}".`,
        indices.includes(-1)
          ? "sourceIndex -1 is this page's hero: give it the page's single <h1> and a signature entrance, scaled to a subpage (it can be shorter than the homepage hero)."
          : "This page's hero already exists; do not add another <h1>.",
        recent.length ? `Previously generated sections on this page (vary the composition): ${JSON.stringify(recent)}` : "",
        untrusted("source", pageForPrompt(page, ctx.validation.origin, indices)),
        `Return sections for sourceIndex ${indices.join(", ")} (each exactly once, in order).`,
      ]
        .filter(Boolean)
        .join("\n\n"),
    });
    let { sections, issues } = validateSections(page, raw.sections, indices, ctx.validation);
    const blocking = blockingIssues(issues);
    if (blocking.length) {
      const fixed = await repair(deps, page, { ...ctx.direction, sections }, sections, { headerHtml: "", footerHtml: "" }, blocking, ctx.validation, false);
      ({ sections, issues } = validateSections(page, fixed.direction.sections, indices, ctx.validation));
    }
    sections = sections.map((s) => appendMissingText(s, sourceSection(page, s.sourceIndex)!, ctx.validation));
    // Any section still missing entirely gets a minimal, content-complete fallback.
    for (const index of indices) {
      if (!sections.some((s) => s.sourceIndex === index)) {
        const source = sourceSection(page, index)!;
        sections.push(appendMissingText({ sourceIndex: index, archetype: "text", html: `<section class="section-y"><div class="container-site prose-site"></div></section>` }, source, ctx.validation));
      }
    }
    produced = [...produced, ...sections];
    warnings.push(...issues);
  }
  const sections = [...existing, ...produced].sort((a, b) => a.sourceIndex - b.sourceIndex);
  return { sections, warnings };
}

// ---------------------------------------------------------------------------------------------
// Translation (structure-preserving)
// ---------------------------------------------------------------------------------------------

const SEGMENT_BATCH = 250;

/** Translates HTML fragments by translating their text segments only; markup stays identical. */
export async function translateFragments(deps: PipelineDeps, fragments: string[], from: string, to: string, glossary: string[] = []): Promise<string[]> {
  const perFragment = fragments.map((f) => textSegments(f));
  const flat = perFragment.flat();
  const translated: string[] = [];
  for (let i = 0; i < flat.length; i += SEGMENT_BATCH) {
    const batch = flat.slice(i, i + SEGMENT_BATCH);
    const out = await call(deps, {
      purpose: "translate",
      system: TRANSLATOR_SYSTEM,
      effort: EFFORT.translate,
      maxTokens: 32000,
      schema: translationOutput,
      prompt: [
        `Translate each segment from ${languageName(from)} to ${languageName(to)}. Return exactly ${batch.length} segments in the same order.`,
        glossary.length ? `Never translate these names: ${JSON.stringify(glossary)}` : "",
        untrusted("segments", batch),
      ]
        .filter(Boolean)
        .join("\n\n"),
    });
    if (out.segments.length !== batch.length) throw new Error(`Translation returned ${out.segments.length} of ${batch.length} segments.`);
    translated.push(...out.segments);
  }
  let offset = 0;
  return fragments.map((fragment, i) => {
    const count = perFragment[i]!.length;
    const slice = translated.slice(offset, offset + count);
    offset += count;
    return applyTextSegments(fragment, slice);
  });
}

export async function translateMeta(deps: PipelineDeps, meta: { title: string; description: string }, from: string, to: string) {
  return call(deps, {
    purpose: "translate",
    system: TRANSLATOR_SYSTEM,
    effort: EFFORT.translate,
    maxTokens: 4000,
    schema: metaTranslationOutput,
    prompt: `Translate this page title and meta description from ${languageName(from)} to ${languageName(to)}, keeping brand names. Keep the title under 65 characters and the description under 160 characters where the source allows.\n\n${untrusted("meta", meta)}`,
  });
}

// ---------------------------------------------------------------------------------------------
// Visual QA
// ---------------------------------------------------------------------------------------------

export async function critiquePage(
  deps: PipelineDeps,
  input: { path: string; desktop: ImageInput; mobile: ImageInput; reference?: ImageInput; sections: { sourceIndex: number; archetype: string }[]; checks: string[] },
): Promise<Critique> {
  return call(deps, {
    purpose: "critique",
    system: CRITIC_SYSTEM,
    effort: EFFORT.critique,
    maxTokens: 16000,
    images: [...(input.reference ? [input.reference] : []), input.desktop, input.mobile],
    schema: critiqueOutput,
    prompt: [
      `Review the rendered page "${input.path}". Sections in order: ${JSON.stringify(input.sections)}.`,
      input.checks.length ? untrusted("automated_checks", input.checks) : "Automated checks found no problems.",
      "Score 0-10 (8+ = launch quality). List concrete, fixable issues per section (sourceIndex -2 header, -3 footer). Only report real visual problems: broken or overlapping layout, unreadable contrast, awkward empty space, text overflowing or clipped, images cropped badly, inconsistency with the approved reference, weak hierarchy. Do not ask for new content.",
    ].join("\n\n"),
  });
}

/** Applies critic issues to the affected sections (one explicit pass). */
export async function applyCritique(
  deps: PipelineDeps,
  ctx: PageContext,
  page: SourcePage,
  sections: GeneratedSection[],
  critique: Critique,
): Promise<GeneratedSection[]> {
  const issues: SectionIssue[] = critique.issues
    .filter((i) => i.severity !== "low" && i.sourceIndex >= -1)
    .map((i) => ({ sourceIndex: i.sourceIndex, severity: i.severity, message: `${i.problem} -> ${i.fix}` }));
  if (!issues.length) return sections;
  const fixed = await repair(deps, page, { ...ctx.direction, sections }, sections, { headerHtml: "", footerHtml: "" }, issues, ctx.validation, false);
  const indices = sections.map((s) => s.sourceIndex);
  const validated = validateSections(page, fixed.direction.sections, indices, ctx.validation);
  // Keep the previous version of any section the fix made worse (lost content).
  return indices.map((index) => {
    const candidate = validated.sections.find((s) => s.sourceIndex === index);
    const lostContent = validated.issues.some((i) => i.sourceIndex === index && i.severity === "high");
    return candidate && !lostContent ? candidate : sections.find((s) => s.sourceIndex === index)!;
  });
}

export type { Brief, Critique };
