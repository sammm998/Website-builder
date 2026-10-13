"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Re-checks the status every few seconds while the page is open (Railway redeploys take a minute). */
export function AutoRefresh({ seconds = 8 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}

export function CopyBlock({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative mt-3">
      <pre className="overflow-x-auto rounded-2xl bg-ink p-4 pr-24 font-mono text-[13px] leading-relaxed text-chalk">{text}</pre>
      <button
        type="button"
        className="absolute right-3 top-3 rounded-full bg-chalk/15 px-3 py-1.5 text-xs text-chalk hover:bg-chalk/25"
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? "✓" : label}
      </button>
    </div>
  );
}
