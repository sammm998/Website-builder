import Link from "next/link";
import { Check, Plus } from "lucide-react";
import type { Dict, Locale } from "@/lib/i18n";
import { Logo, buttonClass } from "../ui";

export function Pricing({ t, locale }: { t: Dict["pricing"]; locale: Locale }) {
  return (
    <section id="pricing" className="bg-bone py-28 sm:py-40">
      <div className="container-app">
        <p className="eyebrow text-stone">{t.eyebrow}</p>
        <h2 className="display mt-5 text-[clamp(2.8rem,6vw,6rem)]">{t.title}</h2>
        <div className="mt-16 grid gap-5 lg:grid-cols-3">
          {t.plans.map((plan) => {
            const featured = "featured" in plan && plan.featured;
            return (
              <article key={plan.name} className={`flex flex-col rounded-[1.75rem] p-8 sm:p-10 ${featured ? "bg-ink text-chalk shadow-[0_40px_100px_-40px_rgba(15,15,13,.6)] lg:-translate-y-4" : "bg-chalk"}`}>
                <h3 className="text-lg font-medium">{plan.name}</h3>
                <p className="mt-6 flex items-baseline gap-2">
                  <span className="display text-6xl">{plan.price}</span>
                  {plan.period ? <span className={featured ? "text-chalk/60" : "text-stone"}>{plan.period}</span> : null}
                </p>
                <p className={`mt-4 ${featured ? "text-chalk/70" : "text-stone"}`}>{plan.text}</p>
                <ul className="mt-8 grid gap-3 text-[15px]">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-3">
                      <Check className={`size-4 ${featured ? "text-signal" : ""}`} /> {f}
                    </li>
                  ))}
                </ul>
                <Link href={`/${locale}/projects/new`} className={buttonClass(featured ? "signal" : "primary", "lg", "mt-10")}>
                  {plan.cta}
                </Link>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function Faq({ t }: { t: Dict["faq"] }) {
  return (
    <section id="faq" className="bg-paper py-28 sm:py-40">
      <div className="container-app grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <p className="eyebrow text-stone">{t.eyebrow}</p>
          <h2 className="display mt-5 text-[clamp(2.8rem,5vw,5rem)]">{t.title}</h2>
        </div>
        <div className="divide-y divide-ink/10 border-y border-ink/10">
          {t.items.map((item) => (
            <details key={item.q} className="group py-2">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-xl font-medium [&::-webkit-details-marker]:hidden">
                {item.q}
                <Plus className="size-5 shrink-0 transition duration-500 ease-expo group-open:rotate-45" />
              </summary>
              <p className="max-w-2xl pb-6 text-lg leading-relaxed text-stone">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FinalCta({ title, form }: { title: string; form: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden bg-ink py-32 text-chalk sm:py-48">
      <div className="pointer-events-none absolute -right-40 -top-40 size-[44rem] rounded-full bg-cobalt/40 blur-[120px]" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-60 left-10 size-[36rem] rounded-full bg-signal/20 blur-[120px]" aria-hidden="true" />
      <div className="container-app relative grid gap-12">
        <h2 className="display max-w-[14ch] text-[clamp(3.2rem,9vw,9rem)]">{title}</h2>
        {form}
      </div>
    </section>
  );
}

export function Footer({ t, locale }: { t: Dict; locale: Locale }) {
  return (
    <footer className="bg-ink text-chalk/70">
      <div className="container-app grid gap-10 border-t border-chalk/10 py-14 md:grid-cols-[1.5fr_1fr_1fr]">
        <div className="grid content-start gap-4">
          <Logo dark />
          <p className="display text-3xl text-chalk">{t.footer.tagline}</p>
        </div>
        <nav className="grid content-start gap-2 text-sm" aria-label="Footer">
          <a href="#how" className="hover:text-chalk">{t.nav.how}</a>
          <a href="#work" className="hover:text-chalk">{t.nav.work}</a>
          <a href="#pricing" className="hover:text-chalk">{t.nav.pricing}</a>
          <a href="#faq" className="hover:text-chalk">{t.nav.faq}</a>
        </nav>
        <div className="grid content-start gap-2 text-sm">
          <Link href={`/${locale}/login`} className="hover:text-chalk">{t.nav.login}</Link>
          <Link href={locale === "sv" ? "/en" : "/sv"} hrefLang={locale === "sv" ? "en" : "sv"} className="hover:text-chalk">{locale === "sv" ? "English" : "Svenska"}</Link>
        </div>
      </div>
      <div className="container-app pb-10 text-xs text-chalk/40">© {new Date().getFullYear()} Redesign AI. {t.footer.rights}</div>
    </footer>
  );
}
