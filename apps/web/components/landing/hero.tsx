"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pause, Play } from "lucide-react";
import { useReducedMotion, useScroll, useMotionValueEvent, motion, useTransform } from "motion/react";
import type { Dict } from "@/lib/i18n";

const Hero3D = dynamic(() => import("./hero-3d"), { ssr: false });

/**
 * Landing hero: background reel recorded from real generated sites (pausable), editorial headline
 * that rises word by word, URL capture and a 3D stage of the three design directions.
 */
export function Hero({ t, form }: { t: Dict["hero"]; form: ReactNode }) {
  const section = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const progress = useRef(0);
  const reduced = useReducedMotion();
  const [playing, setPlaying] = useState(true);
  const [show3d, setShow3d] = useState(false);
  const { scrollYProgress } = useScroll({ target: section, offset: ["start start", "end start"] });
  useMotionValueEvent(scrollYProgress, "change", (v) => (progress.current = v));
  const textY = useTransform(scrollYProgress, [0, 1], [0, -120]);
  const fade = useTransform(scrollYProgress, [0, 0.7], [1, 0]);

  useEffect(() => {
    if (reduced) {
      video.current?.pause();
      setPlaying(false);
      return;
    }
    // 3D only on large screens, after the page is interactive (keeps LCP on the headline).
    const wide = matchMedia("(min-width: 1024px)").matches;
    if (!wide) return;
    const id = "requestIdleCallback" in window ? requestIdleCallback(() => setShow3d(true)) : setTimeout(() => setShow3d(true), 600);
    return () => ("cancelIdleCallback" in window ? cancelIdleCallback(id as number) : clearTimeout(id as ReturnType<typeof setTimeout>));
  }, [reduced]);

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) {
      void v.play();
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  };

  const words = t.title.split(" ");
  return (
    <section ref={section} className="relative isolate flex min-h-[100svh] items-end overflow-hidden bg-ink pb-16 pt-32 text-chalk lg:pb-24">
      <video
        ref={video}
        className="absolute inset-0 -z-20 h-full w-full object-cover opacity-25"
        autoPlay={!reduced}
        muted
        loop
        playsInline
        preload="metadata"
        poster="/showcase/reel/hero-poster.jpg"
        aria-hidden="true"
      >
        <source src="/showcase/reel/hero.webm" type="video/webm" />
        <source src="/showcase/reel/hero.mp4" type="video/mp4" />
      </video>
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_bottom,#0f0f0d_0%,transparent_22%),radial-gradient(90%_70%_at_15%_100%,#0f0f0d_30%,transparent_75%),linear-gradient(to_top,#0f0f0d_8%,#0f0f0dcc_45%,#0f0f0d66)]" />
      <div className="absolute inset-y-0 right-0 -z-10 hidden w-[52%] lg:block xl:w-[56%]">{show3d ? <Hero3D progress={progress} /> : null}</div>

      <motion.div style={reduced ? undefined : { y: textY, opacity: fade }} className="container-app">
        <p className="eyebrow mb-8 inline-flex items-center gap-3 text-chalk/70">
          <span className="size-1.5 rounded-full bg-signal" /> {t.eyebrow}
        </p>
        <h1 className="display max-w-[15ch] text-[clamp(3.1rem,7vw,7.4rem)] lg:max-w-[11ch]" aria-label={t.title}>
          {words.map((w, i) => (
            <span key={i} className="inline-block overflow-hidden pb-[0.08em] align-top" aria-hidden="true">
              <span className="hero-word inline-block" style={{ animationDelay: `${0.08 + i * 0.06}s` }}>
                {i === words.length - 2 || i === words.length - 1 ? <em className="text-signal">{w}</em> : w}
              </span>
              {i < words.length - 1 ? " " : null}
            </span>
          ))}
        </h1>
        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,34rem)_1fr] lg:items-end">
          <div className="grid gap-6">
            <p className="hero-fade max-w-xl text-lg leading-relaxed text-chalk/75">{t.lead}</p>
            <div className="hero-fade grid gap-3" style={{ animationDelay: "0.35s" }}>
              {form}
              <p className="text-sm text-chalk/50">{t.note}</p>
            </div>
          </div>
        </div>
      </motion.div>

      <button
        onClick={toggle}
        className="absolute bottom-6 right-6 inline-flex items-center gap-2 rounded-full bg-chalk/10 px-4 py-2 text-xs text-chalk/80 backdrop-blur transition hover:bg-chalk/20"
        aria-pressed={!playing}
      >
        {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
        {playing ? t.pause : t.play}
      </button>
    </section>
  );
}
