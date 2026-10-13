import Link from "next/link";
import { aiKeyStatus, hasAdmin, isAdmin } from "@/lib/ai-key";
import { currentUser } from "@/lib/auth";
import { appOrigin } from "@/lib/hosts";
import { isLocale } from "@/lib/i18n";
import { dbMode, setupStatus, type DbMode, type SetupStatus } from "@/lib/setup";
import { Logo } from "@/components/ui";
import { KeyForm } from "./key-form";
import { AutoRefresh, CopyBlock } from "./live";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

type Row = { ok: boolean | "warn"; title: string; detail: string };

const T = {
  sv: {
    title: "Inställningar",
    lead: "Så här blir Redesign AI redo. Sidan uppdateras automatiskt.",
    ready: "Allt är klart – du kan börja göra om webbplatser.",
    start: "Börja nu",
    notReady: "Några steg återstår innan du kan klistra in din adress.",
    copy: "Kopiera",
    stepDb: "1. Lägg till en databas",
    stepDbText: "I ditt Railway-projekt: + Create → Database → PostgreSQL. Låt den heta Postgres.",
    stepWeb: "2. Webbtjänsten (@redesign/web) → Variables → Raw Editor",
    stepWorker: "3. Workern (@redesign/worker) → Variables → Raw Editor",
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
    dbEmbedded: "Inbyggd databas – fungerar, men projekten nollställs när appen deployas om",
    dbEmbeddedVolume: "Inbyggd databas på volym – sparas permanent",
    dbUnavailable: "Ingen databas – Railway har inte byggt appen med Dockerfilen. Lägg till Postgres enligt stegen nedan.",
    workerInside: "Igång inuti webbtjänsten",
    key: "Claude-nyckel",
    keyOk: "Inlagd",
    keyMissing: "Saknas – lägg in din Anthropic-nyckel nedan",
    keyTitle: "Din Anthropic-nyckel",
    keyText: "Skapa en nyckel på console.anthropic.com → API Keys och klistra in den här. Den sparas krypterat och visas aldrig igen.",
    keySaved: "Sparad nyckel slutar på",
    keyPlaceholder: "sk-ant-…",
    keySave: "Spara nyckel",
    keyVerified: "Nyckeln är kontrollerad och sparad. Allt är klart.",
    keyUnverified: "Nyckeln är sparad men kunde inte kontrolleras just nu. Det första jobbet visar om den fungerar.",
    keyLogin: "Skapa ett konto eller logga in för att lägga in nyckeln. Det första kontot blir administratör.",
    keyLoginButton: "Skapa konto / logga in",
    keyNotAdmin: "Bara administratören (det första kontot) kan lägga in nyckeln.",
    volumeTitle: "Valfritt: spara projekten permanent",
    volumeText: "Just nu nollställs databasen när Railway deployar om appen. I Railway: högerklicka på webbtjänsten → Attach volume → Mount path /data. Inget annat behövs.",
  },
  en: {
    title: "Setup",
    lead: "What Redesign AI needs to run. This page refreshes itself.",
    ready: "Everything is ready – start redesigning websites.",
    start: "Start now",
    notReady: "A few steps remain before you can paste your address.",
    copy: "Copy",
    stepDb: "1. Add a database",
    stepDbText: "In your Railway project: + Create → Database → PostgreSQL. Keep the name Postgres.",
    stepWeb: "2. Web service (@redesign/web) → Variables → Raw Editor",
    stepWorker: "3. Worker (@redesign/worker) → Variables → Raw Editor",
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
    dbEmbedded: "Built-in database – works, but projects are reset when the app is redeployed",
    dbEmbeddedVolume: "Built-in database on a volume – kept permanently",
    dbUnavailable: "No database – Railway did not build the app with the Dockerfile. Add Postgres with the steps below.",
    workerInside: "Running inside the web service",
    key: "Claude key",
    keyOk: "Saved",
    keyMissing: "Missing – add your Anthropic key below",
    keyTitle: "Your Anthropic key",
    keyText: "Create a key at console.anthropic.com → API Keys and paste it here. It is stored encrypted and never shown again.",
    keySaved: "Saved key ends with",
    keyPlaceholder: "sk-ant-…",
    keySave: "Save key",
    keyVerified: "The key was checked and saved. Everything is ready.",
    keyUnverified: "The key is saved but could not be checked right now. The first job will show whether it works.",
    keyLogin: "Create an account or log in to add the key. The first account becomes the administrator.",
    keyLoginButton: "Create account / log in",
    keyNotAdmin: "Only the administrator (the first account) can add the key.",
    volumeTitle: "Optional: keep projects permanently",
    volumeText: "Right now the database is reset when Railway redeploys the app. In Railway: right-click the web service → Attach volume → mount path /data. Nothing else is needed.",
  },
};

function rows(s: SetupStatus, mode: DbMode, keyReady: boolean, t: (typeof T)["sv"]): Row[] {
  const embedded = mode === "embedded-volume" || mode === "embedded-ephemeral";
  const db: Row =
    mode === "unavailable"
      ? { ok: false, title: t.database, detail: t.dbUnavailable }
      : s.database !== "ok"
        ? { ok: false, title: t.database, detail: s.database === "missing" ? t.dbMissing : t.dbUnreachable }
        : s.migrations === "missing"
          ? { ok: "warn", title: t.database, detail: t.dbMigrating }
          : mode === "embedded-ephemeral"
            ? { ok: "warn", title: t.database, detail: t.dbEmbedded }
            : { ok: true, title: t.database, detail: mode === "embedded-volume" ? t.dbEmbeddedVolume : t.dbOk };
  const webMissing = s.missing.filter((m) => !m.startsWith("DATABASE_URL"));
  const web: Row = webMissing.length
    ? { ok: false, title: t.web, detail: webMissing.join(", ") }
    : { ok: true, title: t.web, detail: s.recommended.length ? `${t.webOk}. ${t.recommended}${s.recommended.join(", ")}` : t.webOk };
  const latest = s.workers[0];
  const worker: Row = !latest
    ? { ok: false, title: t.worker, detail: t.workerNone }
    : !latest.fresh
      ? { ok: false, title: t.worker, detail: t.workerStale }
      : latest.state === "waiting"
        ? { ok: false, title: t.worker, detail: `${t.workerWaiting}${latest.missing.map((m) => m.split(" ")[0]).join(", ")}` }
        : { ok: true, title: t.worker, detail: embedded ? t.workerInside : t.workerRunning };
  const key: Row = keyReady ? { ok: true, title: t.key, detail: t.keyOk } : { ok: false, title: t.key, detail: t.keyMissing };
  return embedded ? [db, worker, key] : [db, web, worker, key];
}

export default async function SetupPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : "sv";
  const t = T[locale];
  const status = await setupStatus();
  const mode = dbMode();
  const dbOk = status.database === "ok" && status.migrations !== "missing";
  const user = dbOk ? await currentUser().catch(() => null) : null;
  const admin = user ? await isAdmin(user.id).catch(() => false) : false;
  const anyAdmin = dbOk ? await hasAdmin().catch(() => false) : false;
  const workerKey = status.workers.some((w) => w.fresh && w.ai_ready);
  const key = dbOk ? await aiKeyStatus(workerKey).catch(() => ({ source: null, last4: null })) : { source: null, last4: null };
  const keyReady = key.source !== null;
  const list = rows(status, mode, keyReady, t);
  const ready = list.every((r) => r.ok !== false);
  const showRailwaySteps = mode === "external" ? !status.configured || status.database !== "ok" : mode === "unavailable";
  const origin = appOrigin();
  const webBlock = "DATABASE_URL=${{Postgres.DATABASE_URL}}";
  const workerBlock = ["DATABASE_URL=${{Postgres.DATABASE_URL}}", `APP_ORIGIN=${origin}`].join("\n");
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

      {dbOk && (!keyReady || key.source === "app") ? (
        <section className="mt-12">
          <h2 className="text-xl font-medium">{t.keyTitle}</h2>
          <p className="mt-2 text-stone">{t.keyText}</p>
          {key.last4 ? (
            <p className="mt-2 text-sm">
              {t.keySaved} <span className="font-mono">…{key.last4}</span>
            </p>
          ) : null}
          {admin || (user && !anyAdmin) ? (
            <KeyForm labels={{ placeholder: t.keyPlaceholder, save: t.keySave, verified: t.keyVerified, unverified: t.keyUnverified }} />
          ) : user ? (
            <p className="mt-4 text-sm text-ember">{t.keyNotAdmin}</p>
          ) : (
            <div className="mt-4">
              <p className="text-sm text-stone">{t.keyLogin}</p>
              <Link href={`/${locale}/login?next=${encodeURIComponent(`/${locale}/setup`)}`} className="mt-3 inline-flex rounded-full bg-ink px-6 py-3 text-chalk">
                {t.keyLoginButton}
              </Link>
            </div>
          )}
        </section>
      ) : null}

      {mode === "embedded-ephemeral" && dbOk ? (
        <section className="mt-12 rounded-[2rem] border border-ink/10 p-6 sm:p-8">
          <h2 className="text-lg font-medium">{t.volumeTitle}</h2>
          <p className="mt-2 text-stone">{t.volumeText}</p>
        </section>
      ) : null}

      {showRailwaySteps ? (
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
            <CopyBlock text={workerBlock} label={t.copy} />
          </div>
          <p className="text-stone">{t.after}</p>
        </section>
      ) : null}
    </main>
  );
}
