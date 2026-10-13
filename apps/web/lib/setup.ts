import "server-only";
import postgres from "postgres";
import { configProblems, configRecommendations, resolvedDrivers } from "./env";

/**
 * Deployment status for /api/health and the setup page: missing variables (names only), database,
 * migrations and worker heartbeats. Never throws, so it works before anything is configured.
 */
export interface WorkerHeartbeat {
  id: string;
  state: "running" | "waiting";
  missing: string[];
  ai_ready: boolean;
  seen_at: string;
  fresh: boolean;
}

/** How the database is provided: by the platform (DATABASE_URL) or by the all-in-one launcher. */
export type DbMode = "external" | "embedded-volume" | "embedded-ephemeral" | "unavailable";
export function dbMode(): DbMode {
  const mode = process.env["REDESIGN_DB_MODE"];
  return mode === "embedded-volume" || mode === "embedded-ephemeral" || mode === "unavailable" ? mode : "external";
}

export interface SetupStatus {
  ok: boolean;
  configured: boolean;
  database: "ok" | "missing" | "unreachable";
  migrations: { applied: number; latest: string | null } | "missing" | null;
  missing: string[];
  recommended: string[];
  auth: string | undefined;
  storage: string | undefined;
  workers: WorkerHeartbeat[];
}

/** A worker that has not reported for this long is considered stopped. */
export const WORKER_STALE_SECONDS = 90;

/** Configuration needed by the web app itself is present (database etc.); pages may use env(). */
export function isConfigured(): boolean {
  return configProblems().length === 0;
}

export async function setupStatus(): Promise<SetupStatus> {
  const missing = configProblems();
  const { auth, storage } = resolvedDrivers();
  let database: SetupStatus["database"] = "missing";
  let migrations: SetupStatus["migrations"] = null;
  let workers: WorkerHeartbeat[] = [];
  const url = process.env["DATABASE_URL"];
  if (url) {
    const db = postgres(url, { max: 1, connect_timeout: 5, idle_timeout: 1, onnotice: () => {} });
    try {
      await db`select 1`;
      database = "ok";
      const [row] = await db<{ migrations: boolean; workers: boolean }[]>`
        select to_regclass('public._migrations') is not null as migrations, to_regclass('public.worker_status') is not null as workers`;
      if (row?.migrations) {
        const [m] = await db<{ applied: number; latest: string | null }[]>`select count(*)::int as applied, max(name) as latest from public._migrations`;
        migrations = m ?? null;
      } else {
        migrations = "missing";
      }
      if (row?.workers) {
        // Caught on its own: an older schema (before ai_ready) must not make the database look unreachable.
        workers = await db<WorkerHeartbeat[]>`
          select id, state, missing, coalesce(ai_ready, false) as ai_ready, seen_at::text,
            seen_at > now() - make_interval(secs => ${WORKER_STALE_SECONDS}) as fresh
          from public.worker_status where seen_at > now() - interval '1 day' order by seen_at desc limit 5`.catch(() => []);
      }
    } catch (error) {
      database = "unreachable";
      console.error("setup: database check failed", (error as Error).message);
    } finally {
      await db.end({ timeout: 1 }).catch(() => {});
    }
  }
  const configured = missing.length === 0;
  return {
    ok: configured && database === "ok" && migrations !== "missing",
    configured,
    database,
    migrations,
    missing,
    recommended: configRecommendations(),
    auth,
    storage,
    workers,
  };
}
