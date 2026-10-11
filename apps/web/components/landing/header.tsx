"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import clsx from "clsx";
import type { Dict, Locale } from "@/lib/i18n";
import { Logo, buttonClass } from "../ui";

export function LandingHeader({ locale, t, signedIn }: { locale: Locale; t: Dict["nav"]; signedIn: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(scrollY > 40);
    on();
    addEventListener("scroll", on, { passive: true });
    return () => removeEventListener("scroll", on);
  }, []);
  const links = [
    ["#how", t.how],
    ["#work", t.work],
    ["#pricing", t.pricing],
    ["#faq", t.faq],
  ] as const;
  return (
    <header className={clsx("fixed inset-x-0 top-0 z-50 transition-all duration-500 ease-expo", scrolled || open ? "bg-ink/80 backdrop-blur-xl" : "bg-transparent")}>
      <div className="container-app flex h-[72px] items-center justify-between gap-6 text-chalk">
        <Link href={`/${locale}`} aria-label="Redesign AI">
          <Logo dark />
        </Link>
        <nav className="hidden items-center gap-1 text-sm lg:flex" aria-label="Huvudmeny">
          {links.map(([href, label]) => (
            <a key={href} href={href} className="rounded-full px-4 py-2 text-chalk/80 transition hover:bg-chalk/10 hover:text-chalk">
              {label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href={locale === "sv" ? "/en" : "/sv"} hrefLang={locale === "sv" ? "en" : "sv"} className="rounded-full px-3 py-2 text-sm text-chalk/70 hover:text-chalk">
            {locale === "sv" ? "EN" : "SV"}
          </Link>
          <Link href={`/${locale}/${signedIn ? "dashboard" : "login"}`} className="hidden rounded-full px-4 py-2 text-sm text-chalk/80 hover:text-chalk sm:inline-flex">
            {signedIn ? t.dashboard : t.login}
          </Link>
          <Link href={`/${locale}/projects/new`} className={buttonClass("signal", "sm", "hidden sm:inline-flex")}>
            {t.start}
          </Link>
          <button className="rounded-full p-2 lg:hidden" aria-expanded={open} aria-controls="landing-menu" aria-label="Meny" onClick={() => setOpen(!open)}>
            <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d={open ? "M6 6l12 12M18 6L6 18" : "M3 8h18M3 16h18"} />
            </svg>
          </button>
        </div>
      </div>
      <nav id="landing-menu" hidden={!open} className="container-app grid gap-1 pb-8 lg:hidden">
        {links.map(([href, label]) => (
          <a key={href} href={href} onClick={() => setOpen(false)} className="display py-2 text-4xl text-chalk">
            {label}
          </a>
        ))}
        <Link href={`/${locale}/projects/new`} className={buttonClass("signal", "lg", "mt-4")}>
          {t.start}
        </Link>
      </nav>
    </header>
  );
}
