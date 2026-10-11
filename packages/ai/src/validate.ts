import { sanitizeFragment, escapeText, escapeAttr } from "@redesign/sanitizer";
import {
  normalizeText,
  sectionLinks,
  sectionMedia,
  sectionTexts,
  type GeneratedSection,
  type SourcePage,
  type SourceSection,
} from "@redesign/schema";
import { promptHref } from "./content";

export interface ValidationContext {
  origin: string;
  /** Media ids that exist in the project cache. */
  mediaIds: ReadonlySet<string>;
  formKeys: ReadonlySet<string>;
}

export interface SectionIssue {
  sourceIndex: number;
  severity: "high" | "medium" | "low";
  message: string;
}

export interface ValidatedSections {
  sections: GeneratedSection[];
  issues: SectionIssue[];
}

export function sourceSection(page: SourcePage, index: number): SourceSection | undefined {
  if (index === -1) return page.hero;
  if (index === -3) return page.footer;
  return page.sections[index];
}

function sanitize(html: string, ctx: ValidationContext) {
  return sanitizeFragment(html, { isKnownMedia: (id) => ctx.mediaIds.has(id), formKeys: ctx.formKeys });
}

/** Checks one sanitized fragment against its source section: verbatim text, media and links. */
export function checkFidelity(section: SourceSection, sanitizedHtml: string, text: string, ctx: ValidationContext, sourceIndex: number): SectionIssue[] {
  const issues: SectionIssue[] = [];
  const haystack = normalizeText(text);
  const missingText = sectionTexts(section)
    .map(normalizeText)
    .filter((t) => t && !haystack.includes(t));
  if (missingText.length) {
    issues.push({ sourceIndex, severity: "high", message: `Missing or altered source text (must appear verbatim): ${JSON.stringify(missingText.slice(0, 12))}` });
  }
  const missingMedia = sectionMedia(section)
    .filter((m) => m.mediaId && ctx.mediaIds.has(m.mediaId) && !sanitizedHtml.includes(`media:${m.mediaId}`))
    .map((m) => `media:${m.mediaId}`);
  if (missingMedia.length) issues.push({ sourceIndex, severity: "high", message: `Unused source media (use each at least once): ${missingMedia.join(", ")}` });
  const missingLinks = sectionLinks(section)
    .map((l) => promptHref(l, ctx.origin))
    .filter((href) => !href.startsWith("#") && !sanitizedHtml.includes(`href="${escapeAttr(href)}"`) && !sanitizedHtml.includes(`href="${escapeAttr(href.replace(/\/$/, ""))}"`));
  if (missingLinks.length) issues.push({ sourceIndex, severity: "medium", message: `Missing links (keep exact hrefs): ${JSON.stringify([...new Set(missingLinks)])}` });
  return issues;
}

/**
 * Sanitizes generated sections and verifies coverage: each expected source index exactly once, every
 * source text verbatim, every media and link used. Returns sanitized sections + issues for repair.
 */
export function validateSections(
  page: SourcePage,
  generated: GeneratedSection[],
  expected: number[],
  ctx: ValidationContext,
): ValidatedSections {
  const issues: SectionIssue[] = [];
  const seen = new Map<number, GeneratedSection>();
  for (const g of generated) {
    if (!expected.includes(g.sourceIndex)) {
      issues.push({ sourceIndex: g.sourceIndex, severity: "medium", message: `Unexpected sourceIndex ${g.sourceIndex}; only ${expected.join(", ")} are allowed.` });
      continue;
    }
    if (seen.has(g.sourceIndex)) {
      issues.push({ sourceIndex: g.sourceIndex, severity: "medium", message: `sourceIndex ${g.sourceIndex} appears more than once; merge into one section.` });
      continue;
    }
    seen.set(g.sourceIndex, g);
  }
  const sections: GeneratedSection[] = [];
  let h1Count = 0;
  for (const index of expected) {
    const g = seen.get(index);
    const source = sourceSection(page, index);
    if (!source) continue;
    if (!g) {
      issues.push({ sourceIndex: index, severity: "high", message: `Section for sourceIndex ${index} is missing.` });
      continue;
    }
    const result = sanitize(g.html, ctx);
    h1Count += (result.html.match(/<h1[\s>]/g) ?? []).length;
    const relevantRemovals = result.removed.filter((r) => !/filtered class tokens/.test(r));
    if (relevantRemovals.length) {
      issues.push({ sourceIndex: index, severity: "low", message: `Sanitizer removed: ${[...new Set(relevantRemovals)].slice(0, 8).join("; ")}` });
    }
    issues.push(...checkFidelity(source, result.html, result.text, ctx, index));
    sections.push({ ...g, html: result.html });
  }
  if (expected.includes(-1) && h1Count !== 1) {
    issues.push({ sourceIndex: -1, severity: "medium", message: `Page must contain exactly one <h1> (in the hero); found ${h1Count}.` });
  }
  return { sections, issues };
}

/** Sanitizes header/footer and checks nav labels and footer content are preserved. */
export function validateLayout(page: SourcePage, headerHtml: string, footerHtml: string, ctx: ValidationContext) {
  const header = sanitize(headerHtml, ctx);
  const footer = sanitize(footerHtml, ctx);
  const issues: SectionIssue[] = [];
  const headerText = normalizeText(header.text);
  const missingNav = page.nav.map((l) => normalizeText(l.label)).filter((l) => l && !headerText.includes(l));
  if (missingNav.length) issues.push({ sourceIndex: -2, severity: "high", message: `Header is missing navigation items: ${JSON.stringify(missingNav)}` });
  if (page.logo?.mediaId && ctx.mediaIds.has(page.logo.mediaId) && !header.html.includes(`media:${page.logo.mediaId}`)) {
    issues.push({ sourceIndex: -2, severity: "medium", message: `Header must show the logo media:${page.logo.mediaId}.` });
  }
  if (!/data-toggle="menu"/.test(header.html)) issues.push({ sourceIndex: -2, severity: "medium", message: "Header needs a mobile menu toggle (data-toggle=\"menu\")." });
  issues.push(...checkFidelity(page.footer, footer.html, footer.text, ctx, -3));
  return { headerHtml: header.html, footerHtml: footer.html, issues };
}

/**
 * Last-resort content guarantee: appends any source text still missing after the repair attempt as a
 * plain prose block inside the section, so content is never lost (QA flags it for a visual pass).
 */
export function appendMissingText(section: GeneratedSection, source: SourceSection, ctx: ValidationContext): GeneratedSection {
  const result = sanitize(section.html, ctx);
  const haystack = normalizeText(result.text);
  const missing = sectionTexts(source).filter((t) => !haystack.includes(normalizeText(t)));
  if (!missing.length) return section;
  const block = `<div class="container-site prose-site pb-12" data-restored-content>${missing.map((t) => `<p>${escapeText(t)}</p>`).join("")}</div>`;
  const html = /<\/section>\s*$/.test(section.html) ? section.html.replace(/<\/section>\s*$/, `${block}</section>`) : `${section.html}${block}`;
  return { ...section, html: sanitize(html, ctx).html };
}

export function blockingIssues(issues: SectionIssue[]): SectionIssue[] {
  return issues.filter((i) => i.severity !== "low");
}
