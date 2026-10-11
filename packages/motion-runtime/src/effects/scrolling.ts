import { scroll } from "motion";
import { clamp, cssVar, enumParam, intensity, lerp, numberParam, boolParam } from "../util";
import { splitText } from "../split";

type Cleanup = () => void;
const view = (el: Element) => ({ target: el, offset: ["start end", "end start"] as ["start end", "end start"] });

export function parallax(el: HTMLElement): Cleanup {
  const speed = numberParam(el, "parallax", "speed") * (0.5 + intensity() * 0.5);
  const range = Math.round(speed * 160);
  el.style.willChange = "transform";
  return scroll((p: number) => {
    el.style.transform = `translate3d(0, ${lerp(-range, range, p).toFixed(1)}px, 0)`;
  }, view(el));
}

export function scaleScroll(el: HTMLElement): Cleanup {
  const from = numberParam(el, "scale-scroll", "from");
  const to = numberParam(el, "scale-scroll", "to");
  el.style.willChange = "transform";
  return scroll(
    (p: number) => {
      el.style.transform = `scale(${lerp(from, to, p).toFixed(4)})`;
    },
    { target: el, offset: ["start end", "end center"] },
  );
}

export function rotateScroll(el: HTMLElement): Cleanup {
  const degrees = numberParam(el, "rotate-scroll", "degrees");
  return scroll((p: number) => {
    el.style.transform = `rotate(${(p * degrees).toFixed(2)}deg)`;
  }, view(el));
}

export function perspectiveIn(el: HTMLElement): Cleanup {
  const angle = numberParam(el, "perspective-in", "angle") * (0.5 + intensity() * 0.5);
  const axis = enumParam(el, "perspective-in", "axis");
  el.style.transformOrigin = axis === "x" ? "50% 100%" : "0% 50%";
  el.style.willChange = "transform";
  return scroll(
    (p: number) => {
      const a = lerp(angle, 0, p);
      el.style.transform = `perspective(1200px) rotate${axis.toUpperCase()}(${a.toFixed(2)}deg) scale(${lerp(0.92, 1, p).toFixed(4)})`;
      el.style.opacity = String(lerp(0.4, 1, p));
    },
    { target: el, offset: ["start end", "center center"] },
  );
}

/** Pins a section and plays [data-step] children through in sequence while scrolling. */
export function pinScrub(section: HTMLElement): Cleanup {
  const length = numberParam(section, "pin-scrub", "length");
  const steps = [...section.querySelectorAll<HTMLElement>("[data-step]")];
  const inner = document.createElement("div");
  inner.className = "m-pin";
  inner.append(...section.childNodes);
  section.append(inner);
  section.style.height = `${(length + 1) * 100}vh`;
  section.setAttribute("data-motion-pinned", "");
  const stack = steps[0]?.parentElement;
  if (stack && steps.every((s) => s.parentElement === stack)) {
    stack.classList.add("m-steps");
  }
  const progressBar = section.querySelector<HTMLElement>("[data-step-progress]");
  const unsubscribe = scroll(
    (p: number) => {
      const n = Math.max(1, steps.length);
      steps.forEach((step, i) => {
        // Segment i spans [i/n, (i+1)/n]; fade in over its first quarter, out over its last quarter.
        const local = p * n - i;
        const fadeIn = i === 0 ? 1 : clamp(local * 4);
        const fadeOut = i === n - 1 ? 0 : clamp((local - 0.75) * 4);
        const o = fadeIn * (1 - fadeOut);
        step.style.opacity = o.toFixed(3);
        step.style.transform = `translate3d(0, ${((1 - fadeIn) * 48 - fadeOut * 48).toFixed(1)}px, 0)`;
        step.toggleAttribute("data-active", o > 0.5);
      });
      if (progressBar) progressBar.style.transform = `scaleX(${p})`;
    },
    { target: section, offset: ["start start", "end end"] },
  );
  return () => {
    unsubscribe();
    section.style.height = "";
  };
}

export function horizontalScroll(section: HTMLElement): Cleanup {
  const track = section.querySelector<HTMLElement>("[data-track]");
  if (!track) return () => {};
  const speed = numberParam(section, "horizontal-scroll", "speed");
  const inner = document.createElement("div");
  inner.className = "m-pin m-pin-x";
  inner.append(...section.childNodes);
  section.append(inner);
  section.setAttribute("data-motion-pinned", "");
  track.style.willChange = "transform";
  track.classList.add("m-track");
  const measure = () => {
    const distance = Math.max(0, track.scrollWidth - inner.clientWidth);
    section.style.height = `${innerHeight + distance / speed}px`;
    return distance;
  };
  let distance = measure();
  const onResize = () => (distance = measure());
  addEventListener("resize", onResize);
  const unsubscribe = scroll(
    (p: number) => {
      track.style.transform = `translate3d(${(-distance * p).toFixed(1)}px, 0, 0)`;
    },
    { target: section, offset: ["start start", "end end"] },
  );
  return () => {
    unsubscribe();
    removeEventListener("resize", onResize);
  };
}

export function stickyStack(container: HTMLElement): Cleanup {
  const offset = numberParam(container, "sticky-stack", "offset");
  const scale = boolParam(container, "sticky-stack", "scale");
  const cards = [...container.children] as HTMLElement[];
  const cleanups = cards.map((card, i) => {
    card.style.position = "sticky";
    card.style.top = `${offset + i * 14}px`;
    card.style.transformOrigin = "50% 0%";
    if (!scale || i === cards.length - 1) return () => {};
    const next = cards[i + 1]!;
    return scroll(
      (p: number) => {
        card.style.transform = `scale(${lerp(1, 0.92 + i * 0.01, p).toFixed(4)})`;
        card.style.filter = `brightness(${lerp(1, 0.82, p).toFixed(3)})`;
      },
      { target: next, offset: ["start end", "start start"] },
    );
  });
  return () => cleanups.forEach((c) => c());
}

export function textHighlight(el: HTMLElement): Cleanup {
  const { words } = splitText(el, "words", false);
  el.setAttribute("data-motion-split", "");
  words.forEach((w) => (w.style.opacity = "0.18"));
  return scroll(
    (p: number) => {
      const n = words.length;
      words.forEach((w, i) => {
        w.style.opacity = String(lerp(0.18, 1, clamp(p * n * 1.1 - i)));
      });
    },
    { target: el, offset: ["start 85%", "end 40%"] },
  );
}

const TONES: Record<string, [string, string]> = {
  bg: ["--color-bg", "--color-fg"],
  surface: ["--color-surface", "--color-fg"],
  "surface-2": ["--color-surface-2", "--color-fg"],
  accent: ["--color-accent", "--color-accent-fg"],
  fg: ["--color-fg", "--color-bg"],
  brand: ["--color-brand", "--color-bg"],
};

/** Page background/foreground morph while a section is centered in the viewport. */
export function bgShift(section: HTMLElement): Cleanup {
  const tone = enumParam(section, "bg-shift", "tone");
  const [bgVar, fgVar] = TONES[tone] ?? TONES["fg"]!;
  section.setAttribute("data-motion-tone", tone);
  const root = document.documentElement;
  let active = false;
  return scroll(
    (p: number) => {
      const inside = p > 0.18 && p < 0.82;
      if (inside === active) return;
      active = inside;
      if (inside) {
        root.style.setProperty("--page-bg", cssVar(bgVar, "#000"));
        root.style.setProperty("--page-fg", cssVar(fgVar, "#fff"));
        root.setAttribute("data-tone", tone);
      } else if (root.getAttribute("data-tone") === tone) {
        root.style.removeProperty("--page-bg");
        root.style.removeProperty("--page-fg");
        root.removeAttribute("data-tone");
      }
    },
    view(section),
  );
}

export function scrollProgress(el: HTMLElement): Cleanup {
  el.classList.add("m-progress");
  el.setAttribute("aria-hidden", "true");
  return scroll((p: number) => {
    el.style.transform = `scaleX(${p})`;
  });
}
