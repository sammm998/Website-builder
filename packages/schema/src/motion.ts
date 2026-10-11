/**
 * Motion vocabulary shared by the sanitizer (validation), the motion runtime (execution)
 * and the AI prompts (documentation). Generated HTML may only request effects listed here,
 * via `data-motion="effect another-effect"` plus `data-<effect>-<param>="value"` attributes.
 * No generated JavaScript or CSS is ever executed.
 */

export type MotionParam =
  | { kind: "number"; min: number; max: number; default: number }
  | { kind: "enum"; values: readonly string[]; default: string }
  | { kind: "boolean"; default: boolean };

export interface MotionEffectSpec {
  /** One-line description used in AI prompts and docs. */
  description: string;
  /** Where the attribute belongs. */
  target: "element" | "container" | "section" | "image" | "text" | "page";
  params: Record<string, MotionParam>;
  /** Effects that rely on WebGL load three.js lazily. */
  webgl?: boolean;
}

const num = (min: number, max: number, def: number): MotionParam => ({ kind: "number", min, max, default: def });
const oneOf = <T extends readonly string[]>(values: T, def: T[number]): MotionParam => ({
  kind: "enum",
  values,
  default: def,
});
const bool = (def: boolean): MotionParam => ({ kind: "boolean", default: def });

const EASES = ["out", "in-out", "expo", "back", "elastic", "linear"] as const;

export const MOTION_EFFECTS = {
  reveal: {
    description: "Fade + slide element in when it enters the viewport.",
    target: "element",
    params: {
      direction: oneOf(["up", "down", "left", "right", "none"] as const, "up"),
      distance: num(0, 240, 48),
      duration: num(0.2, 3, 1),
      delay: num(0, 2, 0),
      ease: oneOf(EASES, "expo"),
    },
  },
  stagger: {
    description: "Reveal direct children one after another (cards, lists, grids).",
    target: "container",
    params: {
      interval: num(0.02, 0.4, 0.08),
      direction: oneOf(["up", "down", "left", "right", "none"] as const, "up"),
      distance: num(0, 200, 40),
    },
  },
  "split-text": {
    description: "Split a heading into words/chars/lines and animate them in (masked rise, fade or blur).",
    target: "text",
    params: {
      by: oneOf(["chars", "words", "lines"] as const, "words"),
      style: oneOf(["rise", "fade", "blur", "rotate"] as const, "rise"),
      interval: num(0.005, 0.2, 0.04),
      scrub: bool(false),
    },
  },
  "blur-in": {
    description: "Element sharpens from blur while fading in.",
    target: "element",
    params: { amount: num(2, 40, 16), duration: num(0.3, 3, 1.2) },
  },
  parallax: {
    description: "Move element at a different speed while scrolling (depth).",
    target: "element",
    params: { speed: num(-1, 1, 0.25) },
  },
  "scale-scroll": {
    description: "Scale (zoom) an image or block as it scrolls through the viewport (scrubbed).",
    target: "image",
    params: { from: num(0.5, 1.6, 1.2), to: num(0.5, 1.6, 1) },
  },
  "clip-reveal": {
    description: "Uncover an image/block with an animated clip-path mask.",
    target: "image",
    params: {
      shape: oneOf(["inset", "circle", "wipe-left", "wipe-right", "wipe-up", "diagonal"] as const, "inset"),
      duration: num(0.4, 3, 1.4),
      scrub: bool(false),
    },
  },
  "perspective-in": {
    description: "3D rotate element from a tilted perspective to flat while scrolling into view.",
    target: "element",
    params: { angle: num(5, 75, 35), axis: oneOf(["x", "y"] as const, "x") },
  },
  "rotate-scroll": {
    description: "Rotate element proportionally to scroll position.",
    target: "element",
    params: { degrees: num(-360, 360, 30) },
  },
  "pin-scrub": {
    description:
      "Pin the section while its [data-step] children animate through in sequence (scroll storytelling).",
    target: "section",
    params: { length: num(1, 6, 2.5) },
  },
  "horizontal-scroll": {
    description: "Pin section and scroll its [data-track] child horizontally as the user scrolls down.",
    target: "section",
    params: { speed: num(0.5, 3, 1) },
  },
  "sticky-stack": {
    description: "Direct children stick and stack on top of each other like cards while scrolling.",
    target: "container",
    params: { offset: num(0, 160, 32), scale: bool(true) },
  },
  marquee: {
    description: "Infinite horizontal ticker of the children (logos, keywords). Pauses on hover.",
    target: "container",
    params: {
      speed: num(10, 200, 60),
      direction: oneOf(["left", "right"] as const, "left"),
      "scroll-boost": bool(true),
    },
  },
  "tilt-3d": {
    description: "Card tilts in 3D toward the pointer, with optional glare highlight.",
    target: "element",
    params: { max: num(2, 25, 10), glare: bool(true), scale: num(1, 1.15, 1.03) },
  },
  magnetic: {
    description: "Button/link is attracted toward the pointer when nearby.",
    target: "element",
    params: { strength: num(0.1, 1, 0.35) },
  },
  float: {
    description: "Gentle continuous floating loop (decorative shapes, badges).",
    target: "element",
    params: { amplitude: num(2, 40, 12), duration: num(2, 12, 6) },
  },
  counter: {
    description: "Count up to the number already written in the element text (text is preserved).",
    target: "text",
    params: { duration: num(0.5, 4, 2) },
  },
  "bg-shift": {
    description: "Page background/foreground transitions to this section's palette while it is in view.",
    target: "section",
    params: { tone: oneOf(["bg", "surface", "surface-2", "accent", "fg", "brand"] as const, "fg") },
  },
  "scroll-progress": {
    description: "Thin bar that fills with page scroll progress (place once in the header).",
    target: "page",
    params: {},
  },
  "text-highlight": {
    description: "Words light up from muted to full color as the paragraph scrolls past (scrubbed).",
    target: "text",
    params: {},
  },
  "image-hover-zoom": {
    description: "Image slowly zooms on hover inside its overflow-hidden frame.",
    target: "image",
    params: { scale: num(1.02, 1.3, 1.08) },
  },
  "cursor-follow": {
    description: "Custom cursor (dot/ring) that follows the pointer; grows over links. Place on <body>-level wrapper once.",
    target: "page",
    params: { style: oneOf(["dot", "ring", "blend"] as const, "ring") },
  },
  "webgl-gradient": {
    description: "Animated flowing mesh-gradient background (WebGL) in design-system colors.",
    target: "section",
    webgl: true,
    params: { speed: num(0.05, 2, 0.4), intensity: num(0.1, 1, 0.6), grain: bool(true) },
  },
  "webgl-particles": {
    description: "Interactive 3D particle field reacting to pointer and scroll (WebGL).",
    target: "section",
    webgl: true,
    params: { density: num(200, 6000, 1800), size: num(0.5, 6, 1.6), depth: num(1, 20, 8) },
  },
  "webgl-distort": {
    description: "Image rendered on a WebGL plane with liquid distortion on pointer move and scroll.",
    target: "image",
    webgl: true,
    params: { strength: num(0.05, 1, 0.3) },
  },
  "webgl-blob": {
    description: "Morphing glossy 3D blob (WebGL) as a hero centrepiece.",
    target: "section",
    webgl: true,
    params: { speed: num(0.05, 2, 0.5), complexity: num(0.2, 3, 1.2) },
  },
} as const satisfies Record<string, MotionEffectSpec>;

export type MotionEffect = keyof typeof MOTION_EFFECTS;
export const MOTION_EFFECT_NAMES = Object.keys(MOTION_EFFECTS) as MotionEffect[];

export function isMotionEffect(value: string): value is MotionEffect {
  return Object.hasOwn(MOTION_EFFECTS, value);
}

/** Validates a single `data-<effect>-<param>` attribute value; returns the normalized value or null. */
export function normalizeMotionParam(effect: MotionEffect, param: string, raw: string): string | null {
  const spec = (MOTION_EFFECTS[effect].params as Record<string, MotionParam>)[param];
  if (!spec) return null;
  const value = raw.trim();
  if (spec.kind === "number") {
    if (!/^-?\d+(\.\d+)?$/.test(value)) return null;
    const n = Number(value);
    return String(Math.min(spec.max, Math.max(spec.min, n)));
  }
  if (spec.kind === "enum") return spec.values.includes(value) ? value : null;
  return value === "true" || value === "false" ? value : null;
}

/** Markdown reference of the vocabulary for AI prompts. */
export function motionVocabularyDoc(): string {
  return MOTION_EFFECT_NAMES.map((name) => {
    const spec: MotionEffectSpec = MOTION_EFFECTS[name];
    const params = Object.entries(spec.params)
      .map(([key, p]) => {
        const range =
          p.kind === "number" ? `${p.min}..${p.max}` : p.kind === "enum" ? p.values.join("|") : "true|false";
        return `data-${name}-${key}="${range}" (default ${String(p.default)})`;
      })
      .join(", ");
    return `- \`${name}\` [${spec.target}${spec.webgl ? ", webgl" : ""}]: ${spec.description}${params ? ` Params: ${params}` : ""}`;
  }).join("\n");
}
