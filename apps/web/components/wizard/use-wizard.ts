"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions";
import type { JobInfo, WizardState } from "@/lib/repo";

export function activeJob(state: WizardState): JobInfo | undefined {
  return Object.values(state.jobs).find((j) => j && (j.status === "queued" || j.status === "running"));
}

/** Polls the wizard state (fast while a job runs) and wraps server actions with refresh + errors. */
export function useWizard(initial: WizardState) {
  const [state, setState] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/projects/${initial.project.id}/state`, { cache: "no-store" }).catch(() => null);
    if (res?.ok) setState((await res.json()) as WizardState);
  }, [initial.project.id]);

  useEffect(() => {
    const busy = !!activeJob(state);
    timer.current = setTimeout(refresh, busy ? 1500 : 8000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [state, refresh]);

  const act = useCallback(
    (fn: () => Promise<ActionResult>, onOk?: (r: ActionResult) => void) =>
      startTransition(async () => {
        setError(null);
        const result = await fn();
        if (!result.ok) setError(result.error ?? "Error");
        else onOk?.(result);
        await refresh();
      }),
    [refresh],
  );

  return { state, refresh, act, pending, error, setError };
}
