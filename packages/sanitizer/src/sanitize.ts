import { parseDocument } from "htmlparser2";
import type { ChildNode, Element } from "domhandler";
import { isMotionEffect, normalizeMotionParam, MOTION_EFFECT_NAMES } from "@redesign/schema";

/**
 * Allowlist HTML sanitizer for AI-generated section markup.
 *
 * The output is re-serialized from scratch (never passed through), so anything not explicitly allowed
 * here cannot reach a rendered page: no scripts, inline styles, event handlers, foreign URLs for media,
 * or unknown protocols. Media must reference cached project assets as `media:<uuid>`, forms post to
 * `form:<key>` placeholders, and motion is requested declaratively via data attributes.
 */

export interface SanitizeContext {
  /** Returns true when the media id belongs to the project's cache. */
  isKnownMedia: (id: string) => boolean;
  /** Allowed form keys (from the source page). */
  formKeys?: ReadonlySet<string>;
  /** Max output length safety cap. */
  maxLength?: number;
}

export interface SanitizeResult {
  html: string;
  /** Human-readable notes of what was removed (fed back to the generator on retry). */
  removed: string[];
  media: string[];
  links: string[];
  forms: string[];
  motion: string[];
  /** Visible text content (decoded), joined by spaces at element boundaries. */
  text: string;
}

const VOID = new Set(["area", "br", "col", "hr", "img", "input", "source", "wbr"]);

/** Tags whose entire subtree is discarded. */
const DROP_WITH_CONTENT = new Set([
  "script", "style", "object", "embed", "applet", "noscript", "template", "link", "meta", "base",
  "frame", "frameset", "title", "head", "math", "foreignobject", "use", "animate", "animatemotion",
  "animatetransform", "set", "image", "xmp", "plaintext", "noembed", "noframes", "portal", "canvas",
  "audio", "track", "dialog", "slot", "param",
]);

const HTML_TAGS = new Set([
  "section", "div", "header", "footer", "nav", "main", "article", "aside", "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "span", "strong", "em", "b", "i", "u", "s", "small", "mark", "sup", "sub", "br", "hr", "ul", "ol", "li",
  "dl", "dt", "dd", "a", "img", "picture", "figure", "figcaption", "blockquote", "cite", "q", "time",
  "address", "button", "form", "input", "textarea", "select", "option", "label", "fieldset", "legend",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col", "details", "summary",
  "video", "iframe", "abbr", "wbr", "svg",
]);

const SVG_TAGS = new Set([
  "svg", "g", "path", "circle", "ellipse", "rect", "line", "polyline", "polygon", "defs", "lineargradient",
  "radialgradient", "stop", "clippath", "mask", "pattern", "text", "tspan", "title", "desc", "symbol",
]);

/** htmlparser2 lowercases attribute & tag names; restore SVG camelCase. */
const SVG_CASE: Record<string, string> = {
  viewbox: "viewBox",
  preserveaspectratio: "preserveAspectRatio",
  gradientunits: "gradientUnits",
  gradienttransform: "gradientTransform",
  lineargradient: "linearGradient",
  radialgradient: "radialGradient",
  clippath: "clipPath",
  clippathunits: "clipPathUnits",
  maskunits: "maskUnits",
  patternunits: "patternUnits",
  textlength: "textLength",
};

const GLOBAL_ATTRS = new Set(["class", "id", "role", "title", "lang", "dir", "hidden", "tabindex"]);

const TAG_ATTRS: Record<string, string[]> = {
  a: ["href", "target", "rel", "download"],
  img: ["src", "alt", "width", "height", "loading", "decoding", "fetchpriority"],
  video: ["src", "poster", "autoplay", "muted", "loop", "playsinline", "controls", "preload", "width", "height"],
  iframe: ["src", "title", "width", "height", "allowfullscreen"],
  time: ["datetime"],
  blockquote: ["cite"],
  q: ["cite"],
  button: ["type", "disabled", "name", "value"],
  form: ["action", "method", "novalidate"],
  input: ["type", "name", "value", "placeholder", "required", "checked", "disabled", "autocomplete", "min", "max", "step", "pattern", "inputmode", "maxlength"],
  textarea: ["name", "placeholder", "required", "rows", "cols", "autocomplete", "maxlength"],
  select: ["name", "required", "multiple"],
  option: ["value", "selected", "disabled"],
  label: ["for"],
  th: ["colspan", "rowspan", "scope"],
  td: ["colspan", "rowspan"],
  col: ["span"],
  colgroup: ["span"],
  details: ["open"],
  ol: ["start", "reversed"],
  abbr: [],
};

const SVG_ATTRS = new Set([
  "viewbox", "xmlns", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray",
  "stroke-dashoffset", "stroke-miterlimit", "stroke-opacity", "fill-opacity", "fill-rule", "clip-rule", "opacity",
  "d", "cx", "cy", "r", "rx", "ry", "x", "y", "x1", "x2", "y1", "y2", "width", "height", "points", "transform",
  "offset", "stop-color", "stop-opacity", "gradientunits", "gradienttransform", "preserveaspectratio",
  "clip-path", "mask", "clippathunits", "maskunits", "patternunits", "text-anchor", "dominant-baseline",
  "font-size", "font-weight", "letter-spacing", "textlength", "vector-effect", "focusable",
]);

const INPUT_TYPES = new Set(["text", "email", "tel", "number", "url", "date", "checkbox", "radio", "hidden", "submit", "search"]);
const ROLES = new Set([
  "button", "link", "list", "listitem", "navigation", "banner", "contentinfo", "main", "region", "img",
  "presentation", "none", "heading", "group", "tablist", "tab", "tabpanel", "menu", "menuitem", "dialog",
  "complementary", "marquee", "separator", "note", "figure",
]);

const EMBED_PREFIXES = [
  "https://www.youtube-nocookie.com/embed/",
  "https://www.youtube.com/embed/",
  "https://player.vimeo.com/video/",
  "https://www.google.com/maps/embed",
  "https://maps.google.com/maps?",
];

const MEDIA_RE = /^media:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const FORM_RE = /^form:([a-z0-9-]{1,64})$/;
const CLASS_TOKEN_RE = /^[A-Za-z0-9_\-:/.[\]%#(),!@*&>+~=|]+$/;
const ID_RE = /^[A-Za-z][\w-]{0,63}$/;
const MARKER_ATTRS = new Set(["data-restored-content", "data-step", "data-step-progress", "data-lang-switch", "data-track", "data-toggle", "data-target", "data-tab", "data-panel", "data-count"]);

export function escapeText(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
}
export function escapeAttr(s: string): string {
  return s.replace(/[&<>"]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;"));
}

/** Normalizes an href; returns null for anything that is not a safe, explicit target. */
export function safeHref(raw: string): string | null {
  // eslint-disable-next-line no-control-regex
  const value = raw.replace(/[\u0000- \u007f-\u009f]/g, "");
  if (!value) return null;
  if (/^#[A-Za-z][\w-]*$/.test(value) || value === "#") return value;
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) {
    try {
      const u = new URL(value, "https://internal.invalid");
      return u.origin === "https://internal.invalid" ? u.pathname + u.search + u.hash : null;
    } catch {
      return null;
    }
  }
  try {
    const u = new URL(value);
    if (u.protocol === "https:" || u.protocol === "http:") return u.username || u.password ? null : u.href;
    if (u.protocol === "mailto:" || u.protocol === "tel:") return u.href;
  } catch {
    return null;
  }
  return null;
}

export function safeClassList(raw: string): string {
  return raw
    .split(/\s+/)
    .filter(
      (token) =>
        token.length > 0 &&
        token.length <= 120 &&
        CLASS_TOKEN_RE.test(token) &&
        !/url\(|expression|@import|javascript:|\\/i.test(token),
    )
    .slice(0, 80)
    .join(" ");
}

export function sanitizeFragment(input: string, ctx: SanitizeContext): SanitizeResult {
  const removed: string[] = [];
  const media = new Set<string>();
  const links = new Set<string>();
  const forms = new Set<string>();
  const motion = new Set<string>();
  const textParts: string[] = [];
  const note = (msg: string) => {
    if (removed.length < 200) removed.push(msg);
  };

  const doc = parseDocument(input, { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true });

  const renderChildren = (nodes: ChildNode[], inSvg: boolean): string => nodes.map((n) => renderNode(n, inSvg)).join("");

  const renderNode = (node: ChildNode, inSvg: boolean): string => {
    if (node.type === "text") {
      const data = (node as unknown as { data: string }).data;
      if (data.trim()) textParts.push(data);
      return escapeText(data);
    }
    if (node.type === "tag" || node.type === "script" || node.type === "style") {
      return renderElement(node as Element, inSvg);
    }
    if (node.type === "cdata" || node.type === "root") {
      return renderChildren((node as unknown as { children: ChildNode[] }).children ?? [], inSvg);
    }
    return ""; // comments, directives
  };

  const renderElement = (el: Element, parentSvg: boolean): string => {
    const tag = el.name.toLowerCase();
    if (DROP_WITH_CONTENT.has(tag) && !(parentSvg && tag === "title")) {
      note(`removed <${tag}>`);
      return "";
    }
    const inSvg = parentSvg || tag === "svg";
    const allowed = inSvg ? SVG_TAGS.has(tag) : HTML_TAGS.has(tag);
    if (!allowed) {
      note(`unwrapped <${tag}>`);
      textParts.push(" ");
      const inner = renderChildren(el.children, inSvg);
      textParts.push(" ");
      return inner;
    }

    const attrs: [string, string | true][] = [];
    const raw = el.attribs ?? {};
    let dropElement = false;

    for (const [nameRaw, value] of Object.entries(raw)) {
      const name = nameRaw.toLowerCase();
      if (name.startsWith("on") || name === "style" || name === "srcset" || name === "sizes" || name.includes(":")) {
        note(`removed ${name} on <${tag}>`);
        continue;
      }
      if (name === "class") {
        const cls = safeClassList(value);
        if (cls !== value.trim().replace(/\s+/g, " ")) note(`filtered class tokens on <${tag}>`);
        if (cls) attrs.push(["class", cls]);
        continue;
      }
      if (name === "id") {
        if (ID_RE.test(value)) attrs.push(["id", value]);
        else note(`removed invalid id`);
        continue;
      }
      if (name === "role") {
        if (ROLES.has(value)) attrs.push(["role", value]);
        continue;
      }
      if (name === "tabindex") {
        if (value === "0" || value === "-1") attrs.push(["tabindex", value]);
        continue;
      }
      if (name.startsWith("aria-") && /^aria-[a-z]+$/.test(name)) {
        attrs.push([name, value.slice(0, 300)]);
        continue;
      }
      if (name === "data-motion") {
        const effects = value.split(/\s+/).filter((e) => {
          const ok = isMotionEffect(e);
          if (!ok && e) note(`unknown motion effect "${e}"`);
          return ok;
        });
        const unique = [...new Set(effects)].slice(0, 4);
        unique.forEach((e) => motion.add(e));
        if (unique.length) attrs.push(["data-motion", unique.join(" ")]);
        continue;
      }
      if (name.startsWith("data-")) {
        if (MARKER_ATTRS.has(name)) {
          if (/^[\w-]{0,40}$/.test(value)) attrs.push([name, value]);
          continue;
        }
        const effect = MOTION_EFFECT_NAMES.find((e) => name.startsWith(`data-${e}-`));
        if (effect) {
          const param = name.slice(`data-${effect}-`.length);
          const normalized = normalizeMotionParam(effect, param, value);
          if (normalized !== null) attrs.push([name, normalized]);
          else note(`invalid motion param ${name}="${value}"`);
          continue;
        }
        note(`removed ${name}`);
        continue;
      }
      if (GLOBAL_ATTRS.has(name)) {
        attrs.push([name, name === "hidden" ? true : value.slice(0, 300)]);
        continue;
      }
      if (inSvg) {
        if (SVG_ATTRS.has(name)) {
          if (/url\(/i.test(value) && !/^url\(#[A-Za-z][\w-]*\)$/.test(value.trim())) {
            note(`removed external url() in svg ${name}`);
            continue;
          }
          attrs.push([SVG_CASE[name] ?? name, value.slice(0, 20000)]);
        } else note(`removed svg attribute ${name}`);
        continue;
      }
      if (!(TAG_ATTRS[tag] ?? []).includes(name)) {
        note(`removed ${name} on <${tag}>`);
        continue;
      }
      // Tag-specific value validation.
      if (tag === "a" && name === "href") {
        const href = safeHref(value);
        if (href) {
          attrs.push(["href", href]);
          links.add(href);
        } else note(`removed unsafe href "${value.slice(0, 80)}"`);
        continue;
      }
      if (tag === "a" && name === "target") {
        if (value === "_blank") attrs.push(["target", "_blank"]);
        continue;
      }
      if (tag === "a" && name === "rel") continue; // set below
      if ((tag === "img" || tag === "video") && (name === "src" || name === "poster")) {
        const m = MEDIA_RE.exec(value.trim());
        if (m && ctx.isKnownMedia(m[1]!.toLowerCase())) {
          attrs.push([name, `media:${m[1]!.toLowerCase()}`]);
          media.add(m[1]!.toLowerCase());
        } else {
          note(`removed <${tag}> with unknown media "${value.slice(0, 80)}"`);
          if (name === "src") dropElement = true;
        }
        continue;
      }
      if (tag === "iframe" && name === "src") {
        const src = value.trim();
        if (EMBED_PREFIXES.some((p) => src.startsWith(p)) && safeHref(src)) attrs.push(["src", src]);
        else {
          note(`removed iframe with non-allowlisted src`);
          dropElement = true;
        }
        continue;
      }
      if (tag === "form" && name === "action") {
        const m = FORM_RE.exec(value.trim());
        if (m && (!ctx.formKeys || ctx.formKeys.has(m[1]!))) {
          attrs.push(["action", `form:${m[1]}`]);
          forms.add(m[1]!);
        } else {
          note(`removed form action "${value.slice(0, 80)}"`);
        }
        continue;
      }
      if (tag === "form" && name === "method") {
        attrs.push(["method", "post"]);
        continue;
      }
      if (tag === "input" && name === "type") {
        if (INPUT_TYPES.has(value)) attrs.push(["type", value]);
        continue;
      }
      if (tag === "button" && name === "type") {
        if (value === "button" || value === "submit") attrs.push(["type", value]);
        continue;
      }
      if (tag === "blockquote" || tag === "q") {
        const href = safeHref(value);
        if (href) attrs.push(["cite", href]);
        continue;
      }
      if (["width", "height", "rows", "cols", "colspan", "rowspan", "span", "start", "maxlength", "min", "max", "step"].includes(name)) {
        if (/^-?\d{1,5}(\.\d+)?$/.test(value)) attrs.push([name, value]);
        continue;
      }
      if (["autoplay", "muted", "loop", "playsinline", "controls", "required", "checked", "disabled", "selected", "multiple", "open", "reversed", "novalidate", "allowfullscreen", "download"].includes(name)) {
        attrs.push([name, true]);
        continue;
      }
      if (name === "loading" && !["lazy", "eager"].includes(value)) continue;
      if (name === "decoding" && !["async", "sync", "auto"].includes(value)) continue;
      if (name === "fetchpriority" && !["high", "low", "auto"].includes(value)) continue;
      if (name === "preload" && !["none", "metadata", "auto"].includes(value)) continue;
      attrs.push([name, value.slice(0, 500)]);
    }

    if (dropElement) return "";

    // Element-level policies.
    if (tag === "img" && !attrs.some(([n]) => n === "src")) {
      note(`removed <img> without media src`);
      return "";
    }
    if (tag === "img" && !attrs.some(([n]) => n === "alt")) attrs.push(["alt", ""]);
    if (tag === "video") {
      if (!attrs.some(([n]) => n === "src")) return "";
      if (attrs.some(([n]) => n === "autoplay")) {
        for (const forced of ["muted", "playsinline"]) if (!attrs.some(([n]) => n === forced)) attrs.push([forced, true]);
      }
    }
    if (tag === "iframe") {
      if (!attrs.some(([n]) => n === "src")) return "";
      attrs.push(["loading", "lazy"], ["referrerpolicy", "strict-origin-when-cross-origin"]);
      attrs.push(["sandbox", "allow-scripts allow-same-origin allow-presentation allow-popups"]);
      if (!attrs.some(([n]) => n === "title")) attrs.push(["title", "Embedded content"]);
    }
    if (tag === "a") {
      if (attrs.some(([n, v]) => n === "target" && v === "_blank")) attrs.push(["rel", "noopener noreferrer"]);
    }
    if (tag === "form") {
      if (!attrs.some(([n]) => n === "action")) {
        note(`removed <form> without valid action; kept fields`);
        return renderChildren(el.children, inSvg);
      }
      if (!attrs.some(([n]) => n === "method")) attrs.push(["method", "post"]);
    }
    if (tag === "svg" && !attrs.some(([n]) => n === "xmlns")) attrs.push(["xmlns", "http://www.w3.org/2000/svg"]);

    const outTag = inSvg ? (SVG_CASE[tag] ?? tag) : tag;
    const attrString = attrs.map(([n, v]) => (v === true ? ` ${n}` : ` ${n}="${escapeAttr(v)}"`)).join("");
    if (!inSvg && VOID.has(tag)) return `<${outTag}${attrString}>`;
    const isBlock = !["span", "strong", "em", "b", "i", "u", "s", "small", "mark", "sup", "sub", "abbr", "cite", "q", "time", "a"].includes(tag);
    if (isBlock) textParts.push(" ");
    const inner = renderChildren(el.children, inSvg);
    if (isBlock) textParts.push(" ");
    return `<${outTag}${attrString}>${inner}</${outTag}>`;
  };

  let html = renderChildren(doc.children, false);
  const max = ctx.maxLength ?? 200_000;
  if (html.length > max) {
    note(`output exceeded ${max} characters`);
    html = "";
  }
  return {
    html,
    removed,
    media: [...media],
    links: [...links],
    forms: [...forms],
    motion: [...motion],
    text: textParts.join("").replace(/\s+/g, " ").trim(),
  };
}
