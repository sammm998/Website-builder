"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import clsx from "clsx";
import { approveAnalysisAction, approveDirectionAction, startAnalysisAction } from "@/app/actions";
import type { Dict, Locale } from "@/lib/i18n";
import type { WizardState } from "@/lib/repo";
import { Button, Logo, Spinner } from "../ui";
import { activeJob, useWizard } from "./use-wizard";
import { JobBanner } from "./job-banner";
import { PagesStep } from "./pages-step";
import { AnalysisStep } from "./analysis-step";
import { DesignStep } from "./design-step";
import { SiteStep } from "./site-step";

const STEP_JOB = { 1: "crawl", 2: "analyze", 3: "directions", 4: "build" } as const;

export function Wizard({ initial, locale, t }: { initial: WizardState; locale: Locale; t: Dict["wizard"] }) {
  const { state, act, pending, error, setError } = useWizard(initial);
  const reached = state.project.step;
  const [view, setView] = useState<number>(reached);
  const [selected, setSelected] = useState<string | null>(null);
  const step = Math.min(view, reached);
  const crawlDone = state.jobs.crawl?.status === "completed";
  const included = state.pages.filter((p) => p.included && !p.error).length;
  const running = activeJob(state);
  const stepJob = state.jobs[STEP_JOB[step as 1 | 2 | 3 | 4]] ?? (step === 3 ? state.jobs.direction : step === 4 ? state.jobs.publish : undefined);

  // Follow the project forward automatically when a step completes.
  if (reached > view && !pending && view === reached - 1 && stepJob?.status === "completed") setView(reached);

  let primary: { label: string; onClick: () => void; disabled?: boolean } | null = null;
  if (step === 1) {
    primary = state.project.pages_locked
      ? { label: t.steps[1]!, onClick: () => setView(2), disabled: reached < 2 }
      : { label: t.pages.continue, disabled: !crawlDone || included === 0, onClick: () => act(() => startAnalysisAction(state.project.id, locale)) };
  } else if (step === 2) {
    primary = state.analysis?.approved_at
      ? { label: t.steps[2]!, onClick: () => setView(3), disabled: reached < 3 }
      : { label: t.analysis.approve, disabled: !state.analysis?.summary, onClick: () => act(() => approveAnalysisAction(state.project.id)) };
  } else if (step === 3) {
    primary = state.project.approved_direction_id
      ? { label: t.steps[3]!, onClick: () => setView(4), disabled: reached < 4 }
      : { label: t.design.approve, disabled: !selected, onClick: () => act(() => approveDirectionAction(state.project.id, selected!), () => setView(4)) };
  }

  return (
    <div className="grid h-dvh grid-rows-[auto_1fr_auto] overflow-hidden bg-paper">
      <header className="border-b border-ink/10 bg-paper">
        <div className="container-app flex h-16 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <Link href={`/${locale}/dashboard`} className="inline-flex items-center gap-1.5 rounded-full px-2 py-1.5 text-sm text-stone hover:bg-ink/5">
              <ArrowLeft className="size-4" /> <span className="hidden sm:inline">{t.back}</span>
            </Link>
            <span className="hidden sm:inline"><Logo /></span>
            <span className="truncate text-sm font-medium">{state.project.name || new URL(state.project.source_url).hostname}</span>
          </div>
          <span className="text-xs text-stone">{t.cost}: ${state.cost.toFixed(2)}</span>
        </div>
        <nav className="container-app pb-3" aria-label="Steg">
          <ol className="grid grid-cols-4 gap-2">
            {t.steps.map((label, i) => {
              const n = i + 1;
              const done = n < reached;
              const enabled = n <= reached;
              return (
                <li key={label}>
                  <button
                    disabled={!enabled}
                    onClick={() => setView(n)}
                    aria-current={step === n ? "step" : undefined}
                    className={clsx("group grid w-full gap-2 text-left disabled:cursor-not-allowed", !enabled && "opacity-40")}
                  >
                    <span className={clsx("h-1 rounded-full transition-colors", step === n ? "bg-ink" : done ? "bg-ink/40" : "bg-ink/10")} />
                    <span className="flex items-center gap-2 text-xs sm:text-sm">
                      <span className={clsx("grid size-5 place-items-center rounded-full text-[10px]", done ? "bg-ink text-chalk" : step === n ? "bg-signal" : "bg-ink/10")}>
                        {done ? <Check className="size-3" /> : n}
                      </span>
                      <span className="truncate">{label}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      </header>

      <main className="container-app min-h-0 py-6">
        {step === 1 ? <PagesStep state={state} t={t} act={act} /> : null}
        {step === 2 ? <AnalysisStep key={String(state.analysis?.approved_at)} state={state} t={t} act={act} /> : null}
        {step === 3 ? <DesignStep state={state} t={t} act={act} selected={selected} onSelect={setSelected} /> : null}
        {step === 4 ? <SiteStep state={state} t={t} act={act} /> : null}
      </main>

      <footer className="border-t border-ink/10 bg-chalk/80 backdrop-blur">
        <div className="container-app flex min-h-20 flex-wrap items-center justify-between gap-3 py-3">
          <div className="min-w-0 flex-1">
            {error ? (
              <p className="text-sm text-ember" role="alert" onClick={() => setError(null)}>{error}</p>
            ) : (
              <JobBanner job={stepJob ?? running} t={t} act={act} />
            )}
            {step === 1 && !stepJob?.error && !running ? <p className="text-sm text-stone">{state.pages.length} {t.pages.discovered} · {included} ✓</p> : null}
          </div>
          {primary ? (
            <Button size="lg" variant={step === 3 && !state.project.approved_direction_id ? "signal" : "primary"} onClick={primary.onClick} disabled={primary.disabled || pending}>
              {pending ? <Spinner /> : null} {primary.label} <ArrowRight className="size-4" />
            </Button>
          ) : null}
        </div>
      </footer>
    </div>
  );
}
