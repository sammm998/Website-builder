import { animate, inView, scroll, stagger } from "motion";
import { arm, boolParam, disarm, EASINGS, enumParam, intensity, numberParam, offsetFor } from "../util";
import { splitText } from "../split";

type Cleanup = () => void;

const once = (el: Element, run: () => void, amount = 0.2): Cleanup =>
  inView(
    el,
    () => {
      run();
    },
    { amount, margin: "0px 0px -8% 0px" },
  );

export function reveal(el: HTMLElement): Cleanup {
  const k = intensity();
  const direction = enumParam(el, "reveal", "direction");
  const distance = numberParam(el, "reveal", "distance") * (0.4 + k * 0.6);
  const duration = numberParam(el, "reveal", "duration");
  const delay = numberParam(el, "reveal", "delay");
  const ease = EASINGS[enumParam(el, "reveal", "ease")] ?? EASINGS["expo"]!;
  arm(el);
  return once(el, () => {
    animate(
      el,
      { opacity: [0, 1], transform: [offsetFor(direction, distance), "translate3d(0,0,0)"] },
      { duration, delay, ease },
    ).then(() => disarm(el));
  });
}

export function staggerChildren(el: HTMLElement): Cleanup {
  const k = intensity();
  const interval = numberParam(el, "stagger", "interval");
  const direction = enumParam(el, "stagger", "direction");
  const distance = numberParam(el, "stagger", "distance") * (0.4 + k * 0.6);
  const children = [...el.children] as HTMLElement[];
  children.forEach(arm);
  return once(
    el,
    () => {
      animate(
        children,
        { opacity: [0, 1], transform: [offsetFor(direction, distance), "translate3d(0,0,0)"] },
        { duration: 0.9, delay: stagger(interval), ease: EASINGS["expo"] },
      ).then(() => children.forEach(disarm));
    },
    0.1,
  );
}

export function splitTextEffect(el: HTMLElement): Cleanup {
  const by = enumParam<"words" | "chars" | "lines">(el, "split-text", "by");
  const style = enumParam(el, "split-text", "style");
  const interval = numberParam(el, "split-text", "interval");
  const scrub = boolParam(el, "split-text", "scrub");
  const split = splitText(el, by, style === "rise" || style === "rotate");
  const units: HTMLElement[] =
    by === "chars" ? split.chars : by === "lines" ? split.lines.map((line) => wrapLine(line)) : split.words;
  const from: Record<string, string[] | number[]> =
    style === "rise"
      ? { transform: ["translate3d(0,110%,0)", "translate3d(0,0,0)"] }
      : style === "rotate"
        ? { transform: ["translate3d(0,100%,0) rotate(8deg)", "translate3d(0,0,0) rotate(0deg)"] }
        : style === "blur"
          ? { opacity: [0, 1], filter: ["blur(12px)", "blur(0px)"] }
          : { opacity: [0, 1] };
  el.setAttribute("data-motion-split", "");
  if (scrub) {
    const controls = animate(units, from, { delay: stagger(interval), ease: "linear" });
    controls.pause();
    return scroll(controls, { target: el, offset: ["start 90%", "end 45%"] });
  }
  units.forEach((u) => {
    for (const [prop, values] of Object.entries(from)) u.style.setProperty(prop, String(values[0]));
  });
  return once(el, () => {
    animate(units, from, { duration: 1, delay: stagger(interval), ease: EASINGS["expo"] }).then(() => {
      el.setAttribute("data-motion-done", "");
    });
  });
}

function wrapLine(words: HTMLElement[]): HTMLElement {
  // Animate the masks of words on the same line together by wrapping into an inline-block group.
  const first = words[0]!;
  const group = document.createElement("span");
  group.className = "m-line";
  group.setAttribute("aria-hidden", "true");
  const container = first.parentElement?.classList.contains("m-mask") ? first.parentElement : first;
  container.before(group);
  for (const w of words) {
    const node = w.parentElement?.classList.contains("m-mask") ? w.parentElement : w;
    group.append(node, document.createTextNode(" "));
  }
  return group;
}

export function blurIn(el: HTMLElement): Cleanup {
  const amount = numberParam(el, "blur-in", "amount");
  const duration = numberParam(el, "blur-in", "duration");
  arm(el);
  return once(el, () => {
    animate(el, { opacity: [0, 1], filter: [`blur(${amount}px)`, "blur(0px)"] }, { duration, ease: EASINGS["out"] }).then(
      () => disarm(el),
    );
  });
}

const CLIPS: Record<string, [string, string]> = {
  inset: ["inset(18% 18% 18% 18% round 24px)", "inset(0% 0% 0% 0% round 0px)"],
  circle: ["circle(0% at 50% 50%)", "circle(75% at 50% 50%)"],
  "wipe-left": ["inset(0 0 0 100%)", "inset(0 0 0 0%)"],
  "wipe-right": ["inset(0 100% 0 0)", "inset(0 0% 0 0)"],
  "wipe-up": ["inset(100% 0 0 0)", "inset(0% 0 0 0)"],
  diagonal: ["polygon(0 0, 0 0, 0 100%, 0 100%)", "polygon(0 0, 100% 0, 100% 100%, 0 100%)"],
};

export function clipReveal(el: HTMLElement): Cleanup {
  const shape = enumParam(el, "clip-reveal", "shape");
  const duration = numberParam(el, "clip-reveal", "duration");
  const scrub = boolParam(el, "clip-reveal", "scrub");
  const [from, to] = CLIPS[shape] ?? CLIPS["inset"]!;
  if (el.hasAttribute("data-lcp")) {
    // Never hide the LCP image: animate scale only.
    return once(el, () => void animate(el, { transform: ["scale(1.08)", "scale(1)"] }, { duration, ease: EASINGS["expo"] }));
  }
  if (scrub) {
    const controls = animate(el, { clipPath: [from, to] }, { ease: "linear" });
    controls.pause();
    return scroll(controls, { target: el, offset: ["start end", "center center"] });
  }
  el.style.clipPath = from;
  return once(el, () => {
    animate(el, { clipPath: [from, to] }, { duration, ease: EASINGS["in-out"] }).then(() => {
      el.style.clipPath = "";
    });
  });
}

/** Counts up to the number already in the text; the final text is restored byte-for-byte. */
export function counter(el: HTMLElement): Cleanup {
  const original = el.textContent ?? "";
  const match = /(\d[\d\s\u00a0.,]*)/.exec(original);
  if (!match) return () => {};
  const numeric = match[1]!;
  const groupSep = /\d[\s\u00a0]\d{3}/.test(numeric) ? " " : /\d,\d{3}/.test(numeric) ? "," : /\d\.\d{3}(?!\d)/.test(numeric) ? "." : "";
  const cleaned = numeric.replace(/[\s\u00a0]/g, "").replace(groupSep === "," ? /,/g : groupSep === "." ? /\./g : /$^/, "");
  const decimalSep = cleaned.includes(",") ? "," : ".";
  const value = Number(cleaned.replace(",", "."));
  if (!Number.isFinite(value)) return () => {};
  const decimals = (cleaned.split(decimalSep)[1] ?? "").length;
  const duration = numberParam(el, "counter", "duration");
  const format = (n: number) => {
    const fixed = n.toFixed(decimals);
    const [int, frac] = fixed.split(".");
    const grouped = groupSep ? int!.replace(/\B(?=(\d{3})+(?!\d))/g, groupSep) : int!;
    return frac ? `${grouped}${decimalSep}${frac}` : grouped;
  };
  el.style.fontVariantNumeric = "tabular-nums";
  return once(el, () => {
    animate(0, value, {
      duration,
      ease: EASINGS["out"],
      onUpdate: (v) => {
        el.textContent = original.replace(numeric, format(v) + (numeric.match(/\s+$/)?.[0] ?? ""));
      },
      onComplete: () => {
        el.textContent = original;
      },
    });
  });
}
