"use client";

import { useRef, useState } from "react";
import clsx from "clsx";
import type { Dict } from "@/lib/i18n";

const PAIRS = [
  { id: "build", label: { sv: "Bygg", en: "Construction" } },
  { id: "coffee", label: { sv: "Café", en: "Café" } },
  { id: "arch", label: { sv: "Arkitekt", en: "Architect" } },
] as const;

/** Draggable, keyboard-accessible before/after comparison (illustrative examples). */
export function Compare({ t, locale }: { t: Dict["compare"]; locale: "sv" | "en" }) {
  const [pair, setPair] = useState<(typeof PAIRS)[number]["id"]>("build");
  const [pos, setPos] = useState(52);
  const frame = useRef<HTMLDivElement>(null);
  const drag = (clientX: number) => {
    const r = frame.current?.getBoundingClientRect();
    if (r) setPos(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)));
  };
  const img = (kind: "before" | "after") => (
    <img
      src={`/showcase/${pair}-${kind}-1600.webp`}
      srcSet={`/showcase/${pair}-${kind}-800.webp 800w, /showcase/${pair}-${kind}-1600.webp 1600w`}
      sizes="(min-width: 1280px) 1200px, 100vw"
      alt={`${kind === "before" ? t.before : t.after}: ${PAIRS.find((p) => p.id === pair)!.label[locale]}`}
      width={1600}
      height={1073}
      loading="lazy"
      draggable={false}
      className="absolute inset-0 h-full w-full object-cover"
    />
  );
  return (
    <section id="work" className="bg-ink py-28 text-chalk sm:py-40">
      <div className="container-app">
        <div className="flex flex-wrap items-end justify-between gap-8">
          <div>
            <p className="eyebrow text-chalk/60">{t.eyebrow}</p>
            <h2 className="display mt-5 max-w-[14ch] text-[clamp(2.8rem,6vw,6rem)]">{t.title}</h2>
          </div>
          <div className="flex gap-1 rounded-full bg-chalk/10 p-1" role="tablist" aria-label={t.eyebrow}>
            {PAIRS.map((p) => (
              <button key={p.id} role="tab" aria-selected={pair === p.id} onClick={() => setPair(p.id)} className={clsx("rounded-full px-4 py-2 text-sm transition", pair === p.id ? "bg-chalk text-ink" : "text-chalk/70 hover:text-chalk")}>
                {p.label[locale]}
              </button>
            ))}
          </div>
        </div>
        <div
          ref={frame}
          className="relative mt-14 aspect-[3/2] touch-pan-y select-none overflow-hidden rounded-[2rem] bg-ink-3 sm:aspect-[16/10]"
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            drag(e.clientX);
          }}
          onPointerMove={(e) => e.buttons === 1 && drag(e.clientX)}
        >
          {img("after")}
          <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>{img("before")}</div>
          <div className="pointer-events-none absolute inset-y-0 w-px bg-signal" style={{ left: `${pos}%` }}>
            <span className="absolute left-1/2 top-1/2 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-signal text-ink shadow-2xl">
              <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M9 6l-6 6 6 6M15 6l6 6-6 6" /></svg>
            </span>
          </div>
          <span className="absolute left-5 top-5 rounded-full bg-ink/70 px-3 py-1 text-xs backdrop-blur">{t.before}</span>
          <span className="absolute right-5 top-5 rounded-full bg-signal px-3 py-1 text-xs text-ink">{t.after}</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(pos)}
            onChange={(e) => setPos(Number(e.target.value))}
            aria-label={t.hint}
            className="absolute inset-x-0 bottom-0 h-12 w-full cursor-ew-resize opacity-0"
          />
        </div>
        <p className="mt-4 flex justify-between text-sm text-chalk/50"><span>{t.hint}</span><span>{t.illustrative}</span></p>
      </div>
    </section>
  );
}
