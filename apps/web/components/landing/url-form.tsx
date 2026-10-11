import { ArrowRight } from "lucide-react";
import { startFromLandingAction } from "@/app/actions";
import type { Locale } from "@/lib/i18n";

/** URL capture that works without JavaScript (server action). */
export function UrlForm({ locale, placeholder, cta, dark = true, id }: { locale: Locale; placeholder: string; cta: string; dark?: boolean; id: string }) {
  return (
    <form action={startFromLandingAction} className={`group flex w-full max-w-xl items-center gap-2 rounded-full p-1.5 pl-6 ring-1 transition focus-within:ring-2 ${dark ? "bg-chalk/10 ring-chalk/20 backdrop-blur-xl focus-within:ring-signal" : "bg-chalk ring-ink/15 focus-within:ring-ink"}`}>
      <input type="hidden" name="locale" value={locale} />
      <label htmlFor={id} className="sr-only">{placeholder}</label>
      <input
        id={id}
        name="url"
        required
        inputMode="url"
        autoComplete="url"
        placeholder={placeholder}
        className={`h-12 min-w-0 flex-1 bg-transparent text-base outline-none ${dark ? "text-chalk placeholder:text-chalk/50" : "text-ink placeholder:text-stone"}`}
      />
      <button className="inline-flex h-12 shrink-0 items-center gap-2 rounded-full bg-signal px-5 text-[15px] font-medium text-ink transition-[filter,transform] duration-300 hover:brightness-95 active:scale-[0.98] sm:px-6">
        <span className="hidden sm:inline">{cta}</span>
        <ArrowRight className="size-4" />
      </button>
    </form>
  );
}
