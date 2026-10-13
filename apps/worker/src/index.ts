import { createServer } from "node:http";
import { hostname } from "node:os";
import { setGlobalDispatcher, EnvHttpProxyAgent } from "undici";
import { chromium, type Browser } from "playwright";
import { AiError, AnthropicProvider, FakeProvider } from "@redesign/ai";
import { connect, type Sql } from "./db";
import { ConfigError, loadEnv, type Env } from "./env";
import { bindStorage, createStorage } from "./storage";
import { claimJob, completeJob, heartbeat, pauseJob, recoverStaleJobs } from "./queue";
import { JobCancelled, JobContext, type JobRow, type Services } from "./context";
import { runCrawl } from "./jobs/crawl";
import { runAnalyze } from "./jobs/analyze";
import { runDirection, runDirections } from "./jobs/directions";
import { runBuild } from "./jobs/build";
import { runPublish } from "./jobs/publish";

const HANDLERS: Record<JobRow["kind"], (ctx: JobContext) => Promise<void>> = {
  crawl: runCrawl,
  analyze: runAnalyze,
  directions: runDirections,
  direction: runDirection,
  build: runBuild,
  publish: runPublish,
};

export function createServices(env: Env): Services & { close: () => Promise<void> } {
  let browser: Promise<Browser> | null = null;
  const sql = connect(env.DATABASE_URL);
  const storage = createStorage(env, sql);
  bindStorage(env, storage);
  return {
    sql,
    env,
    storage,
    ai: env.AI_PROVIDER === "fake" ? new FakeProvider() : new AnthropicProvider(),
    browser: () => {
      browser ??= chromium.launch({ executablePath: env.CHROMIUM_PATH, args: ["--disable-dev-shm-usage", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
      return browser;
    },
    close: async () => {
      await (await browser)?.close().catch(() => {});
      await sql.end({ timeout: 5 });
    },
  };
}

/** Runs one job to completion or pause. Exported for tests. */
export async function processJob(services: Services, job: JobRow): Promise<void> {
  const ctx = new JobContext(job, services);
  const beat = setInterval(() => void heartbeat(services.sql, job.id).catch(() => {}), 30_000);
  try {
    await HANDLERS[job.kind](ctx);
    await completeJob(services.sql, job.id);
  } catch (error) {
    if (error instanceof JobCancelled) return;
    const message = error instanceof AiError ? error.message : `${(error as Error).message}`;
    console.error(`[job ${job.id} ${job.kind}]`, error);
    await pauseJob(services.sql, job.id, message);
    if (job.kind === "crawl" || job.kind === "build") {
      await services.sql`update projects set status = ${`${job.kind}-paused`} where id = ${job.project_id}`;
    }
  } finally {
    clearInterval(beat);
  }
}

/** Claims and processes jobs until `stop` resolves true. */
export async function runLoop(services: Services, opts: { concurrency: number; once?: boolean; signal?: AbortSignal }) {
  const active = new Set<Promise<void>>();
  let lastRecovery = 0;
  while (!opts.signal?.aborted) {
    if (Date.now() - lastRecovery > 60_000) {
      lastRecovery = Date.now();
      await recoverStaleJobs(services.sql).catch((e) => console.error("recovery failed", e));
    }
    if (active.size < opts.concurrency) {
      const job = await claimJob(services.sql).catch((e) => (console.error("claim failed", e), null));
      if (job) {
        const p = processJob(services, job).finally(() => active.delete(p));
        active.add(p);
        continue;
      }
      if (opts.once && active.size === 0) break;
    }
    await new Promise((r) => setTimeout(r, active.size ? 250 : 1000));
  }
  await Promise.all(active);
}

export async function main() {
  let env: Env;
  try {
    env = loadEnv();
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    // Missing configuration is not a crash: stay up (no restart loop) and say exactly what is missing.
    return waitForConfig(error.problems);
  }
  // Respect HTTP(S)_PROXY for outbound API calls when configured.
  if (process.env["HTTPS_PROXY"] || process.env["HTTP_PROXY"]) setGlobalDispatcher(new EnvHttpProxyAgent());
  const services = createServices(env);
  const controller = new AbortController();
  const server = healthServer(env.WORKER_PORT, () => ({ ok: true }));
  const shutdown = async () => {
    controller.abort();
    server.close();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  console.log(`[worker] started (concurrency ${env.WORKER_CONCURRENCY}, ai ${env.AI_PROVIDER}, storage ${env.STORAGE_DRIVER})`);
  const beat = startHeartbeat(services.sql, "running", []);
  await runLoop(services, { concurrency: env.WORKER_CONCURRENCY, signal: controller.signal });
  clearInterval(beat);
  await services.close();
}

function healthServer(port: number, body: () => object) {
  return createServer((req, res) => {
    if (req.url === "/health") return void res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(body()));
    res.writeHead(404).end();
  }).listen(port);
}

/** Tells the web app (setup page, wizard) that this worker is alive and whether it is waiting for configuration. */
function startHeartbeat(sql: Sql, state: "running" | "waiting", missing: string[]) {
  const id = process.env["RAILWAY_REPLICA_ID"] || hostname();
  const write = () =>
    void sql`
      insert into worker_status (id, state, missing, seen_at) values (${id}, ${state}, ${missing}, now())
      on conflict (id) do update set state = excluded.state, missing = excluded.missing, seen_at = now()`.catch(() => {});
  write();
  return setInterval(write, 30_000);
}

/** Idles with a health endpoint and a periodic log until the platform redeploys with the variables set. */
async function waitForConfig(problems: string[]): Promise<void> {
  const port = Number(process.env["WORKER_PORT"] || process.env["PORT"] || 8080);
  const message = `[worker] waiting for configuration. Missing or invalid:\n${problems.map((p) => `  - ${p}`).join("\n")}\nSee docs/railway.md. No jobs run until these are set.`;
  console.error(message);
  const server = healthServer(port, () => ({ ok: false, waiting: "config", missing: problems }));
  const timer = setInterval(() => console.error(message), 60_000);
  // With a database but e.g. no API key, report the missing names so the web app's setup page can show them.
  const url = process.env["DATABASE_URL"];
  const sql = url ? connect(url) : null;
  const beat = sql ? startHeartbeat(sql, "waiting", problems) : null;
  await new Promise<void>((resolve) => {
    const stop = () => {
      clearInterval(timer);
      if (beat) clearInterval(beat);
      void sql?.end({ timeout: 2 });
      server.close();
      resolve();
    };
    process.once("SIGTERM", stop);
    process.once("SIGINT", stop);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Started directly (dev). In containers src/start.ts runs migrations first, then main().
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
