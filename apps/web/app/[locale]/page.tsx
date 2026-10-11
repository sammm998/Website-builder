import { currentUser } from "@/lib/auth";
import { dict, isLocale } from "@/lib/i18n";
import { SmoothScroll } from "@/components/landing/smooth-scroll";
import { LandingHeader } from "@/components/landing/header";
import { Hero } from "@/components/landing/hero";
import { UrlForm } from "@/components/landing/url-form";
import { Workflow } from "@/components/landing/workflow";
import { Compare } from "@/components/landing/compare";
import { Showcase } from "@/components/landing/showcase";
import { Features } from "@/components/landing/features";
import { Faq, FinalCta, Footer, Pricing } from "@/components/landing/sections";
import { RespectMotion } from "@/components/landing/motion-config";

export const dynamic = "force-dynamic";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : "sv";
  const t = dict(locale);
  const user = await currentUser().catch(() => null);
  const origin = process.env["APP_ORIGIN"] ?? "http://localhost:3000";
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": `${origin}/#org`, name: "Redesign AI", url: origin, logo: `${origin}/favicon.svg` },
      { "@type": "WebSite", "@id": `${origin}/#website`, name: "Redesign AI", url: `${origin}/${locale}`, inLanguage: locale, publisher: { "@id": `${origin}/#org` } },
      {
        "@type": "SoftwareApplication",
        name: "Redesign AI",
        applicationCategory: "DesignApplication",
        operatingSystem: "Web",
        description: t.hero.lead,
        offers: t.pricing.plans.filter((p) => /\d/.test(p.price)).map((p) => ({ "@type": "Offer", name: p.name, price: p.price.replace(/[^\d]/g, ""), priceCurrency: locale === "sv" ? "SEK" : "EUR" })),
      },
      { "@type": "FAQPage", mainEntity: t.faq.items.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
    ],
  };
  return (
    <RespectMotion>
      <SmoothScroll />
      <LandingHeader locale={locale} t={t.nav} signedIn={!!user} />
      <main>
        <Hero t={t.hero} form={<UrlForm locale={locale} placeholder={t.hero.placeholder} cta={t.hero.cta} id="hero-url" />} />
        <Workflow t={t.steps} />
        <Compare t={t.compare} locale={locale} />
        <Showcase eyebrow={t.showcase.eyebrow} title={t.showcase.title} />
        <Features t={t.features} />
        <Pricing t={t.pricing} locale={locale} />
        <Faq t={t.faq} />
        <FinalCta title={t.hero.cta} form={<UrlForm locale={locale} placeholder={t.hero.placeholder} cta={t.hero.cta} id="cta-url" />} />
      </main>
      <Footer t={t} locale={locale} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    </RespectMotion>
  );
}
