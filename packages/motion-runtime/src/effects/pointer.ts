import { animate, scroll } from "motion";
import { boolParam, enumParam, isTouch, lerp, numberParam } from "../util";

type Cleanup = () => void;
const noop: Cleanup = () => {};

export function tilt3d(el: HTMLElement): Cleanup {
  if (isTouch()) return noop;
  const max = numberParam(el, "tilt-3d", "max");
  const glare = boolParam(el, "tilt-3d", "glare");
  const scale = numberParam(el, "tilt-3d", "scale");
  el.style.transformStyle = "preserve-3d";
  el.style.willChange = "transform";
  el.classList.add("m-tilt");
  let shine: HTMLElement | null = null;
  if (glare) {
    shine = document.createElement("span");
    shine.className = "m-glare";
    shine.setAttribute("aria-hidden", "true");
    el.append(shine);
  }
  let raf = 0;
  const target = { x: 0, y: 0, s: 1 };
  const current = { x: 0, y: 0, s: 1 };
  const tick = () => {
    current.x = lerp(current.x, target.x, 0.12);
    current.y = lerp(current.y, target.y, 0.12);
    current.s = lerp(current.s, target.s, 0.12);
    el.style.transform = `perspective(900px) rotateX(${current.y.toFixed(2)}deg) rotateY(${current.x.toFixed(2)}deg) scale(${current.s.toFixed(4)})`;
    if (Math.abs(current.x - target.x) + Math.abs(current.y - target.y) + Math.abs(current.s - target.s) > 0.01) raf = requestAnimationFrame(tick);
    else raf = 0;
  };
  const kick = () => {
    if (!raf) raf = requestAnimationFrame(tick);
  };
  const move = (e: PointerEvent) => {
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    target.x = px * max * 2;
    target.y = -py * max * 2;
    target.s = scale;
    if (shine) {
      shine.style.setProperty("--gx", `${(px + 0.5) * 100}%`);
      shine.style.setProperty("--gy", `${(py + 0.5) * 100}%`);
      shine.style.opacity = "1";
    }
    kick();
  };
  const leave = () => {
    target.x = 0;
    target.y = 0;
    target.s = 1;
    if (shine) shine.style.opacity = "0";
    kick();
  };
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerleave", leave);
  return () => {
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerleave", leave);
  };
}

export function magnetic(el: HTMLElement): Cleanup {
  if (isTouch()) return noop;
  const strength = numberParam(el, "magnetic", "strength");
  const move = (e: PointerEvent) => {
    const r = el.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    animate(el, { transform: `translate3d(${(dx * strength).toFixed(1)}px, ${(dy * strength).toFixed(1)}px, 0)` }, { type: "spring", stiffness: 300, damping: 20 });
  };
  const leave = () => animate(el, { transform: "translate3d(0,0,0)" }, { type: "spring", stiffness: 200, damping: 14 });
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerleave", leave);
  return () => {
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerleave", leave);
  };
}

export function imageHoverZoom(el: HTMLElement): Cleanup {
  const scale = numberParam(el, "image-hover-zoom", "scale");
  el.style.setProperty("--m-zoom", String(scale));
  el.classList.add("m-hover-zoom");
  if (el.parentElement) el.parentElement.style.overflow = "hidden";
  return noop;
}

export function cursorFollow(el: HTMLElement): Cleanup {
  if (isTouch() || document.querySelector(".m-cursor")) return noop;
  const style = enumParam(el, "cursor-follow", "style");
  const cursor = document.createElement("div");
  cursor.className = `m-cursor m-cursor-${style}`;
  cursor.setAttribute("aria-hidden", "true");
  document.body.append(cursor);
  document.documentElement.classList.add("m-has-cursor");
  const pos = { x: innerWidth / 2, y: innerHeight / 2 };
  const target = { ...pos };
  let raf = 0;
  const tick = () => {
    pos.x = lerp(pos.x, target.x, 0.2);
    pos.y = lerp(pos.y, target.y, 0.2);
    cursor.style.transform = `translate3d(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px, 0)`;
    raf = requestAnimationFrame(tick);
  };
  const move = (e: PointerEvent) => {
    target.x = e.clientX;
    target.y = e.clientY;
    const interactive = (e.target as Element | null)?.closest?.("a, button, [data-motion~='magnetic'], input, textarea, select, label");
    cursor.toggleAttribute("data-hover", !!interactive);
  };
  addEventListener("pointermove", move, { passive: true });
  raf = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(raf);
    removeEventListener("pointermove", move);
    cursor.remove();
  };
}

export function marquee(el: HTMLElement): Cleanup {
  const speed = numberParam(el, "marquee", "speed");
  const direction = enumParam(el, "marquee", "direction");
  const boost = boolParam(el, "marquee", "scroll-boost");
  const track = document.createElement("div");
  track.className = "m-marquee-track";
  const items = [...el.childNodes];
  const group = document.createElement("div");
  group.className = "m-marquee-group";
  group.append(...items);
  const clone = group.cloneNode(true) as HTMLElement;
  clone.setAttribute("aria-hidden", "true");
  clone.querySelectorAll("a, button").forEach((n) => n.setAttribute("tabindex", "-1"));
  track.append(group, clone);
  el.append(track);
  el.classList.add("m-marquee");
  const width = () => group.getBoundingClientRect().width || 1;
  let x = 0;
  let velocity = 1;
  let hover = false;
  let last = performance.now();
  let raf = 0;
  const sign = direction === "left" ? -1 : 1;
  const tick = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const v = hover ? 0.15 : velocity;
    x += sign * speed * v * dt;
    const w = width();
    if (x <= -w) x += w;
    if (x > 0) x -= w;
    track.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0)`;
    velocity = lerp(velocity, 1, 0.04);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  const unscroll = boost
    ? scroll((_p: number, info: { y: { velocity: number } }) => {
        velocity = 1 + Math.min(6, Math.abs(info.y.velocity) / 400);
      })
    : noop;
  const enter = () => (hover = true);
  const exit = () => (hover = false);
  el.addEventListener("pointerenter", enter);
  el.addEventListener("pointerleave", exit);
  return () => {
    cancelAnimationFrame(raf);
    unscroll();
  };
}

export function float(el: HTMLElement): Cleanup {
  const amplitude = numberParam(el, "float", "amplitude");
  const duration = numberParam(el, "float", "duration");
  const controls = animate(el, { transform: [`translate3d(0, ${-amplitude}px, 0)`, `translate3d(0, ${amplitude}px, 0)`] }, {
    duration,
    repeat: Infinity,
    repeatType: "mirror",
    ease: "easeInOut",
  });
  return () => controls.stop();
}
