import Link from "next/link";
import { aiKeyStatus } from "@/lib/ai-key";
import { requireUser } from "@/lib/auth";
import { setupStatus } from "@/lib/setup";
import { dict, isLocale } from "@/lib/i18n";
import { AppHeader } from "@/components/app-header";
import { NewProjectForm } from "./new-project-form";

export const dynamic = "force-dynamic";

export default async function NewProject({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ url?: string }> }) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : "sv";
  const user = await requireUser(locale);
  const t = dict(locale);
  const { url } = await searchParams;
  // Crawling works without it, but analysis and designs need the Claude key: say so up front.
  const workers = (await setupStatus()).workers;
  const key = await aiKeyStatus(workers.some((w) => w.fresh && w.ai_ready)).catch(() => ({ source: "env" as const, last4: null }));
  return (
    <>
      <AppHeader locale={locale} email={user.email} />
      <main className="container-app grid gap-16 py-16 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <p className="eyebrow text-stone">{t.wizard.steps.join(" · ")}</p>
          <h1 className="display mt-6 text-[clamp(3rem,6vw,6rem)]">{t.newProject.title}</h1>
          <p className="mt-6 max-w-md text-lg text-stone">{t.hero.lead}</p>
        </div>
        <div className="rounded-[2rem] border border-ink/10 bg-chalk p-8 sm:p-12">
          {key.source === null ? (
            <p className="mb-8 rounded-2xl border border-ember/30 bg-ember/5 p-4 text-sm">
              {t.newProject.keyMissing}{" "}
              <Link href={`/${locale}/setup`} className="font-medium underline underline-offset-4">
                {t.newProject.keyMissingLink}
              </Link>
            </p>
          ) : null}
          <NewProjectForm locale={locale} t={t.newProject} initialUrl={url?.slice(0, 500) ?? ""} />
        </div>
      </main>
    </>
  );
}
