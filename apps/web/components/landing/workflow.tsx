"use client";

import { useRef, useState } from "react";
import clsx from "clsx";
import { motion, useMotionValueEvent, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import type { Dict } from "@/lib/i18n";

const SHOTS = ["/showcase/app/pages.webp", "/showcase/app/analysis.webp", "/showcase/app/design.webp", "/showcase/app/site.webp"];

/** Pinned scroll story through the four product steps, using real screenshots of the app. */
export function Workflow({ t }: { t: Dict["steps"] }) {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const [active, setActive] = useState(0);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  useMotionValueEvent(scrollYProgress, "change", (v) => setActive(Math.min(3, Math.floor(v * 4))));
  const bar = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });
  const rotate = useTransform(scrollYProgress, [0, 0.15, 1], [14, 4, -4]);

  return (
    <section ref={ref} id="how" className={clsx("relative bg-paper", reduced ? "" : "h-[420vh]")} aria-label={t.title}>
      <div className={clsx("container-app grid gap-12 py-24 lg:grid-cols-[0.8fr_1.2fr] lg:items-center", !reduced && "sticky top-0 min-h-[100svh]")}>
        <div className="grid gap-10">
          <div>
            <p className="eyebrow text-stone">{t.eyebrow}</p>
            <h2 className="display mt-5 text-[clamp(2.8rem,5.5vw,5.5rem)]">{t.title}</h2>
          </div>
          <ol className="grid gap-2">
            {t.items.map((item, i) => (
              <li key={item.title} className={clsx("grid grid-cols-[3rem_1fr] gap-4 rounded-3xl p-5 transition-all duration-700 ease-expo", (reduced || active === i) ? "bg-chalk shadow-[0_20px_60px_-30px_rgba(0,0,0,.35)]" : "opacity-40")}>
                <span className="display text-4xl">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h3 className="text-xl font-medium">{item.title}</h3>
                  <p className={clsx("mt-1 text-stone transition-all duration-700", !reduced && active !== i && "max-h-0 overflow-hidden lg:max-h-none")}>{item.text}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="hidden h-1 overflow-hidden rounded-full bg-ink/10 lg:block">
            <motion.div className="h-full origin-left bg-ink" style={{ scaleX: bar }} />
          </div>
        </div>
        <motion.div style={reduced ? undefined : { rotateX: rotate, transformPerspective: 1600 }} className="relative">
          <div className="overflow-hidden rounded-[1.75rem] bg-ink p-2 shadow-[0_60px_120px_-40px_rgba(15,15,13,.55)]">
            <div className="flex items-center gap-1.5 px-3 py-2" aria-hidden="true">
              <span className="size-2.5 rounded-full bg-chalk/20" /><span className="size-2.5 rounded-full bg-chalk/20" /><span className="size-2.5 rounded-full bg-chalk/20" />
            </div>
            <div className="relative aspect-[16/10] overflow-hidden rounded-[1.2rem] bg-paper">
              {SHOTS.map((src, i) => (
                <img
                  key={src}
                  src={src}
                  alt={t.items[i]!.title}
                  loading="lazy"
                  className={clsx("absolute inset-0 h-full w-full object-cover object-top transition-all duration-[900ms] ease-expo", (reduced ? i === 0 : active === i) ? "scale-100 opacity-100" : "scale-[1.04] opacity-0")}
                />
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
