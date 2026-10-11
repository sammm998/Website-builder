import clsx from "clsx";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "signal" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-ink text-chalk hover:bg-ink-3",
  secondary: "border border-ink/15 bg-chalk text-ink hover:border-ink/40",
  ghost: "text-ink hover:bg-ink/5",
  signal: "bg-signal text-ink hover:brightness-95",
  danger: "text-ember hover:bg-ember/10",
};

export function buttonClass(variant: Variant = "primary", size: "sm" | "md" | "lg" = "md", extra?: string) {
  return clsx(
    "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-[background,border,filter,transform] duration-300 ease-expo active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40",
    size === "sm" && "h-9 px-4 text-sm",
    size === "md" && "h-11 px-5 text-[15px]",
    size === "lg" && "h-14 px-7 text-base",
    variants[variant],
    extra,
  );
}

export function Button({ variant = "primary", size = "md", className, ...props }: ComponentProps<"button"> & { variant?: Variant; size?: "sm" | "md" | "lg" }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({ variant = "primary", size = "md", className, ...props }: ComponentProps<typeof Link> & { variant?: Variant; size?: "sm" | "md" | "lg" }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={clsx(
        "h-12 w-full rounded-2xl border border-ink/15 bg-chalk px-4 text-[15px] outline-none transition placeholder:text-stone focus:border-ink/50 focus:ring-4 focus:ring-ink/5",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={clsx("w-full rounded-2xl border border-ink/15 bg-chalk p-4 text-[15px] outline-none transition focus:border-ink/50 focus:ring-4 focus:ring-ink/5", className)} {...props} />;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint ? <span className="text-xs text-stone">{hint}</span> : null}
    </label>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "good" | "warn" | "bad" | "info"; children: ReactNode }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        tone === "neutral" && "bg-ink/5 text-ink/70",
        tone === "good" && "bg-emerald-600/10 text-emerald-800",
        tone === "warn" && "bg-amber-500/15 text-amber-800",
        tone === "bad" && "bg-ember/12 text-ember",
        tone === "info" && "bg-cobalt/10 text-cobalt",
      )}
    >
      {children}
    </span>
  );
}

export function Logo({ dark = false, className }: { dark?: boolean; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-2.5 font-medium tracking-tight", className)}>
      <svg viewBox="0 0 64 64" className="size-7" aria-hidden="true">
        <rect width="64" height="64" rx="16" fill={dark ? "#d4ff3a" : "#0f0f0d"} />
        <path d="M18 46V18h15.5c6.4 0 10.5 3.6 10.5 9.1 0 4.2-2.4 7.2-6.3 8.4L46 46h-8.2l-7.1-10H25.6v10H18zm7.6-16h7.3c2.6 0 4-1.2 4-3.3s-1.4-3.3-4-3.3h-7.3V30z" fill={dark ? "#0f0f0d" : "#d4ff3a"} />
      </svg>
      <span className="text-[17px]">Redesign AI</span>
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={clsx("inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent", className)} aria-hidden="true" />;
}
