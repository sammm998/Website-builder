"use client";

import { useActionState } from "react";
import { saveAnthropicKeyAction, type ActionResult } from "@/app/actions";
import { Button, Input, Spinner } from "@/components/ui";

export function KeyForm({ labels }: { labels: { placeholder: string; save: string; verified: string; unverified: string } }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(saveAnthropicKeyAction, { ok: true });
  return (
    <form action={action} className="mt-4 grid gap-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <Input name="key" type="password" required autoComplete="off" spellCheck={false} placeholder={labels.placeholder} className="h-12 min-w-0 flex-1 font-mono" />
        <Button type="submit" size="lg" disabled={pending} className="shrink-0">
          {pending ? <Spinner /> : null} {labels.save}
        </Button>
      </div>
      {state.error ? (
        <p className="text-sm text-ember" data-testid="key-error">
          {state.error}
        </p>
      ) : null}
      {state.ok && state.message ? (
        <p className="text-sm text-emerald-700" data-testid="key-saved">
          {state.message === "verified" ? labels.verified : labels.unverified}
        </p>
      ) : null}
    </form>
  );
}
