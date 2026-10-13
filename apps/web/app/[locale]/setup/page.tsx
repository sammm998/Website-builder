import Link from "next/link";
import { appOrigin } from "@/lib/hosts";
import { isLocale } from "@/lib/i18n";
import { setupStatus, type SetupStatus } from "@/lib/setup";
import { Logo } from "@/components/ui";
import { AutoRefresh, CopyBlock } from "./live";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

type Row = { ok: boolean | "warn"; title: string; detail: string };

const T = {
  sv: {
    title: "Inställningar",
    lead: "Så här blir Redesign AI redo. Sidan uppdateras automatiskt medan du gör stegen i Railway.",
    ready: "Allt är klart – du kan börja göra om webbplatser.",
    start: "Börja nu",
    notReady: "Några steg återstår innan du kan klistra in din adress.",
    copy: "Kopiera",
    stepDb: "1. Lägg till en databas",
    stepDbText: "I ditt Railway-projekt: + Create → Database → PostgreSQL. Låt den heta Postgres.",
    stepWeb: "2. Webbtjänsten (@redesign/web) → Variables → Raw Editor",
    stepWorker: "3. Workern (@redesign/worker) → Variables → Raw Editor",
    stepWorkerText: "Byt sk-ant-… mot din Anthropic-nyckel (console.anthropic.com → API Keys).",
    after: "Spara. Railway startar om tjänsterna själv och den här sidan blir grön inom ett par minuter.",
    status: "Status",
    database: "Databas",
    dbOk: "Ansluten och uppdaterad",
    dbMissing: "DATABASE_URL saknas på webbtjänsten",
    dbUnreachable: "Kan inte ansluta – kontrollera DATABASE_URL och att Postgres är igång",
    dbMigrating: "Ansluten, tabellerna skapas…",
    web: "Webbtjänstens variabler",
    webOk: "Kompletta",
    worker: "Worker",
    workerRunning: "Igång",
    workerWaiting: "Väntar på variabler: ",
    workerNone: "Har inte hört av sig – lägg in variablerna i steg 3",
    workerStale: "Svarar inte längre – kontrollera workern i Railway",
    recommended: "Rekommenderas (valfritt): ",
  },
  en: {
    title: "Setup",
    lead: "What Redesign AI needs to run. This page refreshes itself while you complete the steps in Railway.",
    ready: "Everything is ready – start redesigning websites.",
    start: "Start now",
    notReady: "A few steps remain before you can paste your address.",
    copy: "Copy",
    stepDb: "1. Add a database",
    stepDbText: "In your Railway project: + Create → Database → PostgreSQL. Keep the name Postgres.",
    stepWeb: "2. Web service (@redesign/web) → Variables → Raw Editor",
    stepWorker: "3. Worker (@redesign/worker) → Variables → Raw Editor",
    stepWorkerText: "Replace sk-ant-… with your Anthropic key (console.anthropic.com → API Keys).",
    after: "Save. Railway restarts the services and this page turns green within a couple of minutes.",
    status: "Status",
    database: "Database",
    dbOk: "Connected and up to date",
    dbMissing: "DATABASE_URL is missing on the web service",
    dbUnreachable: "Cannot connect – check DATABASE_URL and that Postgres is running",
    dbMigrating: "Connected, creating tables…",
    web: "Web service variables",
    webOk: "Complete",
    worker: "Worker",
    workerRunning: "Running",
    workerWaiting: "Waiting for variables: ",
    workerNone: "Has not reported yet – add the variables in step 3",
    workerStale: "No longer responding – check the worker in Railway",
    recommended: "Recommended (optional): ",
  },
};

function rows(s: SetupStatus, t: (typeof T)["sv"]): Row[] {
  const db: Row =
    s.database === "ok"
      ? s.migrations === "missing"
        ? { ok: "warn", title: t.database, detail: t.dbMigrating }
        : { ok: true, title: t.database, detail: t.dbOk }
      : { ok: false, title: t.database, detail: s.database === "missing" ? t.dbMissing : t.dbUnreachable };
  const webMissing = s.missing.filter((m) => !m.startsWith("DATABASE_URL"));
  const web: Row = webMissing.length
    ? { ok: false, title: t.web, detail: webMissing.join(", ") }
    : { ok: s.recommended.length ? "warn" : true, title: t.web, detail: s.recommended.length ? `${t.webOk}. ${t.recommended}${s.recommended.join(", ")}` : t.webOk };
  const latest = s.workers[0];
  const worker: Row = !latest
    ? { ok: false, title: t.worker, detail: t.workerNone }
    : !latest.fresh
      ? { ok: false, title: t.worker, detail: t.workerStale }
      : latest.state === "waiting"
        ? { ok: false, title: t.worker, detail: `${t.workerWaiting}${latest.missing.map((m) => m.split(" ")[0]).join(", ")}` }
        : { ok: true, title: t.worker, detail: t.workerRunning };
  return [db, web, worker];
}

export default async function SetupPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : "sv";
  const t = T[locale];
  const status = await setupStatus();
  const list = rows(status, t);
  const ready = list.every((r) => r.ok !== false);
  const origin = appOrigin();
  const webBlock = "DATABASE_URL=${{Postgres.DATABASE_URL}}";
  const workerBlock = [
    "DATABASE_URL=${{Postgres.DATABASE_URL}}",
    `APP_ORIGIN=${origin}`,
    "ANTHROPIC_API_KEY=sk-ant-…",
    "RAILWAY_DOCKERFILE_PATH=apps/worker/Dockerfile",
  ].join("\n");
  return (
    <main className="container-app max-w-3xl py-12 sm:py-20">
      {ready ? null : <AutoRefresh />}
      <Link href={`/${locale}`}>
        <Logo />
      </Link>
      <h1 className="display mt-12 text-5xl sm:text-6xl">{t.title}</h1>
      <p className="mt-4 max-w-xl text-lg text-stone">{t.lead}</p>

      <section className={`mt-10 rounded-[2rem] p-6 sm:p-8 ${ready ? "bg-signal/40" : "border border-ink/10 bg-chalk"}`}>
        <h2 className="text-sm font-medium uppercase tracking-widest text-stone">{t.status}</h2>
        <ul className="mt-4 grid gap-3">
          {list.map((r) => (
            <li key={r.title} className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className={`mt-1.5 size-2.5 shrink-0 rounded-full ${r.ok === true ? "bg-emerald-500" : r.ok === "warn" ? "bg-amber-400" : "bg-ember"}`}
              />
              <span>
                <span className="font-medium">{r.title}</span>
                <span className="text-stone"> – {r.detail}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-6 font-medium">{ready ? t.ready : t.notReady}</p>
        {ready ? (
          <Link href={`/${locale}/projects/new`} className="mt-4 inline-flex rounded-full bg-ink px-6 py-3 text-chalk">
            {t.start}
          </Link>
        ) : null}
      </section>

      {ready ? null : (
        <section className="mt-12 grid gap-10">
          <div>
            <h2 className="text-xl font-medium">{t.stepDb}</h2>
            <p className="mt-2 text-stone">{t.stepDbText}</p>
          </div>
          <div>
            <h2 className="text-xl font-medium">{t.stepWeb}</h2>
            <CopyBlock text={webBlock} label={t.copy} />
          </div>
          <div>
            <h2 className="text-xl font-medium">{t.stepWorker}</h2>
            <p className="mt-2 text-stone">{t.stepWorkerText}</p>
            <CopyBlock text={workerBlock} label={t.copy} />
          </div>
          <p className="text-stone">{t.after}</p>
        </section>
      )}
    </main>
  );
}
