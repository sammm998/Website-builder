import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { dict, isLocale } from "@/lib/i18n";
import { wizardState } from "@/lib/repo";
import { Wizard } from "@/components/wizard/wizard";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: raw, id } = await params;
  const locale = isLocale(raw) ? raw : "sv";
  const user = await requireUser(locale);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const state = await wizardState(user.id, id);
  if (!state) notFound();
  return <Wizard initial={JSON.parse(JSON.stringify(state))} locale={locale} t={dict(locale).wizard} />;
}
