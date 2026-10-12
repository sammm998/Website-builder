import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, migrationsDir } from "../src/index";

const pgBin = () => `/usr/lib/postgresql/${readdirSync("/usr/lib/postgresql").sort().at(-1)}/bin`;
let dir: string;
let server: ChildProcess;
let base: string;

async function waitFor(url: string) {
  for (let i = 0; i < 50; i++) {
    try {
      const probe = postgres(url, { max: 1, connect_timeout: 1, onnotice: () => {} });
      await probe`select 1`;
      await probe.end();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error("postgres did not start");
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "redesign-migrate-"));
  const port = 57000 + Math.floor(Math.random() * 2000);
  const asRoot = process.getuid?.() === 0;
  const wrap = (bin: string, args: string[]): [string, string[]] => (asRoot ? ["runuser", ["-u", "postgres", "--", join(pgBin(), bin), ...args]] : [join(pgBin(), bin), args]);
  if (asRoot) execFileSync("chown", ["-R", "postgres", dir]);
  execFileSync(...wrap("initdb", ["-D", join(dir, "data"), "-U", "postgres", "-A", "trust"]), { stdio: "pipe" });
  server = spawn(...wrap("postgres", ["-D", join(dir, "data"), "-p", String(port), "-k", dir, "-c", "listen_addresses=127.0.0.1"]), { stdio: "ignore" });
  base = `postgres://postgres@127.0.0.1:${port}`;
  await waitFor(`${base}/postgres`);
}, 60_000);

afterAll(async () => {
  server?.kill("SIGINT");
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dir, { recursive: true, force: true });
});

async function freshDb(name: string) {
  const admin = postgres(`${base}/postgres`, { max: 1, onnotice: () => {} });
  await admin.unsafe(`create database ${name}`);
  await admin.end();
  return `${base}/${name}`;
}

describe("migrate", () => {
  it("builds the full schema on a plain Postgres and is idempotent", async () => {
    const url = await freshDb("plain");
    const all = readdirSync(migrationsDir()).filter((f) => f.endsWith(".sql")).sort();
    expect((await migrate(url)).applied).toEqual(all);
    expect((await migrate(url)).applied).toEqual([]);
    const sql = postgres(url, { max: 1, onnotice: () => {} });
    const [row] = await sql<{ users: string | null; creds: string | null; projects: string | null }[]>`
      select to_regclass('auth.users')::text as users, to_regclass('public.user_credentials')::text as creds, to_regclass('public.projects')::text as projects`;
    expect(row).toEqual({ users: "auth.users", creds: "user_credentials", projects: "projects" });
    // Signing up creates the profile through the trigger from the core migration.
    const [u] = await sql<{ id: string }[]>`insert into auth.users (email) values ('x@example.com') returning id`;
    expect((await sql`select 1 from profiles where id = ${u!.id}`).length).toBe(1);
    await sql.end();
  }, 60_000);

  it("serialises concurrent runs", async () => {
    const url = await freshDb("concurrent");
    const [a, b] = await Promise.all([migrate(url), migrate(url)]);
    expect(a.applied.length + b.applied.length).toBe(readdirSync(migrationsDir()).filter((f) => f.endsWith(".sql")).length);
  }, 60_000);

  it("baselines a database created without the runner", async () => {
    const url = await freshDb("legacy");
    const sql = postgres(url, { max: 1, onnotice: () => {} });
    for (const f of ["20261011000000_platform.sql", "20261011000001_core.sql", "20261011000002_storage_realtime.sql"]) {
      await sql.file(join(migrationsDir(), f));
    }
    await sql.end();
    const r = await migrate(url);
    expect(r.baselined).toHaveLength(3);
    expect(r.applied).toEqual(["20261011000003_password_auth.sql"]);
  }, 60_000);
});
