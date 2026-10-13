#!/usr/bin/env node
/**
 * Production entry point for both Railway services (and `pnpm start` in apps/web and apps/worker).
 *
 *   node scripts/launch.mjs [web|worker]
 *
 * With DATABASE_URL: web = migrations (soft) + `next start`; worker = the job worker.
 *
 * Without DATABASE_URL ("all-in-one"): the web role starts its own Postgres (data in $DATA_DIR, a Railway
 * volume when one is attached, else an ephemeral directory), runs the migrations, then serves the app and
 * runs the worker as a child process. The worker role only answers health checks, because the web
 * service already runs the worker. Nothing has to be configured on the platform.
 *
 * Plain Node, no dependencies: it must run before anything else is known to work.
 */
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, chownSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = join(ROOT, "apps/web");
const WORKER = join(ROOT, "apps/worker");
const env = { ...process.env };
const role = process.argv[2] ?? (/worker/i.test(env.RAILWAY_SERVICE_NAME ?? "") ? "worker" : "web");
const log = (msg) => console.log(`[launch] ${msg}`);

const children = new Set();
let stopping = false;

function run(cmd, args, opts = {}) {
  const child = spawn(cmd, args, { stdio: "inherit", env, ...opts });
  children.add(child);
  child.on("exit", () => children.delete(child));
  return child;
}

function runToEnd(cmd, args, opts = {}) {
  return new Promise((resolve) => run(cmd, args, opts).on("exit", (code) => resolve(code ?? 1)));
}

async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  log("stopping");
  const db = [...children].find((c) => c.isPostgres);
  for (const c of children) if (c !== db) c.kill("SIGTERM");
  // Give the app and the worker a moment, then stop Postgres last (SIGINT = fast shutdown).
  await waitFor(() => [...children].every((c) => c === db), 10_000);
  if (db) {
    db.kill("SIGINT");
    await waitFor(() => !children.has(db), 15_000);
  }
  process.exit(code);
}
process.on("SIGTERM", () => void shutdown(0));
process.on("SIGINT", () => void shutdown(0));

async function waitFor(check, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

const bin = (dir, name) => join(dir, "node_modules/.bin", name);
const migrate = (soft) => runToEnd(bin(join(ROOT, "packages/migrate"), "tsx"), ["src/cli.ts", ...(soft ? ["--soft"] : [])], { cwd: join(ROOT, "packages/migrate") });

function startWeb() {
  const web = run(bin(WEB, "next"), ["start"], { cwd: WEB });
  web.on("exit", (code) => {
    if (!stopping) {
      log(`web exited (${code}); stopping so the platform restarts the service`);
      void shutdown(code || 1);
    }
  });
}

function startWorker(extraEnv = {}) {
  const worker = run(bin(WORKER, "tsx"), ["src/start.ts"], { cwd: WORKER, env: { ...env, ...extraEnv } });
  worker.on("exit", (code) => {
    if (stopping) return;
    // Restarting the process never re-runs billed work: interrupted AI steps are paused, not retried.
    log(`worker exited (${code}); restarting in 5 s`);
    setTimeout(() => !stopping && startWorker(extraEnv), 5_000);
  });
}

// --- worker role --------------------------------------------------------------------------------

if (role === "worker") {
  if (env.DATABASE_URL) {
    startWorker();
  } else {
    const port = Number(env.PORT || 8080);
    createServer((req, res) => {
      res.writeHead(req.url === "/health" ? 200 : 404, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, mode: "all-in-one", note: "The worker runs inside the web service." }));
    }).listen(port);
    log("all-in-one mode: the worker runs inside the web service, so this service has nothing to do (it can be removed).");
  }
} else {
  await startWebRole();
}

// --- web role -----------------------------------------------------------------------------------

async function startWebRole() {
  if (env.DATABASE_URL) {
    await migrate(true);
    startWeb();
    return;
  }
  const pg = postgresBin();
  if (!pg) {
    log("no DATABASE_URL and no Postgres binaries in this image; starting without a database (see /sv/setup).");
    env.REDESIGN_DB_MODE = "unavailable";
    startWeb();
    return;
  }
  const volume = env.DATA_DIR || (env.RAILWAY_VOLUME_MOUNT_PATH ? join(env.RAILWAY_VOLUME_MOUNT_PATH, "redesign") : "");
  const dataDir = volume || join(ROOT, ".data");
  env.REDESIGN_DB_MODE = volume ? "embedded-volume" : "embedded-ephemeral";
  const port = Number(env.EMBEDDED_PG_PORT || 5432);
  await startPostgres(pg, dataDir, port);
  env.DATABASE_URL = `postgres://postgres@127.0.0.1:${port}/postgres`;
  env.SESSION_SECRET ||= sessionSecret(dataDir);
  env.STORAGE_DRIVER ||= "db";
  env.APP_ORIGIN ||= env.RAILWAY_PUBLIC_DOMAIN ? `https://${env.RAILWAY_PUBLIC_DOMAIN}` : `http://localhost:${env.PORT || 3000}`;
  log(`all-in-one mode: database in ${dataDir} (${volume ? "persistent volume" : "ephemeral: reset on redeploy"})`);
  if ((await migrate(false)) !== 0) {
    log("migrations failed");
    return shutdown(1);
  }
  startWeb();
  startWorker({ WORKER_PORT: env.EMBEDDED_WORKER_PORT || "8091", SKIP_MIGRATIONS: "1" });
}

function postgresBin() {
  try {
    const dir = execFileSync("pg_config", ["--bindir"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    if (existsSync(join(dir, "initdb"))) return dir;
  } catch {
    /* fall through */
  }
  const base = "/usr/lib/postgresql";
  if (!existsSync(base)) return null;
  const versions = readdirSync(base).sort((a, b) => Number(b) - Number(a));
  for (const v of versions) if (existsSync(join(base, v, "bin/initdb"))) return join(base, v, "bin");
  return null;
}

/** Postgres refuses to run as root: when we are root, run it as the `postgres` user. */
function postgresUser() {
  if (process.getuid?.() !== 0) return {};
  const uid = Number(execFileSync("id", ["-u", "postgres"], { encoding: "utf8" }).trim());
  const gid = Number(execFileSync("id", ["-g", "postgres"], { encoding: "utf8" }).trim());
  return { uid, gid };
}

async function startPostgres(pgBin, dataDir, port) {
  const pgData = join(dataDir, "pg");
  const sockets = join(dataDir, "run");
  const user = postgresUser();
  for (const dir of [dataDir, pgData, sockets]) {
    mkdirSync(dir, { recursive: true });
    if (user.uid !== undefined) chownSync(dir, user.uid, user.gid);
  }
  chmodSync(pgData, 0o700);
  if (!existsSync(join(pgData, "PG_VERSION"))) {
    log("initialising database");
    execFileSync(join(pgBin, "initdb"), ["-D", pgData, "-U", "postgres", "-A", "trust", "-E", "UTF8", "--no-locale"], { stdio: "inherit", ...user });
  }
  const db = run(
    join(pgBin, "postgres"),
    ["-D", pgData, "-p", String(port), "-k", sockets, "-c", "listen_addresses=127.0.0.1", "-c", "max_connections=60", "-c", "shared_buffers=64MB"],
    user,
  );
  db.isPostgres = true;
  db.on("exit", (code) => {
    if (!stopping) {
      log(`database exited (${code})`);
      void shutdown(1);
    }
  });
  const ready = await waitFor(() => {
    try {
      execFileSync(join(pgBin, "pg_isready"), ["-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-q"], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }, 60_000);
  if (!ready) {
    log("database did not start");
    await shutdown(1);
  }
}

/** Random per-installation secret for session cookies and encrypted settings, kept next to the data. */
function sessionSecret(dataDir) {
  const file = join(dataDir, "secret");
  if (existsSync(file)) return readFileSync(file, "utf8").trim();
  const secret = randomBytes(48).toString("base64url");
  writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}
