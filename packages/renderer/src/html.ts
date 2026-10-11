import { parseDocument } from "htmlparser2";
import type { ChildNode, Element } from "domhandler";
import { escapeAttr, escapeText } from "@redesign/sanitizer";

const VOID = new Set(["area", "br", "col", "hr", "img", "input", "source", "wbr"]);
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
const BOOLEAN = new Set(["autoplay", "muted", "loop", "playsinline", "controls", "required", "checked", "disabled", "selected", "multiple", "open", "reversed", "novalidate", "allowfullscreen", "download", "hidden"]);

export type Attrs = [string, string | true][];

export interface ElementVisit {
  tag: string;
  attrs: Attrs;
  /** Raw HTML to place before the element. */
  before?: string;
  /** Raw HTML to place right after the opening tag. */
  prepend?: string;
  /** Raw HTML to place before the closing tag. */
  append?: string;
  /** Replace the whole element with raw HTML. */
  replace?: string;
}

/**
 * Re-serializes already-sanitized HTML while letting the caller rewrite element attributes.
 * Text is escaped again; attribute values are escaped; nothing new is parsed from strings except
 * the explicit `before/prepend/append/replace` snippets produced by the renderer itself.
 */
export function mapElements(html: string, visit: (el: ElementVisit, depth: number) => ElementVisit | null): string {
  const doc = parseDocument(html, { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true });
  const render = (nodes: ChildNode[], inSvg: boolean, depth: number): string =>
    nodes
      .map((node) => {
        if (node.type === "text") return escapeText((node as unknown as { data: string }).data);
        if (node.type !== "tag") return "";
        const el = node as Element;
        const svg = inSvg || el.name === "svg";
        const attrs: Attrs = Object.entries(el.attribs).map(([n, v]) => [
          SVG_CASE[n] ?? n,
          v === "" && BOOLEAN.has(n) ? true : v,
        ]);
        const out = visit({ tag: el.name, attrs }, depth);
        if (!out) return "";
        if (out.replace !== undefined) return out.replace;
        const tag = svg ? (SVG_CASE[out.tag] ?? out.tag) : out.tag;
        const attrString = out.attrs.map(([n, v]) => (v === true ? ` ${n}` : ` ${n}="${escapeAttr(v)}"`)).join("");
        const open = `${out.before ?? ""}<${tag}${attrString}>`;
        if (!svg && VOID.has(out.tag)) return open;
        return `${open}${out.prepend ?? ""}${render(el.children, svg, depth + 1)}${out.append ?? ""}</${tag}>`;
      })
      .join("");
  return render(doc.children, false, 0);
}

export const getAttr = (attrs: Attrs, name: string): string | undefined => {
  const hit = attrs.find(([n]) => n === name);
  return hit ? (hit[1] === true ? "" : hit[1]) : undefined;
};

export const setAttr = (attrs: Attrs, name: string, value: string | true): Attrs => {
  const without = attrs.filter(([n]) => n !== name);
  return [...without, [name, value]];
};

export const removeAttr = (attrs: Attrs, name: string): Attrs => attrs.filter(([n]) => n !== name);

export function hasClass(attrs: Attrs, cls: string): boolean {
  return (getAttr(attrs, "class") ?? "").split(/\s+/).includes(cls);
}
