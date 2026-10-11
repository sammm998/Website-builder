"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import { cancelJobAction, resumeJobAction, type ActionResult } from "@/app/actions";
import type { Dict } from "@/lib/i18n";
import type { JobInfo } from "@/lib/repo";
import { Button } from "../ui";

export function progressText(job: JobInfo, t: Dict["wizard"]): string {
  const p = job.progress as { phase?: string; done?: number; total?: number; current?: string | null; processed?: number; discovered?: number; lang?: string; briefs?: string[] };
  if (job.kind === "crawl") return `${p.processed ?? 0} ${t.pages.crawled} · ${p.discovered ?? 0} ${t.pages.discovered}${p.current ? ` · ${p.current}` : ""}`;
  if (job.kind === "build" && p.phase) {
    const label = t.site.phases[p.phase as keyof typeof t.site.phases] ?? p.phase;
    return `${label}${p.lang ? ` (${p.lang.toUpperCase()})` : ""} · ${p.done ?? 0}/${p.total ?? "…"}${p.current ? ` · ${p.current}` : ""}`;
  }
  if (job.kind === "directions") return p.briefs?.length ? p.briefs.join(" · ") : t.design.generating;
  return t.working;
}

export function JobBanner({ job, t, act }: { job: JobInfo | undefined; t: Dict["wizard"]; act: (fn: () => Promise<ActionResult>) => void }) {
  if (!job || job.status === "completed" || job.status === "cancelled") return null;
  if (job.status === "paused" || job.status === "failed") {
    return (
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-ember/30 bg-ember/5 px-5 py-4 text-sm" role="alert">
        <AlertTriangle className="size-5 text-ember" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{t.paused}</p>
          <p className="text-ink/70">{job.error}</p>
        </div>
        <Button size="sm" onClick={() => act(() => resumeJobAction(job.id))}>{t.resume}</Button>
        <Button size="sm" variant="ghost" onClick={() => act(() => cancelJobAction(job.id))}>{t.cancel}</Button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-ink px-5 py-4 text-sm text-chalk" role="status" aria-live="polite">
      <Loader2 className="size-4 animate-spin text-signal" />
      <span className="truncate">{progressText(job, t)}</span>
    </div>
  );
}
