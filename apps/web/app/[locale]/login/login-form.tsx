"use client";

import { useActionState, useState } from "react";
import { googleLoginAction, loginAction, type ActionResult } from "@/app/actions";
import type { Dict, Locale } from "@/lib/i18n";
import { Button, Field, Input, Spinner } from "@/components/ui";

export function LoginForm({
  locale,
  t,
  driver,
  google,
  next,
  initialError,
}: {
  locale: Locale;
  t: Dict["auth"];
  driver: "supabase" | "password" | "dev";
  google: boolean;
  next: string;
  initialError?: string;
}) {
  const dev = driver === "dev";
  const [state, action, pending] = useActionState<ActionResult, FormData>(loginAction, { ok: true });
  const [mode, setMode] = useState<"password" | "signup" | "magic">("password");
  if (state.ok && state.message === "sent") {
    return <p className="rounded-2xl bg-signal/40 p-5 text-[15px]">{t.sent}</p>;
  }
  return (
    <div className="grid gap-6">
      <form action={action} className="grid gap-4">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="mode" value={mode} />
        <input type="hidden" name="next" value={next} />
        <Field label={t.email}>
          <Input type="email" name="email" required autoComplete="email" autoFocus />
        </Field>
        {!dev && mode !== "magic" ? (
          <Field label={t.password}>
            <Input
              type="password"
              name="password"
              required
              minLength={8}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
          </Field>
        ) : null}
        {state.error || initialError ? (
          <p className="text-sm text-ember" role="alert">
            {state.error ?? initialError}
          </p>
        ) : null}
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? <Spinner /> : null}
          {dev ? t.signIn : mode === "signup" ? t.signUp : mode === "magic" ? t.magic : t.signIn}
        </Button>
        {dev ? <p className="text-xs text-stone">{t.devNote}</p> : null}
      </form>
      {!dev ? (
        <>
          {google ? (
            <>
              <div className="flex items-center gap-4 text-xs uppercase tracking-widest text-stone">
                <span className="h-px flex-1 bg-ink/10" />
                {t.or}
                <span className="h-px flex-1 bg-ink/10" />
              </div>
              <form action={googleLoginAction}>
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="next" value={next} />
                <Button variant="secondary" size="lg" className="w-full" type="submit">
                  <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.8 14.2a6.6 6.6 0 0 1 0-4.3V7.1H2.1a11 11 0 0 0 0 9.9l3.7-2.8z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z"
                    />
                  </svg>
                  {t.google}
                </Button>
              </form>
            </>
          ) : null}
          <div className="flex flex-wrap justify-between gap-3 text-sm">
            <button
              type="button"
              className="underline-offset-4 hover:underline"
              onClick={() => setMode(mode === "signup" ? "password" : "signup")}
            >
              {mode === "signup" ? t.switchToSignIn : t.switchToSignUp}
            </button>
            {driver === "supabase" ? (
              <button
                type="button"
                className="text-stone underline-offset-4 hover:underline"
                onClick={() => setMode("magic")}
              >
                {t.magic}
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
