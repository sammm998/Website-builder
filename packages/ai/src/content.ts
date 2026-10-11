import type { Block, Link, SourcePage, SourceSection } from "@redesign/schema";

/** Converts a source link into the href the generated site must use (internal links become paths). */
export function promptHref(link: Link, origin: string): string {
  if (link.href.startsWith("#") || link.href.startsWith("mailto:") || link.href.startsWith("tel:")) return link.href;
  try {
    const u = new URL(link.href);
    const o = new URL(origin);
    if (u.hostname.replace(/^www\./, "") === o.hostname.replace(/^www\./, "")) {
      const path = u.pathname.length > 1 ? u.pathname.replace(/\/$/, "") : "/";
      return `${path}${u.hash}`;
    }
    return u.href;
  } catch {
    return link.href;
  }
}

type PromptBlock =
  | { heading: string; level: number }
  | { p: string }
  | { list: string[]; ordered: boolean }
  | { quote: string; cite: string }
  | { image: string; alt: string; role: string; size: string }
  | { video: string; size: string }
  | { links: { label: string; href: string; primary: boolean }[] }
  | { form: string; fields: { name: string; type: string; label: string; placeholder: string; required: boolean; options: string[] }[]; submit: string }
  | { embed: string; kind: string; title: string }
  | { table: string[][]; header: boolean };

function blockForPrompt(block: Block, origin: string): PromptBlock | null {
  switch (block.type) {
    case "heading":
      return { heading: block.text, level: block.level };
    case "paragraph":
      return { p: block.text };
    case "list":
      return { list: block.items, ordered: block.ordered };
    case "quote":
      return { quote: block.text, cite: block.cite };
    case "media": {
      const m = block.media;
      if (!m.mediaId) return null; // not cached -> cannot be used
      const size = m.width && m.height ? `${m.width}x${m.height}` : "unknown";
      return m.kind === "video" ? { video: `media:${m.mediaId}`, size } : { image: `media:${m.mediaId}`, alt: m.alt, role: m.role, size };
    }
    case "links":
      return { links: block.links.map((l) => ({ label: l.label, href: promptHref(l, origin), primary: l.primary })) };
    case "form":
      return {
        form: `form:${block.form.key}`,
        fields: block.form.fields.map((f) => ({ name: f.name, type: f.type, label: f.label, placeholder: f.placeholder, required: f.required, options: f.options })),
        submit: block.form.submitLabel,
      };
    case "embed":
      return block.embed.kind === "other" ? null : { embed: block.embed.src, kind: block.embed.kind, title: block.embed.title };
    case "table":
      return { table: block.rows, header: block.header };
    default:
      return null;
  }
}

export interface PromptSection {
  sourceIndex: number;
  heading: string;
  blocks: PromptBlock[];
}

export function sectionForPrompt(section: SourceSection, sourceIndex: number, origin: string): PromptSection {
  return {
    sourceIndex,
    heading: section.heading,
    blocks: section.blocks.map((b) => blockForPrompt(b, origin)).filter((b): b is PromptBlock => b !== null),
  };
}

/** Compact, ordered JSON-able description of a page; text is verbatim. */
export function pageForPrompt(page: SourcePage, origin: string, indices?: number[]) {
  const wanted = indices ? new Set(indices) : null;
  return {
    path: page.path,
    lang: page.lang,
    title: page.title,
    sections: [
      ...(wanted && !wanted.has(-1) ? [] : [sectionForPrompt(page.hero, -1, origin)]),
      ...page.sections
        .map((s, i) => sectionForPrompt(s, i, origin))
        .filter((s) => !wanted || wanted.has(s.sourceIndex)),
    ],
  };
}

export function siteNavForPrompt(page: SourcePage, origin: string) {
  return {
    logo: page.logo?.mediaId ? `media:${page.logo.mediaId}` : null,
    nav: page.nav.map((l) => ({ label: l.label, href: promptHref(l, origin), primary: l.primary })),
    footer: sectionForPrompt(page.footer, page.sections.length, origin),
  };
}

/** Wraps untrusted data so instructions inside it are not followed. */
export function untrusted(label: string, data: unknown): string {
  return `<${label}>\n${JSON.stringify(data)}\n</${label}>`;
}
