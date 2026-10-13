import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, requireConfigured } from "@/lib/auth";
import { env } from "@/lib/env";
import { googleConfigured } from "@/lib/google-oauth";
import { dict, isLocale } from "@/lib/i18n";
import { Logo } from "@/components/ui";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ next?: string; error?: string }> }) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : "sv";
  const { next, error } = await searchParams;
  requireConfigured(locale);
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : `/${locale}/dashboard`;
  if (await currentUser()) redirect(safeNext);
  const t = dict(locale);
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-ink text-chalk lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(80%_60%_at_20%_20%,#2f4bff_0%,transparent_60%),radial-gradient(60%_50%_at_80%_80%,#d4ff3a55_0%,transparent_60%)] opacity-80" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Link href={`/${locale}`}>
            <Logo dark />
          </Link>
          <p className="display max-w-[14ch] text-[clamp(3rem,5vw,5.5rem)]">{t.footer.tagline}</p>
        </div>
      </section>
      <section className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <Link href={`/${locale}`} className="mb-12 inline-block lg:hidden">
            <Logo />
          </Link>
          <h1 className="display text-5xl">{t.auth.title}</h1>
          <p className="mb-10 mt-3 text-stone">{t.auth.lead}</p>
          <LoginForm
            locale={locale}
            t={t.auth}
            driver={env().AUTH_DRIVER}
            google={env().AUTH_DRIVER === "supabase" || (env().AUTH_DRIVER === "password" && googleConfigured())}
            next={safeNext}
            initialError={error === "oauth" ? t.auth.oauthError : undefined}
          />
        </div>
      </section>
    </main>
  );
}
