"use client";

import { useMemo, useState } from "react";
import { Copy, ExternalLink, Globe, RefreshCw, Trash2 } from "lucide-react";
import clsx from "clsx";
import { addDomainAction, publishAction, rebuildAction, removeDomainAction, unpublishAction, verifyDomainAction, type ActionResult } from "@/app/actions";
import type { Dict } from "@/lib/i18n";
import type { WizardState } from "@/lib/repo";
import { Badge, Button, Input, Spinner } from "../ui";
import { DeviceFrame } from "./device-frame";

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "min-sajt";

export function SiteStep({ state, t, act }: { state: WizardState; t: Dict["wizard"]; act: (fn: () => Promise<ActionResult>, onOk?: (r: ActionResult) => void) => void }) {
  const build = state.build;
  const defaultLang = state.project.source_language ?? "sv";
  const [current, setCurrent] = useState<{ path: string; lang: string }>({ path: "/", lang: defaultLang });
  const [slug, setSlug] = useState(state.site?.slug ?? state.suggestedSlug);
  const [domain, setDomain] = useState("");
  const [copied, setCopied] = useState(false);
  const languages = useMemo(() => [...new Set(build?.pages.map((p) => p.lang) ?? [])].sort((a, b) => Number(b === defaultLang) - Number(a === defaultLang)), [build, defaultLang]);
  const complete = build?.status === "complete";
  const publishing = state.jobs.publish?.status === "queued" || state.jobs.publish?.status === "running";

  if (!build || !complete) {
    return (
      <div className="grid h-full place-items-center">
        <div className="max-w-md text-center">
          <h2 className="display text-5xl">{t.site.title}</h2>
          <p className="mt-3 text-stone">{t.site.lead}</p>
          <Spinner className="mt-8 size-6" />
        </div>
      </div>
    );
  }
  const localized = current.lang === defaultLang ? current.path : `/${current.lang}${current.path === "/" ? "" : current.path}`;
  const previewSrc = `/preview/build/${build.id}${localized === "/" ? "" : localized}`;
  const qaTone = (s: string) => (s === "passed" ? "good" : s === "warning" ? "warn" : s === "failed" ? "bad" : "neutral");

  return (
    <div className="grid h-full min-h-0 gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
      <aside className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-5 overflow-y-auto pr-1">
        <div>
          <h2 className="display text-5xl">{t.site.title}</h2>
          <p className="mt-2 text-sm text-stone">{t.site.lead}</p>
        </div>
        {languages.length > 1 ? (
          <div className="flex gap-1 rounded-full bg-ink/5 p-1" role="tablist">
            {languages.map((l) => (
              <button key={l} role="tab" aria-selected={current.lang === l} onClick={() => setCurrent({ ...current, lang: l })} className={clsx("flex-1 rounded-full px-3 py-1.5 text-sm uppercase", current.lang === l ? "bg-chalk shadow-sm" : "text-stone")}>
                {l}
              </button>
            ))}
          </div>
        ) : null}
        <ul className="grid gap-1" aria-label={t.site.pagesTitle}>
          {build.pages.filter((p) => p.lang === current.lang).map((p) => (
            <li key={p.id}>
              <button onClick={() => setCurrent({ path: p.path, lang: p.lang })} className={clsx("flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left text-sm transition", current.path === p.path ? "bg-ink text-chalk" : "hover:bg-ink/5")}>
                <span className="min-w-0 truncate">{p.title || p.path}</span>
                <Badge tone={qaTone(p.qa_status)}>{t.site.qa[p.qa_status as keyof typeof t.site.qa] ?? p.qa_status}</Badge>
              </button>
            </li>
          ))}
        </ul>

        <section className="grid gap-3 rounded-3xl border border-ink/10 bg-chalk p-5">
          <h3 className="font-medium">{state.site ? t.site.published : t.site.publish}</h3>
          <label className="grid gap-1.5 text-sm">
            <span className="text-stone">{t.site.address}</span>
            <Input value={slug} onChange={(e) => setSlug(slugify(e.target.value))} aria-label={t.site.address} className="h-11 font-mono text-sm" />
          </label>
          <Button onClick={() => act(() => publishAction(state.project.id, slug))} disabled={publishing}>
            {publishing ? <Spinner /> : null} {state.site ? t.site.republish : t.site.publish}
          </Button>
          {state.site ? (
            <div className="grid gap-2 text-sm">
              <a href={state.site.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 break-all font-mono text-xs underline-offset-4 hover:underline">
                {state.site.url} <ExternalLink className="size-3.5 shrink-0" />
              </a>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => { void navigator.clipboard.writeText(state.site!.url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
                  <Copy className="size-3.5" /> {copied ? t.site.copied : t.site.copy}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => act(() => unpublishAction(state.project.id))}>{t.site.unpublish}</Button>
              </div>
            </div>
          ) : null}
        </section>

        {state.site ? (
          <section className="grid gap-3 rounded-3xl border border-ink/10 bg-chalk p-5">
            <h3 className="inline-flex items-center gap-2 font-medium"><Globe className="size-4" /> {t.site.domain}</h3>
            <p className="text-xs text-stone">{t.site.domainHint}</p>
            {state.domains.map((d) => (
              <div key={d.id} className="grid gap-2 rounded-2xl bg-bone/50 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-xs">{d.hostname}</span>
                  <Badge tone={d.status === "verified" ? "good" : "warn"}>{d.status === "verified" ? t.site.verified : t.site.pending}</Badge>
                </div>
                {d.status !== "verified" ? (
                  <table className="text-xs">
                    <tbody>
                      {((d.verification as { type: string; name: string; value: string }[]) ?? []).map((r, i) => (
                        <tr key={i}><td className="pr-2 font-medium">{r.type}</td><td className="pr-2 font-mono">{r.name}</td><td className="break-all font-mono">{r.value}</td></tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}
                <div className="flex gap-2">
                  {d.status !== "verified" ? <Button size="sm" variant="secondary" onClick={() => act(() => verifyDomainAction(d.id))}><RefreshCw className="size-3.5" /> {t.site.verify}</Button> : null}
                  <Button size="sm" variant="ghost" onClick={() => act(() => removeDomainAction(d.id))}><Trash2 className="size-3.5" /> {t.site.remove}</Button>
                </div>
              </div>
            ))}
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); act(() => addDomainAction(state.project.id, domain), () => setDomain("")); }}>
              <Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="www.dinsajt.se" className="h-10 text-sm" aria-label={t.site.domain} />
              <Button size="sm" type="submit" disabled={!domain.trim()}>{t.site.addDomain}</Button>
            </form>
          </section>
        ) : null}
        <Button variant="ghost" size="sm" className="justify-self-start" onClick={() => act(() => rebuildAction(state.project.id))}>
          <RefreshCw className="size-3.5" /> {t.site.rebuild}
        </Button>
      </aside>
      <DeviceFrame src={previewSrc} title={current.path} labels={{ desktop: "Desktop", mobile: "Mobil" }} className="min-h-[60dvh] lg:min-h-0" />
    </div>
  );
}
