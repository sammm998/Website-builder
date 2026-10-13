import postgres from "postgres";
import { configProblems, configRecommendations, resolvedDrivers } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Deployment diagnostics: which variables are missing (names only, never values), whether the database
 * is reachable and migrated. 200 when the app can serve signed-in users, otherwise 503.
 */
export async function GET(req: Request) {
  // Liveness for the platform's deploy healthcheck: the server is up, configuration is reported below.
  if (new URL(req.url).searchParams.has("live")) return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  const missing = configProblems();
  const { auth, storage } = resolvedDrivers();
  let database: "ok" | "missing" | "unreachable" = "missing";
  let migrations: { applied: number; latest: string | null } | "missing" | null = null;
  const url = process.env["DATABASE_URL"];
  if (url) {
    const db = postgres(url, { max: 1, connect_timeout: 5, idle_timeout: 1, onnotice: () => {} });
    try {
      await db`select 1`;
      database = "ok";
      const [row] = await db<{ exists: boolean }[]>`select to_regclass('public._migrations') is not null as exists`;
      if (row?.exists) {
        const [m] = await db<{ applied: number; latest: string | null }[]>`select count(*)::int as applied, max(name) as latest from public._migrations`;
        migrations = m ?? null;
      } else {
        migrations = "missing";
      }
    } catch (error) {
      database = "unreachable";
      console.error("health: database check failed", (error as Error).message);
    } finally {
      await db.end({ timeout: 1 }).catch(() => {});
    }
  }
  const ok = missing.length === 0 && database === "ok" && migrations !== "missing";
  return Response.json(
    { ok, database, migrations, auth, storage, missing, recommended: configRecommendations(), docs: "docs/railway.md" },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
