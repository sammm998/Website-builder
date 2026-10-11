"use client";

import { useRef } from "react";
import { Box, Globe2, Accessibility, Layers3, ScrollText, Search } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { Dict } from "@/lib/i18n";

const ICONS = [Box, Layers3, ScrollText, Search, Globe2, Accessibility];

function TiltCard({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  return (
    <div
      ref={ref}
      className={className}
      style={{ transformStyle: "preserve-3d", transition: "transform .6s cubic-bezier(.16,1,.3,1)" }}
      onPointerMove={(e) => {
        if (reduced || e.pointerType !== "mouse") return;
        const r = ref.current!.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        ref.current!.style.transform = `perspective(900px) rotateX(${(-y * 8).toFixed(2)}deg) rotateY(${(x * 8).toFixed(2)}deg)`;
        ref.current!.style.setProperty("--gx", `${(x + 0.5) * 100}%`);
        ref.current!.style.setProperty("--gy", `${(y + 0.5) * 100}%`);
      }}
      onPointerLeave={() => ref.current && (ref.current.style.transform = "")}
    >
      {children}
    </div>
  );
}

export function Features({ t }: { t: Dict["features"] }) {
  return (
    <section className="bg-paper py-28 sm:py-40">
      <div className="container-app">
        <p className="eyebrow text-stone">{t.eyebrow}</p>
        <h2 className="display mt-5 max-w-[16ch] text-[clamp(2.8rem,6vw,6rem)]">{t.title}</h2>
        <div className="mt-16 grid gap-5 md:grid-cols-6">
          {t.items.map((item, i) => {
            const Icon = ICONS[i]!;
            const wide = i === 0 || i === 3;
            return (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-10%" }}
                transition={{ duration: 0.9, delay: (i % 3) * 0.08, ease: [0.16, 1, 0.3, 1] }}
                className={wide ? "md:col-span-4" : i >= 4 ? "md:col-span-3" : "md:col-span-2"}
              >
                <TiltCard className={`group relative h-full overflow-hidden rounded-[1.75rem] p-8 sm:p-10 ${i === 0 ? "bg-ink text-chalk" : i === 3 ? "bg-signal text-ink" : "bg-chalk"}`}>
                  <span className="pointer-events-none absolute inset-0 opacity-0 transition duration-500 group-hover:opacity-100" style={{ background: "radial-gradient(circle at var(--gx,50%) var(--gy,50%), rgba(255,255,255,.18), transparent 55%)" }} />
                  <Icon className="size-8" strokeWidth={1.4} />
                  <h3 className={`display mt-16 ${wide ? "text-5xl" : "text-4xl"}`}>{item.title}</h3>
                  <p className={`mt-4 max-w-md ${i === 0 ? "text-chalk/70" : i === 3 ? "text-ink/75" : "text-stone"}`}>{item.text}</p>
                </TiltCard>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
