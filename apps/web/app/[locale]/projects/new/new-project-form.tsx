"use client";

import { useActionState, useState } from "react";
import { createProjectAction, type ActionResult } from "@/app/actions";
import { LANGUAGE_OPTIONS, type Dict, type Locale } from "@/lib/i18n";
import { Button, Field, Input, Spinner } from "@/components/ui";

export function NewProjectForm({ locale, t, initialUrl }: { locale: Locale; t: Dict["newProject"]; initialUrl: string }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(createProjectAction, { ok: true });
  const [inspiration, setInspiration] = useState(1);
  return (
    <form action={action} className="grid gap-8">
      <input type="hidden" name="locale" value={locale} />
      <Field label={t.url} hint={t.urlHint}>
        <Input name="url" required defaultValue={initialUrl} placeholder="https://www.dinsajt.se" inputMode="url" autoFocus className="h-14 text-lg" />
      </Field>
      <div className="grid gap-3">
        <span className="text-sm font-medium">{t.inspiration}</span>
        {Array.from({ length: inspiration }, (_, i) => (
          <Input key={i} name="inspiration" placeholder="https://" inputMode="url" />
        ))}
        <div className="flex items-center justify-between">
          <span className="text-xs text-stone">{t.inspirationHint}</span>
          {inspiration < 3 ? (
            <button type="button" className="text-sm underline-offset-4 hover:underline" onClick={() => setInspiration((n) => n + 1)}>
              +
            </button>
          ) : null}
        </div>
      </div>
      <fieldset className="grid gap-3">
        <legend className="mb-3 text-sm font-medium">{t.languages}</legend>
        <div className="flex flex-wrap gap-2">
          {LANGUAGE_OPTIONS.map((l) => (
            <label key={l.code} className="cursor-pointer">
              <input type="checkbox" name="languages" value={l.code} className="peer sr-only" />
              <span className="inline-flex h-10 items-center rounded-full border border-ink/15 px-4 text-sm transition peer-checked:border-ink peer-checked:bg-ink peer-checked:text-chalk peer-focus-visible:ring-2 peer-focus-visible:ring-cobalt">
                {l[locale]}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {state.error ? <p className="text-sm text-ember" role="alert">{state.error}</p> : null}
      <Button type="submit" size="lg" disabled={pending} className="justify-self-start">
        {pending ? <Spinner /> : null} {t.submit}
      </Button>
    </form>
  );
}
