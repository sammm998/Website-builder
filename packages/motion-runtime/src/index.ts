import Lenis from "lenis";
import { inView } from "motion";
import { isMotionEffect, type MotionEffect } from "@redesign/schema/motion";
import { reducedMotion } from "./util";
import { blurIn, clipReveal, counter, reveal, splitTextEffect, staggerChildren } from "./effects/entrance";
import {
  bgShift,
  horizontalScroll,
  parallax,
  perspectiveIn,
  pinScrub,
  rotateScroll,
  scaleScroll,
  scrollProgress,
  stickyStack,
  textHighlight,
} from "./effects/scrolling";
import { cursorFollow, float, imageHoverZoom, magnetic, marquee, tilt3d } from "./effects/pointer";
import { scrollState, toggles } from "./effects/ui";

/**
 * Redesign AI motion runtime. Executes only the declarative, validated `data-motion` vocabulary on
 * generated sites; no generated code runs. Content is fully visible without JavaScript and with
 * prefers-reduced-motion (only functional UI behaviour is enabled then).
 */

type Cleanup = () => void;
type Handler = (el: HTMLElement) => Cleanup;

const HANDLERS: Partial<Record<MotionEffect, Handler>> = {
  reveal,
  stagger: staggerChildren,
  "split-text": splitTextEffect,
  "blur-in": blurIn,
  "clip-reveal": clipReveal,
  counter,
  parallax,
  "scale-scroll": scaleScroll,
  "rotate-scroll": rotateScroll,
  "perspective-in": perspectiveIn,
  "pin-scrub": pinScrub,
  "horizontal-scroll": horizontalScroll,
  "sticky-stack": stickyStack,
  "text-highlight": textHighlight,
  "bg-shift": bgShift,
  "scroll-progress": scrollProgress,
  "tilt-3d": tilt3d,
  magnetic,
  "image-hover-zoom": imageHoverZoom,
  "cursor-follow": cursorFollow,
  marquee,
  float,
};

const WEBGL = new Set<MotionEffect>(["webgl-gradient", "webgl-particles", "webgl-distort", "webgl-blob"]);
/** Effects that pin/resize sections must run before measurement-based ones. */
const ORDER: MotionEffect[] = ["pin-scrub", "horizontal-scroll", "sticky-stack"];

const cleanups: Cleanup[] = [];
let lenis: Lenis | null = null;

function initSmoothScroll() {
  const root = document.documentElement;
  if (root.dataset["motionSmooth"] !== "true") return;
  lenis = new Lenis({ autoRaf: true, lerp: 0.1, smoothWheel: true, anchors: { offset: -80 } });
  root.classList.add("m-smooth");
}

function mountWebGL(el: HTMLElement, effect: MotionEffect) {
  const stop = inView(
    el,
    () => {
      stop();
      import("./webgl/index")
        .then((m) => cleanups.push(m.mountWebGL(el, effect)))
        .catch(() => el.setAttribute("data-webgl-fallback", ""));
    },
    { margin: "400px 0px 400px 0px" },
  );
}

export function init(): void {
  const root = document.documentElement;
  toggles();
  scrollState();
  if (reducedMotion()) {
    root.classList.add("m-reduced");
    root.classList.remove("m-armed");
    return;
  }
  initSmoothScroll();
  const elements = [...document.querySelectorAll<HTMLElement>("[data-motion]")];
  const jobs: { el: HTMLElement; effect: MotionEffect }[] = [];
  for (const el of elements) {
    for (const name of (el.getAttribute("data-motion") ?? "").split(/\s+/)) {
      if (isMotionEffect(name)) jobs.push({ el, effect: name });
    }
  }
  jobs.sort((a, b) => Number(ORDER.includes(b.effect)) - Number(ORDER.includes(a.effect)));
  for (const { el, effect } of jobs) {
    try {
      if (WEBGL.has(effect)) mountWebGL(el, effect);
      else {
        const handler = HANDLERS[effect];
        if (handler) cleanups.push(handler(el));
      }
    } catch (error) {
      console.warn(`[motion] ${effect} failed`, error);
      el.removeAttribute("data-motion-armed");
    }
  }
  root.classList.add("m-armed");
  root.classList.remove("m-pending");
}

export function destroy(): void {
  cleanups.splice(0).forEach((c) => c());
  lenis?.destroy();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
else init();
