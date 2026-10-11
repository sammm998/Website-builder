import type { Sql } from "./db";
import type { JobRow } from "./context";

/** Atomically claims the oldest queued job (FOR UPDATE SKIP LOCKED: safe with many workers). */
export async function claimJob(sql: Sql): Promise<JobRow | null> {
  const [job] = await sql<JobRow[]>`
    update jobs set status = 'running', started_at = coalesce(started_at, now()), error = null
    where id = (
      select id from jobs where status = 'queued' order by created_at for update skip locked limit 1
    )
    returning id, project_id, user_id, kind, status, input, progress`;
  return job ?? null;
}

export async function heartbeat(sql: Sql, jobId: string) {
  await sql`update jobs set updated_at = now() where id = ${jobId} and status = 'running'`;
}

export async function completeJob(sql: Sql, jobId: string) {
  await sql`update jobs set status = 'completed', finished_at = now(), error = null where id = ${jobId} and status = 'running'`;
}

/** Pauses with a readable reason; the user resumes explicitly (no automatic billed retries). */
export async function pauseJob(sql: Sql, jobId: string, error: string) {
  await sql`update jobs set status = 'paused', error = ${error.slice(0, 2000)} where id = ${jobId} and status = 'running'`;
}

/**
 * Jobs left "running" by a crashed worker. Unbilled crawl jobs are re-queued; billed jobs are paused so
 * the owner decides whether to continue.
 */
export async function recoverStaleJobs(sql: Sql, staleMinutes = 10) {
  await sql`
    update jobs set status = case when kind = 'crawl' then 'queued' else 'paused' end,
      error = case when kind = 'crawl' then null else 'The worker restarted during this step. Resume to continue where it stopped.' end
    where status = 'running' and updated_at < now() - make_interval(mins => ${staleMinutes})`;
}
