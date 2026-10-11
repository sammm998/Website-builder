"use client";

import { useState } from "react";
import { ChevronRight, Pencil } from "lucide-react";
import type { AnalysisSummary } from "@redesign/schema";
import { updateAnalysisAction, type ActionResult } from "@/app/actions";
import type { Dict } from "@/lib/i18n";
import type { WizardState } from "@/lib/repo";
import { Badge, Button, Textarea } from "../ui";
import { Dialog } from "./dialog";

interface SeoCheck { id: string; status: string; severity: string; title: string; detail: string; paths: string[] }
interface SeoReport { score: number | null; checks: SeoCheck[]; suggestions: { path: string; field: string; current: string; suggested: string; reason: string }[] }

const FIELDS = ["businessType", "audience", "tone", "positioning", "recommendedDirection", "contentNotes"] as const;

export function AnalysisStep({ state, t, act }: { state: WizardState; t: Dict["wizard"]; act: (fn: () => Promise<ActionResult>) => void }) {
  const summary = state.analysis?.summary;
  const report = state.analysis?.seo_report as SeoReport | null | undefined;
  const approved = !!state.analysis?.approved_at;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<AnalysisSummary | null>(summary ?? null);
  const [details, setDetails] = useState(false);
  if (!summary) return <div className="grid h-full place-items-center text-stone">{t.working}</div>;
  const labels: Record<(typeof FIELDS)[number], string> = {
    businessType: t.analysis.business,
    audience: t.analysis.audience,
    tone: t.analysis.tone,
    positioning: t.analysis.positioning,
    recommendedDirection: t.analysis.direction,
    contentNotes: t.analysis.content,
  };
  const value = editing ? draft! : summary;
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_1fr] gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="display text-5xl">{t.analysis.title}</h2>
          <p className="mt-2 max-w-2xl text-stone">{t.analysis.lead}</p>
        </div>
        <div className="flex items-center gap-2">
          {approved ? <Badge tone="good">{t.analysis.approved}</Badge> : editing ? (
            <Button size="sm" onClick={() => act(() => updateAnalysisAction(state.project.id, draft))}>{t.analysis.save}</Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => { setDraft(summary); setEditing(true); }}>
              <Pencil className="size-3.5" /> {t.analysis.edit}
            </Button>
          )}
          {editing ? <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>×</Button> : null}
        </div>
      </div>
      <div className="grid min-h-0 gap-6 overflow-y-auto lg:grid-cols-[1.4fr_1fr]">
        <div className="grid content-start gap-4 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <section key={f} className={`rounded-3xl border border-ink/10 bg-chalk p-6 ${f === "recommendedDirection" ? "sm:col-span-2 bg-ink text-chalk" : ""}`}>
              <h3 className="eyebrow opacity-60">{labels[f]}</h3>
              {editing ? (
                <Textarea className="mt-3 min-h-24 text-ink" value={value[f]} onChange={(e) => setDraft({ ...draft!, [f]: e.target.value })} />
              ) : (
                <p className={`mt-3 ${f === "recommendedDirection" ? "display text-3xl" : "text-[15px] leading-relaxed"}`}>{value[f]}</p>
              )}
            </section>
          ))}
          {(["strengths", "weaknesses"] as const).map((k) => (
            <section key={k} className="rounded-3xl border border-ink/10 bg-chalk p-6">
              <h3 className="eyebrow opacity-60">{k === "strengths" ? t.analysis.strengths : t.analysis.weaknesses}</h3>
              {editing ? (
                <Textarea className="mt-3 min-h-28" value={value[k].join("\n")} onChange={(e) => setDraft({ ...draft!, [k]: e.target.value.split("\n").filter(Boolean) })} />
              ) : (
                <ul className="mt-3 grid gap-2 text-[15px]">{value[k].map((s, i) => <li key={i}>– {s}</li>)}</ul>
              )}
            </section>
          ))}
        </div>
        <aside className="grid content-start gap-4">
          <section className="rounded-3xl border border-ink/10 bg-chalk p-6">
            <div className="flex items-baseline justify-between">
              <h3 className="eyebrow opacity-60">{t.analysis.score}</h3>
              <span className="display text-6xl">{report?.score ?? "–"}</span>
            </div>
            <ul className="mt-4 grid gap-3">
              {summary.seoFindings.map((f, i) => (
                <li key={i} className="grid gap-1 border-t border-ink/10 pt-3">
                  <div className="flex items-center gap-2"><Badge tone={f.severity === "high" ? "bad" : f.severity === "medium" ? "warn" : "neutral"}>{f.severity}</Badge><span className="font-medium">{f.title}</span></div>
                  <p className="text-sm text-stone">{f.detail}</p>
                </li>
              ))}
            </ul>
            <button className="mt-5 inline-flex items-center gap-1 text-sm font-medium" onClick={() => setDetails(true)}>
              {t.analysis.readMore} <ChevronRight className="size-4" />
            </button>
          </section>
        </aside>
      </div>
      <Dialog open={details} onClose={() => setDetails(false)} title={t.analysis.details}>
        <ul className="grid gap-3">
          {(report?.checks ?? []).map((c) => (
            <li key={c.id} className="grid gap-1 rounded-2xl border border-ink/10 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={c.status === "pass" ? "good" : c.status === "fail" ? "bad" : c.status === "warn" ? "warn" : "neutral"}>{c.status === "unknown" ? t.analysis.unknown : c.status}</Badge>
                <span className="font-medium">{c.title}</span>
              </div>
              <p className="text-sm text-stone">{c.detail}</p>
              {c.paths.length ? <p className="font-mono text-xs text-stone">{c.paths.slice(0, 8).join("  ")}{c.paths.length > 8 ? " …" : ""}</p> : null}
            </li>
          ))}
        </ul>
        {report?.suggestions.length ? (
          <>
            <h3 className="mt-8 font-medium">{t.analysis.suggestions}</h3>
            <ul className="mt-3 grid gap-2 text-sm">
              {report.suggestions.map((s, i) => (
                <li key={i} className="rounded-2xl bg-bone/60 p-3"><span className="font-mono text-xs">{s.path} · {s.field}</span><br />{s.suggested}</li>
              ))}
            </ul>
          </>
        ) : null}
      </Dialog>
    </div>
  );
}
