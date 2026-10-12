import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { isLocale, LOCALES } from "@/lib/i18n";
import "../globals.css";
import { appOrigin } from "@/lib/hosts";

export const viewport: Viewport = { themeColor: "#0f0f0d", width: "device-width", initialScale: 1 };

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const origin = appOrigin();
  const sv = locale === "sv";
  return {
    metadataBase: new URL(origin),
    title: { default: sv ? "Redesign AI – Gör om din webbplats med 3D, rörelse och AI" : "Redesign AI – Redesign your website with 3D, motion and AI", template: "%s · Redesign AI" },
    description: sv
      ? "Klistra in din adress och få tre levande designförslag med 3D och skrolleffekter. Hela sajten byggs om med allt innehåll och all SEO kvar."
      : "Paste your address and get three living design proposals with 3D and scroll effects. The whole site is rebuilt with all content and SEO intact.",
    alternates: { canonical: `/${locale}`, languages: { sv: "/sv", en: "/en", "x-default": "/sv" } },
    openGraph: { type: "website", siteName: "Redesign AI", locale: sv ? "sv_SE" : "en_US" },
    icons: { icon: "/favicon.svg" },
  };
}

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  );
}
