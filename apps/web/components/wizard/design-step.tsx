"use client";

import { useState } from "react";
import { Check, Eye, RefreshCw } from "lucide-react";
import clsx from "clsx";
import { FONT_CATALOG } from "@redesign/schema";
import { regenerateDirectionAction, type ActionResult } from "@/app/actions";
import type { Dict } from "@/lib/i18n";
import type { DirectionView, WizardState } from "@/lib/repo";
import { Button, Spinner, Textarea } from "../ui";
import { Dialog } from "./dialog";
import { DeviceFrame } from "./device-frame";
import { PreviewLinks } from "./preview-links";

export function DesignStep({ state, t, act, selected, onSelect }: { state: WizardState; t: Dict["wizard"]; act: (fn: () => Promise<ActionResult>) => void; selected: string | null; onSelect: (id: string) => void }) {
  const [preview, setPreview] = useState<DirectionView | null>(null);
  const [feedback, setFeedback] = useState("");
  const approved = state.project.approved_direction_id;
  const busy = state.jobs.directions?.status === "running" || state.jobs.directions?.status === "queued" || state.jobs.direction?.status === "running" || state.jobs.direction?.status === "queued";
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_1fr] gap-6">
      <div>
        <h2 className="display text-5xl">{t.design.title}</h2>
        <p className="mt-2 max-w-2xl text-stone">{t.design.lead}</p>
      </div>
      <div className="grid min-h-0 gap-5 overflow-y-auto md:grid-cols-3">
        {[0, 1, 2].map((slot) => {
          const d = state.directions.find((x) => x.slot === slot);
          if (!d) {
            return (
              <div key={slot} className="grid aspect-[3/4] place-items-center rounded-3xl border border-dashed border-ink/20 text-stone">
                {busy ? <Spinner /> : "—"}
              </div>
            );
          }
          const isSelected = (selected ?? approved) === d.id;
          const ds = d.design_system;
          return (
            <article key={d.id} className={clsx("group grid content-start overflow-hidden rounded-3xl border bg-chalk transition", isSelected ? "border-ink ring-2 ring-ink" : "border-ink/10")}>
              <button className="relative block aspect-[16/10] overflow-hidden bg-bone text-left" onClick={() => setPreview(d)} aria-label={`${t.design.preview}: ${d.name}`}>
                {d.screenshot_desktop ? (
                  <img src={`/api/screens/${d.screenshot_desktop}`} alt="" className="h-full w-full object-cover object-top transition duration-700 ease-expo group-hover:scale-[1.04]" />
                ) : null}
                <span className="absolute inset-x-4 bottom-4 inline-flex w-fit items-center gap-2 rounded-full bg-ink/80 px-3 py-1.5 text-xs text-chalk opacity-0 backdrop-blur transition group-hover:opacity-100">
                  <Eye className="size-3.5" /> {t.design.preview}
                </span>
              </button>
              <div className="grid gap-4 p-6">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="display text-3xl">{d.name}</h3>
                  {d.version > 1 ? <span className="text-xs text-stone">v{d.version}</span> : null}
                </div>
                <p className="line-clamp-4 text-sm text-ink/75">{d.rationale}</p>
                <div className="flex items-center gap-1.5" aria-hidden="true">
                  {(["bg", "surface-2", "fg", "accent", "brand"] as const).map((c) => (
                    <span key={c} className="size-6 rounded-full ring-1 ring-ink/10" style={{ background: ds.colors[c] }} />
                  ))}
                  <span className="ml-2 truncate text-xs text-stone">{FONT_CATALOG[ds.typography.display].family} · {FONT_CATALOG[ds.typography.body].family}</span>
                </div>
                <p className="text-xs uppercase tracking-widest text-stone">{ds.motion.personality} · {ds.mode}</p>
                {!approved ? (
                  <Button variant={isSelected ? "primary" : "secondary"} onClick={() => onSelect(d.id)}>
                    {isSelected ? <><Check className="size-4" /> {t.design.chosen}</> : t.design.choose}
                  </Button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
      <Dialog open={!!preview} onClose={() => setPreview(null)} title={preview?.name ?? ""} wide>
        {preview ? (
          <div className="grid h-[78dvh] grid-rows-[auto_1fr_auto] gap-4">
            <PreviewLinks href={`/preview/direction/${preview.id}`} kind="direction" targetId={preview.id} t={t} />
            <DeviceFrame src={`/preview/direction/${preview.id}`} title={preview.name} labels={t.design} />
            {!approved ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <label className="grid flex-1 gap-2 text-sm">
                  <span className="font-medium">{t.design.feedback}</span>
                  <Textarea rows={2} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
                </label>
                <div className="flex gap-2">
                  <Button variant="secondary" disabled={!feedback.trim() || busy} onClick={() => { act(() => regenerateDirectionAction(state.project.id, preview.slot, feedback)); setFeedback(""); setPreview(null); }}>
                    <RefreshCw className="size-4" /> {t.design.regenerate}
                  </Button>
                  <Button onClick={() => { onSelect(preview.id); setPreview(null); }}>{t.design.choose}</Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
