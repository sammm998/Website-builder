"use client";

import { useParams } from "next/navigation";

/** Friendly fallback instead of a bare 500; points operators at the deployment diagnostics. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { locale } = useParams<{ locale?: string }>();
  const sv = locale !== "en";
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="max-w-md text-center">
        <h1 className="display text-5xl">{sv ? "Något gick fel" : "Something went wrong"}</h1>
        <p className="mt-4 text-stone">
          {sv ? "Sidan kunde inte laddas. Försök igen om en stund." : "The page could not be loaded. Please try again shortly."}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-4 text-sm">
          <button type="button" onClick={reset} className="rounded-full bg-ink px-5 py-2.5 text-chalk">
            {sv ? "Försök igen" : "Try again"}
          </button>
          <a href={`/${sv ? "sv" : "en"}/setup`} className="rounded-full border border-ink/15 px-5 py-2.5">
            {sv ? "Systemstatus" : "System status"}
          </a>
        </div>
        {error.digest ? <p className="mt-6 font-mono text-xs text-stone">ref {error.digest}</p> : null}
      </div>
    </main>
  );
}
