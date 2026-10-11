import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, chownSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";

const ROOT = new URL("../../../", import.meta.url).pathname;

function pgBin(): string {
  const dirs = readdirSync("/usr/lib/postgresql").sort();
  return `/usr/lib/postgresql/${dirs.at(-1)}/bin`;
}

/** Throwaway Postgres cluster with the Supabase auth stub and all migrations applied. */
export async function startDatabase() {
  const dir = mkdtempSync(join(tmpdir(), "redesign-pg-"));
  const port = 55000 + Math.floor(Math.random() * 2000);
  const asRoot = process.getuid?.() === 0;
  const run = (bin: string, args: string[]) =>
    asRoot ? execFileSync("runuser", ["-u", "postgres", "--", join(pgBin(), bin), ...args], { stdio: "pipe" }) : execFileSync(join(pgBin(), bin), args, { stdio: "pipe" });
  if (asRoot) execFileSync("chown", ["-R", "postgres", dir]);
  run("initdb", ["-D", join(dir, "data"), "-U", "postgres", "-A", "trust"]);
  const server = asRoot
    ? spawn("runuser", ["-u", "postgres", "--", join(pgBin(), "postgres"), "-D", join(dir, "data"), "-p", String(port), "-k", dir, "-c", "listen_addresses=127.0.0.1"], { stdio: "ignore" })
    : spawn(join(pgBin(), "postgres"), ["-D", join(dir, "data"), "-p", String(port), "-k", dir, "-c", "listen_addresses=127.0.0.1"], { stdio: "ignore" });
  const url = `postgres://postgres@127.0.0.1:${port}/postgres`;
  for (let i = 0; i < 50; i++) {
    try {
      const probe = postgres(url, { max: 1, connect_timeout: 1, onnotice: () => {} });
      await probe`select 1`;
      await probe.end();
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  const admin = postgres(url, { max: 1, onnotice: () => {} });
  await admin.unsafe(readFileSync(join(ROOT, "supabase/tests/stub.sql"), "utf8"));
  for (const f of readdirSync(join(ROOT, "supabase/migrations")).sort()) {
    await admin.unsafe(readFileSync(join(ROOT, "supabase/migrations", f), "utf8"));
  }
  await admin.end();
  void chownSync;
  return {
    url,
    stop: async () => {
      server.kill("SIGINT");
      await new Promise((r) => setTimeout(r, 300));
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
