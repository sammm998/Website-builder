import Link from "next/link";
import { ArrowUpRight, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { dict, isLocale } from "@/lib/i18n";
import { listProjects } from "@/lib/repo";
import { AppHeader } from "@/components/app-header";
import { Badge, ButtonLink } from "@/components/ui";
import { deleteProjectAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function Dashboard({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : "sv";
  const user = await requireUser(locale);
  const t = dict(locale);
  const projects = await listProjects(user.id);
  return (
    <>
      <AppHeader locale={locale} email={user.email} />
      <main className="container-app py-14">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <h1 className="display text-6xl">{t.dashboard.title}</h1>
          <ButtonLink href={`/${locale}/projects/new`} size="lg">
            <Plus className="size-4" /> {t.dashboard.new}
          </ButtonLink>
        </div>
        {projects.length === 0 ? (
          <p className="mt-16 max-w-md text-lg text-stone">{t.dashboard.empty}</p>
        ) : (
          <ul className="mt-12 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((p) => (
              <li key={p.id} className="group relative overflow-hidden rounded-3xl border border-ink/10 bg-chalk">
                <Link href={`/${locale}/projects/${p.id}`} className="block">
                  <div className="aspect-[16/10] overflow-hidden bg-bone">
                    {p.thumbnail ? (
                      <img src={`/api/screens/${p.thumbnail}`} alt="" className="h-full w-full object-cover object-top transition duration-700 ease-expo group-hover:scale-[1.03]" />
                    ) : null}
                  </div>
                  <div className="flex items-start justify-between gap-4 p-6">
                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-medium">{p.name || new URL(p.source_url).hostname}</h2>
                      <p className="truncate text-sm text-stone">{new URL(p.source_url).hostname}</p>
                    </div>
                    <ArrowUpRight className="size-5 shrink-0 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </div>
                </Link>
                <div className="flex items-center justify-between border-t border-ink/10 px-6 py-3">
                  <Badge tone={p.status === "published" ? "good" : "neutral"}>{t.wizard.steps[Math.max(0, p.step - 1)]}</Badge>
                  <form action={deleteProjectAction}>
                    <input type="hidden" name="projectId" value={p.id} />
                    <input type="hidden" name="locale" value={locale} />
                    <button className="text-xs text-stone hover:text-ember">{t.dashboard.delete}</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
