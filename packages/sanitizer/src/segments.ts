import { parseDocument } from "htmlparser2";
import type { ChildNode, Element } from "domhandler";
import { escapeAttr, escapeText } from "./sanitize";

/**
 * Translation helpers. Text nodes and human-readable attributes are extracted in document order,
 * translated as a flat list and written back. Structure, classes, media and links therefore stay
 * byte-identical between languages by construction.
 */

const TRANSLATABLE_ATTRS = ["alt", "title", "aria-label", "placeholder"] as const;
const VOID = new Set(["area", "br", "col", "hr", "img", "input", "source", "wbr"]);
const SVG_CASE: Record<string, string> = {
  viewbox: "viewBox",
  preserveaspectratio: "preserveAspectRatio",
  gradientunits: "gradientUnits",
  gradienttransform: "gradientTransform",
  lineargradient: "linearGradient",
  radialgradient: "radialGradient",
  clippath: "clipPath",
};

type Visitor = {
  text: (value: string) => string;
  attr: (name: string, value: string) => string;
};

function walk(html: string, visitor: Visitor): string {
  const doc = parseDocument(html, { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true });
  const render = (nodes: ChildNode[], inSvg: boolean): string =>
    nodes
      .map((node) => {
        if (node.type === "text") {
          const data = (node as unknown as { data: string }).data;
          if (!data.trim()) return escapeText(data);
          const lead = /^\s*/.exec(data)![0];
          const trail = /\s*$/.exec(data)![0];
          return escapeText(lead + visitor.text(data.trim()) + trail);
        }
        if (node.type !== "tag") return "";
        const el = node as Element;
        const svg = inSvg || el.name === "svg";
        const tag = svg ? (SVG_CASE[el.name] ?? el.name) : el.name;
        const attrs = Object.entries(el.attribs)
          .map(([name, value]) => {
            const out = (TRANSLATABLE_ATTRS as readonly string[]).includes(name) && value.trim() ? visitor.attr(name, value) : value;
            const outName = SVG_CASE[name] ?? name;
            return value === "" && !["alt", "value", "class"].includes(name) ? ` ${outName}` : ` ${outName}="${escapeAttr(out)}"`;
          })
          .join("");
        if (!svg && VOID.has(el.name)) return `<${tag}${attrs}>`;
        return `<${tag}${attrs}>${render(el.children, svg)}</${tag}>`;
      })
      .join("");
  return render(doc.children, false);
}

/** Ordered translatable strings in sanitized HTML. */
export function textSegments(html: string): string[] {
  const out: string[] = [];
  walk(html, {
    text: (v) => (out.push(v), v),
    attr: (_n, v) => (out.push(v), v),
  });
  return out;
}

/** Writes translated strings back in the same order. Throws if the count does not match. */
export function applyTextSegments(html: string, translated: readonly string[]): string {
  const expected = textSegments(html).length;
  if (translated.length !== expected) {
    throw new Error(`Translation returned ${translated.length} segments, expected ${expected}.`);
  }
  let i = 0;
  return walk(html, {
    text: () => translated[i++]!,
    attr: () => translated[i++]!,
  });
}
