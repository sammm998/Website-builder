import Link from "next/link";
import { logoutAction } from "@/app/actions";
import { dict, type Locale } from "@/lib/i18n";
import { Logo } from "./ui";

export function AppHeader({ locale, email }: { locale: Locale; email?: string }) {
  const t = dict(locale);
  return (
    <header className="sticky top-0 z-40 border-b border-ink/10 bg-paper/85 backdrop-blur-xl">
      <div className="container-app flex h-16 items-center justify-between gap-6">
        <Link href={`/${locale}`} aria-label="Redesign AI">
          <Logo />
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          <Link className="rounded-full px-3 py-2 hover:bg-ink/5" href={`/${locale}/dashboard`}>
            {t.nav.dashboard}
          </Link>
          <Link className="rounded-full px-3 py-2 text-stone hover:bg-ink/5" href={locale === "sv" ? "/en/dashboard" : "/sv/dashboard"} hrefLang={locale === "sv" ? "en" : "sv"}>
            {locale === "sv" ? "EN" : "SV"}
          </Link>
          {email ? <span className="hidden text-stone md:inline">{email}</span> : null}
          <form action={logoutAction}>
            <input type="hidden" name="locale" value={locale} />
            <button className="rounded-full px-3 py-2 hover:bg-ink/5">{t.nav.logout}</button>
          </form>
        </nav>
      </div>
    </header>
  );
}
