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

/** A page that is being built (for the menu): path plus what to call it if the source menu does not. */
export interface SitePageRef {
  path: string;
  title: string;
  heading: string;
}

export interface MenuItem {
  label: string;
  href: string;
  /** Call-to-action link (styled as a button). */
  primary: boolean;
  /** Overflow item: only in the mobile/overlay menu, not in the desktop bar. */
  more: boolean;
}

/** Items shown in the desktop menu bar; the rest go to the mobile/overlay menu. */
export const MENU_BAR_ITEMS = 8;

const normPath = (p: string) => {
  const path = p.split("#")[0]!.split("?")[0]!.toLowerCase();
  return path.length > 1 ? path.replace(/\/+$/, "") : "/";
};

/** Menu label for a page outside the source menu: its title before the site-name separator, else its H1. */
function pageLabel(page: SitePageRef, siteNames: string[]): string {
  const first = page.title.split(/\s+[|–—-]\s+/)[0]?.trim() ?? "";
  const lower = first.toLowerCase();
  const isSiteName = siteNames.some((n) => n && (lower === n.toLowerCase() || n.toLowerCase().startsWith(`${lower} `)));
  return (first && !isSiteName && first.length <= 40 ? first : page.heading.trim()) || first || page.path;
}

/**
 * The site menu = the pages that are built. Items from the source menu that point to a built page keep
 * their label and order; built pages the source menu did not list follow (shallow paths first). A source
 * call-to-action is kept when it points to a built page or is a phone/e-mail link. Without a page list
 * (older callers) the source menu is used as is.
 */
export function siteMenu(home: SourcePage, pages: SitePageRef[] | undefined, origin: string): MenuItem[] {
  if (!pages?.length) return home.nav.map((l, i) => ({ label: l.label, href: promptHref(l, origin), primary: l.primary, more: i >= MENU_BAR_ITEMS && !l.primary }));
  const built = new Map(pages.map((p) => [normPath(p.path), p]));
  const items: MenuItem[] = [];
  const used = new Set<string>();
  for (const link of home.nav) {
    const href = promptHref(link, origin);
    if (/^(tel|mailto):/.test(href)) {
      if (link.primary) items.push({ label: link.label, href, primary: true, more: false });
      continue;
    }
    const key = normPath(href);
    if (!href.startsWith("/") || !built.has(key)) continue;
    if (used.has(key) && !link.primary) continue;
    used.add(key);
    items.push({ label: link.label, href: built.get(key)!.path, primary: link.primary, more: false });
  }
  const names = [home.facts.organizationName, ...home.title.split(/\s+[|–—-]\s+/)];
  const rest = pages
    .filter((p) => !used.has(normPath(p.path)) && normPath(p.path) !== "/")
    .sort((a, b) => a.path.split("/").length - b.path.split("/").length);
  for (const page of rest) items.push({ label: pageLabel(page, names), href: page.path, primary: false, more: false });
  let bar = 0;
  return items.map((item) => (item.primary ? item : { ...item, more: bar++ >= MENU_BAR_ITEMS }));
}

export function siteNavForPrompt(page: SourcePage, origin: string, menu?: MenuItem[]) {
  return {
    logo: page.logo?.mediaId ? `media:${page.logo.mediaId}` : null,
    nav: menu ?? siteMenu(page, undefined, origin),
    footer: sectionForPrompt(page.footer, page.sections.length, origin),
  };
}

/** Rule for the designer: the header menu is exactly the given items. */
export const MENU_RULE =
  "Header navigation: use exactly the items in site_navigation.nav, in that order, with their labels verbatim and hrefs as given. Items with more:true belong only in the mobile/overlay menu; primary:true items are call-to-action buttons. Do not add any other links to the header.";

/** Wraps untrusted data so instructions inside it are not followed. */
export function untrusted(label: string, data: unknown): string {
  return `<${label}>\n${JSON.stringify(data)}\n</${label}>`;
}
