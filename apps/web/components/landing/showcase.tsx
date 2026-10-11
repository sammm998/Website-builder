"use client";

import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";

const DIRECTIONS = [
  { src: "/showcase/directions/0.webp", name: "Redaktionell", meta: "Instrument Serif · Inter · editorial" },
  { src: "/showcase/directions/1.webp", name: "Filmisk", meta: "Fraunces · Inter Tight · WebGL" },
  { src: "/showcase/directions/2.webp", name: "Kinetisk", meta: "Big Shoulders · Space Grotesk · kinetic" },
];

const EFFECTS = ["Split text", "WebGL gradient", "Parallax", "Pinned stories", "3D tilt", "Horizontal scroll", "Sticky stacks", "Magnetic buttons", "Clip reveals", "Particle fields", "Counters", "Smooth scroll"];

/** Horizontal scroll through three generated directions + an infinite effect marquee. */
export function Showcase({ title, eyebrow }: { title: string; eyebrow: string }) {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const x = useTransform(scrollYProgress, [0, 1], ["4%", "-58%"]);
  return (
    <section ref={ref} className={reduced ? "bg-ink py-24 text-chalk" : "relative h-[300vh] bg-ink text-chalk"}>
      <div className={reduced ? "" : "sticky top-0 flex h-[100svh] flex-col justify-center overflow-hidden"}>
        <div className="container-app">
          <p className="eyebrow text-chalk/60">{eyebrow}</p>
          <h2 className="display mt-4 max-w-[18ch] text-[clamp(2.4rem,5vw,4.8rem)]">{title}</h2>
        </div>
        <motion.div style={reduced ? undefined : { x }} className={reduced ? "container-app mt-12 grid gap-6 md:grid-cols-3" : "mt-12 flex w-max gap-6 pl-[4vw]"}>
          {DIRECTIONS.map((d, i) => (
            <figure key={d.src} className={reduced ? "" : "w-[78vw] md:w-[52vw]"}>
              <div className="overflow-hidden rounded-[1.5rem] bg-ink-2 ring-1 ring-chalk/10">
                <img src={d.src} alt={`Designriktning ${d.name}`} loading="lazy" width={1280} height={800} className="aspect-[16/10] w-full object-cover object-top transition duration-700 ease-expo hover:scale-[1.02]" />
              </div>
              <figcaption className="mt-4 flex items-baseline justify-between gap-4">
                <span className="display text-3xl">{String(i + 1).padStart(2, "0")} {d.name}</span>
                <span className="text-sm text-chalk/50">{d.meta}</span>
              </figcaption>
            </figure>
          ))}
        </motion.div>
        <div className="mt-16 overflow-hidden border-y border-chalk/10 py-5" aria-hidden="true">
          <div className="marquee flex w-max gap-12 whitespace-nowrap text-2xl text-chalk/60">
            {[...EFFECTS, ...EFFECTS].map((e, i) => (
              <span key={i} className="inline-flex items-center gap-12">
                {e} <span className="size-2 rounded-full bg-signal" />
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
