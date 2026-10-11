import { MOTION_EFFECTS, type MotionEffect, type MotionParam } from "@redesign/schema/motion";

export const reducedMotion = (): boolean =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export const isTouch = (): boolean => typeof matchMedia === "function" && matchMedia("(hover: none), (pointer: coarse)").matches;

/** Global intensity from <html data-motion-intensity>, 0..1 (default 0.7). */
export function intensity(): number {
  const raw = Number(document.documentElement.dataset["motionIntensity"]);
  return Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0.7;
}

export function numberParam(el: Element, effect: MotionEffect, name: string): number {
  const spec = (MOTION_EFFECTS[effect].params as Record<string, MotionParam>)[name];
  const raw = el.getAttribute(`data-${effect}-${name}`);
  if (!spec || spec.kind !== "number") return 0;
  const n = raw === null ? spec.default : Number(raw);
  return Number.isFinite(n) ? Math.min(spec.max, Math.max(spec.min, n)) : spec.default;
}

export function enumParam<T extends string = string>(el: Element, effect: MotionEffect, name: string): T {
  const spec = (MOTION_EFFECTS[effect].params as Record<string, MotionParam>)[name];
  const raw = el.getAttribute(`data-${effect}-${name}`);
  if (!spec || spec.kind !== "enum") return "" as T;
  return (raw !== null && spec.values.includes(raw) ? raw : spec.default) as T;
}

export function boolParam(el: Element, effect: MotionEffect, name: string): boolean {
  const spec = (MOTION_EFFECTS[effect].params as Record<string, MotionParam>)[name];
  const raw = el.getAttribute(`data-${effect}-${name}`);
  if (!spec || spec.kind !== "boolean") return false;
  return raw === null ? spec.default : raw === "true";
}

export const EASINGS: Record<string, [number, number, number, number]> = {
  out: [0.22, 1, 0.36, 1],
  "in-out": [0.65, 0, 0.35, 1],
  expo: [0.16, 1, 0.3, 1],
  back: [0.34, 1.56, 0.64, 1],
  elastic: [0.68, -0.6, 0.32, 1.6],
  linear: [0, 0, 1, 1],
};

export const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function offsetFor(direction: string, distance: number): string {
  switch (direction) {
    case "down":
      return `translate3d(0, ${-distance}px, 0)`;
    case "left":
      return `translate3d(${distance}px, 0, 0)`;
    case "right":
      return `translate3d(${-distance}px, 0, 0)`;
    case "none":
      return "none";
    default:
      return `translate3d(0, ${distance}px, 0)`;
  }
}

/** Marks an element as armed (hidden initial state applied by runtime CSS). */
export function arm(el: Element) {
  el.setAttribute("data-motion-armed", "");
}
export function disarm(el: Element) {
  el.removeAttribute("data-motion-armed");
  el.setAttribute("data-motion-done", "");
}

export function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** True when the element is (at least partly) within the initial viewport. */
export function inInitialViewport(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.top < innerHeight && r.bottom > 0;
}
