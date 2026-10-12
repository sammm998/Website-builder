import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

/** supabase/migrations at the repository root (override with MIGRATIONS_DIR). */
export function migrationsDir(): string {
  return process.env["MIGRATIONS_DIR"] ?? fileURLToPath(new URL("../../../supabase/migrations", import.meta.url));
}

/**
 * Files that existed before this runner. A database created by applying them directly (Supabase CLI, the old
 * local scripts) is recognised by its tables and baselined instead of re-running them.
 */
const BASELINE = ["20261011000000_platform.sql", "20261011000001_core.sql", "20261011000002_storage_realtime.sql"];

/** Arbitrary but fixed key so concurrent deploys (web pre-deploy + worker start) serialise. */
const LOCK_KEY = 72_610_110;

export interface MigrateResult {
  applied: string[];
  baselined: string[];
}

/** Applies pending migrations in order, each in its own transaction, under an advisory lock. */
export async function migrate(databaseUrl: string, opts: { dir?: string; log?: (msg: string) => void } = {}): Promise<MigrateResult> {
  const dir = opts.dir ?? migrationsDir();
  const log = opts.log ?? (() => {});
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  // One connection: the advisory lock is held by the session.
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {}, connect_timeout: 30 });
  const result: MigrateResult = { applied: [], baselined: [] };
  try {
    await sql`select pg_advisory_lock(${LOCK_KEY})`;
    await sql`create table if not exists public._migrations (name text primary key, applied_at timestamptz not null default now())`;
    const done = new Set((await sql<{ name: string }[]>`select name from public._migrations`).map((r) => r.name));
    if (done.size === 0) {
      const [row] = await sql<{ exists: boolean }[]>`select to_regclass('public.projects') is not null as exists`;
      if (row?.exists) {
        for (const name of BASELINE.filter((f) => files.includes(f))) {
          await sql`insert into public._migrations (name) values (${name}) on conflict do nothing`;
          done.add(name);
          result.baselined.push(name);
        }
        log(`baselined existing schema (${result.baselined.length} migrations)`);
      }
    }
    for (const name of files) {
      if (done.has(name)) continue;
      const body = readFileSync(join(dir, name), "utf8");
      log(`applying ${name}`);
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`insert into public._migrations (name) values (${name})`;
      });
      result.applied.push(name);
    }
    return result;
  } finally {
    await sql`select pg_advisory_unlock(${LOCK_KEY})`.catch(() => {});
    await sql.end({ timeout: 5 });
  }
}
