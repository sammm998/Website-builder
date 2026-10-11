"use client";

import { useEffect } from "react";
import Lenis from "lenis";

/** Inertia scrolling for the landing page; disabled when the visitor prefers reduced motion. */
export function SmoothScroll() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ autoRaf: true, lerp: 0.1, anchors: { offset: -72 } });
    return () => lenis.destroy();
  }, []);
  return null;
}
