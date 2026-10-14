"use client";

import { Check, Lock, TriangleAlert } from "lucide-react";
import clsx from "clsx";
import { toggleAllPagesAction, togglePageAction, type ActionResult } from "@/app/actions";
import type { Dict } from "@/lib/i18n";
import type { WizardState } from "@/lib/repo";

export function PagesStep({ state, t, act }: { state: WizardState; t: Dict["wizard"]; act: (fn: () => Promise<ActionResult>) => void }) {
  const locked = state.project.pages_locked;
  const ok = state.pages.filter((p) => !p.error);
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_1fr] gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="display text-5xl">{t.pages.title}</h2>
          <p className="mt-2 text-stone">{locked ? t.pages.locked : t.pages.lead}</p>
        </div>
        {!locked && ok.length > 1 ? (
          <div className="flex gap-2 text-sm">
            <button className="rounded-full px-3 py-1.5 hover:bg-ink/5" onClick={() => act(() => toggleAllPagesAction(state.project.id, true))}>{t.pages.selectAll}</button>
            <button className="rounded-full px-3 py-1.5 hover:bg-ink/5" onClick={() => act(() => toggleAllPagesAction(state.project.id, false))}>{t.pages.selectNone}</button>
          </div>
        ) : null}
      </div>
      <ul className="min-h-0 divide-y divide-ink/10 overflow-y-auto rounded-3xl border border-ink/10 bg-chalk" aria-label={t.pages.title}>
        {state.pages.map((p) => (
          <li key={p.id}>
            <label className={clsx("flex items-center gap-4 px-5 py-4 transition", !locked && !p.error && "cursor-pointer hover:bg-ink/[0.03]")}>
              {p.error ? (
                <TriangleAlert className="size-5 shrink-0 text-ember" aria-label={t.pages.error} />
              ) : locked ? (
                p.included ? <Check className="size-5 shrink-0" /> : <Lock className="size-4 shrink-0 text-stone" />
              ) : (
                <input
                  type="checkbox"
                  className="size-5 shrink-0 accent-ink"
                  checked={p.included}
                  onChange={(e) => act(() => togglePageAction(p.id, e.target.checked))}
                />
              )}
              <span className="w-[38%] shrink-0 truncate font-mono text-[13px]">{p.path}</span>
              <span className={clsx("min-w-0 flex-1 truncate text-sm", p.error ? "text-ember" : "text-stone")}>{p.error ?? p.title}</span>
              {!p.error && p.words ? (
                <span className="hidden shrink-0 text-xs tabular-nums text-stone sm:inline" title={t.pages.contentHint}>
                  {p.sections} {t.pages.sections} · {p.words} {t.pages.words}
                </span>
              ) : null}
              {p.status_code && p.status_code >= 400 ? <span className="hidden text-xs text-stone sm:inline">{p.status_code}</span> : null}
            </label>
          </li>
        ))}
        {state.pages.length === 0 ? <li className="px-5 py-10 text-center text-stone">…</li> : null}
      </ul>
    </div>
  );
}
