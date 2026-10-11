import { requireUser } from "@/lib/auth";
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
          <NewProjectForm locale={locale} t={t.newProject} initialUrl={url?.slice(0, 500) ?? ""} />
        </div>
      </main>
    </>
  );
}
