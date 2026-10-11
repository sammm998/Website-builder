import type { Browser } from "playwright";
import type { AiProvider, Usage } from "@redesign/ai";
import type { Sql } from "./db";
import type { Env } from "./env";
import type { Storage } from "./storage";

export type JobKind = "crawl" | "analyze" | "directions" | "direction" | "build" | "publish";

export interface JobRow {
  id: string;
  project_id: string;
  user_id: string;
  kind: JobKind;
  status: string;
  input: Record<string, unknown>;
  progress: Record<string, unknown>;
}

export interface Services {
  sql: Sql;
  env: Env;
  storage: Storage;
  ai: AiProvider;
  browser: () => Promise<Browser>;
}

export class JobCancelled extends Error {
  constructor() {
    super("Job was cancelled.");
  }
}

/** Per-job helpers: idempotent steps, progress, usage accounting, cancellation. */
export class JobContext {
  constructor(
    readonly job: JobRow,
    readonly services: Services,
  ) {}

  get sql() {
    return this.services.sql;
  }
  get projectId() {
    return this.job.project_id;
  }
  get userId() {
    return this.job.user_id;
  }

  /**
   * Runs `fn` once per key across retries/resumes: a finished step returns its stored output.
   * Steps are the unit of resumability for long, billed jobs.
   */
  async step<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const [existing] = await this.sql<{ status: string; output: T }[]>`
      select status, output from job_steps where job_id = ${this.job.id} and key = ${key}`;
    if (existing?.status === "done") return existing.output;
    await this.checkCancelled();
    await this.sql`
      insert into job_steps (job_id, user_id, key, status) values (${this.job.id}, ${this.userId}, ${key}, 'running')
      on conflict (job_id, key) do update set status = 'running', error = null`;
    try {
      const output = await fn();
      await this.sql`
        update job_steps set status = 'done', output = ${this.sql.json((output ?? null) as never)}, error = null
        where job_id = ${this.job.id} and key = ${key}`;
      return output;
    } catch (error) {
      await this.sql`
        update job_steps set status = 'failed', error = ${(error as Error).message.slice(0, 2000)}
        where job_id = ${this.job.id} and key = ${key}`;
      throw error;
    }
  }

  async progress(patch: Record<string, unknown>) {
    this.job.progress = { ...this.job.progress, ...patch };
    await this.sql`update jobs set progress = ${this.sql.json(this.job.progress as never)} where id = ${this.job.id}`;
  }

  async checkCancelled() {
    const [row] = await this.sql<{ status: string }[]>`select status from jobs where id = ${this.job.id}`;
    if (row?.status === "cancelled") throw new JobCancelled();
  }

  /** Records model usage and adds the cost to the job. */
  readonly recordUsage = async (usage: Usage) => {
    await this.sql`
      insert into ai_usage (user_id, project_id, job_id, provider, model, purpose, input_tokens, output_tokens, cost_usd)
      values (${this.userId}, ${this.projectId}, ${this.job.id}, ${usage.provider}, ${usage.model}, ${usage.purpose}, ${usage.inputTokens}, ${usage.outputTokens}, ${usage.costUsd})`;
    await this.sql`update jobs set cost_usd = cost_usd + ${usage.costUsd} where id = ${this.job.id}`;
  };

  get deps() {
    return { ai: this.services.ai, onUsage: this.recordUsage };
  }
}
