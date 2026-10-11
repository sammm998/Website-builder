import "server-only";
import { z } from "zod";
import { analysisSummarySchema, type AnalysisSummary, type DesignSystem } from "@redesign/schema";
import { sql } from "./db";
import { env } from "./env";

/**
 * All database access for the web app. Every function takes the authenticated user's id and scopes
 * its queries by it, so one user can never read or change another user's data.
 */

export class UserError extends Error {}

export type JobKind = "crawl" | "analyze" | "directions" | "direction" | "build" | "publish";
const BILLED: JobKind[] = ["analyze", "directions", "direction", "build"];

export interface JobInfo {
  id: string;
  kind: JobKind;
  status: "queued" | "running" | "paused" | "failed" | "completed" | "cancelled";
  progress: Record<string, unknown>;
  error: string | null;
  cost_usd: string;
  created_at: Date;
}

export interface ProjectSummary {
  id: string;
  name: string;
  source_url: string;
  status: string;
  step: number;
  created_at: Date;
  thumbnail: string | null;
}

export async function listProjects(userId: string): Promise<ProjectSummary[]> {
  return sql()<ProjectSummary[]>`
    select p.id, p.name, p.source_url, p.status, p.step, p.created_at,
      coalesce(
        (select d.screenshot_desktop from design_directions d where d.id = p.approved_direction_id),
        (select pg.screenshot_path from pages pg where pg.project_id = p.id and pg.path = '/' limit 1)
      ) as thumbnail
    from projects p where p.user_id = ${userId} order by p.created_at desc`;
}

const urlSchema = z
  .string()
  .trim()
  .transform((v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`))
  .pipe(z.string().url());

export const createProjectInput = z.object({
  url: urlSchema,
  inspiration: z.array(urlSchema).max(3).default([]),
  languages: z.array(z.string().regex(/^[a-z]{2}$/)).max(8).default([]),
});

async function enqueue(userId: string, projectId: string, kind: JobKind, input: Record<string, unknown> = {}) {
  const db = sql();
  if (BILLED.includes(kind)) {
    const n = (await db<{ n: number }[]>`
      select count(*)::int as n from jobs where user_id = ${userId} and kind in ${db(BILLED)} and created_at > now() - interval '1 day'`)[0]?.n ?? 0;
    if (n >= env().DAILY_JOB_LIMIT) throw new UserError("Daily generation limit reached. Try again tomorrow.");
  }
  try {
    const [job] = await db<{ id: string }[]>`
      insert into jobs (project_id, user_id, kind, input) values (${projectId}, ${userId}, ${kind}, ${db.json(input as never)}) returning id`;
    return job!.id;
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new UserError("This step is already running.");
    throw error;
  }
}

export async function createProject(userId: string, raw: unknown): Promise<string> {
  const input = createProjectInput.parse(raw);
  const url = new URL(input.url);
  const db = sql();
  const [project] = await db<{ id: string }[]>`
    insert into projects (user_id, source_url, origin, inspiration_urls, target_languages)
    values (${userId}, ${url.href}, ${url.origin}, ${input.inspiration}, ${input.languages}) returning id`;
  await enqueue(userId, project!.id, "crawl", { limit: 50 });
  return project!.id;
}

async function ownProject(userId: string, projectId: string) {
  const [p] = await sql()<{ id: string; pages_locked: boolean; approved_direction_id: string | null; step: number; status: string }[]>`
    select id, pages_locked, approved_direction_id, step, status from projects where id = ${projectId} and user_id = ${userId}`;
  if (!p) throw new UserError("Project not found.");
  return p;
}

export interface DirectionView {
  id: string;
  slot: number;
  version: number;
  name: string;
  rationale: string;
  design_system: DesignSystem;
  screenshot_desktop: string | null;
  screenshot_mobile: string | null;
  feedback: string | null;
}

export interface WizardState {
  project: {
    id: string;
    name: string;
    source_url: string;
    origin: string;
    status: string;
    step: number;
    pages_locked: boolean;
    source_language: string | null;
    target_languages: string[];
    approved_direction_id: string | null;
    inspiration_urls: string[];
  };
  pages: { id: string; path: string; url: string; title: string | null; included: boolean; error: string | null; status_code: number | null }[];
  jobs: Partial<Record<JobKind, JobInfo>>;
  analysis: { summary: AnalysisSummary | null; seo_report: unknown; approved_at: Date | null } | null;
  directions: DirectionView[];
  build: { id: string; status: string; qa_summary: Record<string, number> | null; completed_at: Date | null; pages: { id: string; path: string; lang: string; title: string; qa_status: string }[] } | null;
  site: { id: string; slug: string; version: number; published_at: Date; url: string } | null;
  domains: { id: string; hostname: string; status: string; verification: unknown }[];
  cost: number;
}

export function siteUrl(slug: string): string {
  const e = env();
  return e.SITES_DOMAIN ? `https://${slug}.${e.SITES_DOMAIN}` : `${e.APP_ORIGIN}/site/${slug}`;
}

export async function wizardState(userId: string, projectId: string): Promise<WizardState | null> {
  const db = sql();
  const [project] = await db<WizardState["project"][]>`
    select id, name, source_url, origin, status, step, pages_locked, source_language, target_languages, approved_direction_id, inspiration_urls
    from projects where id = ${projectId} and user_id = ${userId}`;
  if (!project) return null;
  const [pages, jobs, analysisRows, directions, builds, sites, cost] = await Promise.all([
    db<WizardState["pages"]>`select id, path, url, title, included, error, status_code from pages where project_id = ${projectId} and user_id = ${userId} order by (path = '/') desc, path`,
    db<JobInfo[]>`
      select distinct on (kind) id, kind, status, progress - 'state' as progress, error, cost_usd, created_at
      from jobs where project_id = ${projectId} and user_id = ${userId} order by kind, created_at desc`,
    db<{ summary: AnalysisSummary | null; seo_report: unknown; approved_at: Date | null }[]>`select summary, seo_report, approved_at from analyses where project_id = ${projectId} and user_id = ${userId}`,
    db<DirectionView[]>`
      select id, slot, version, name, rationale, design_system, screenshot_desktop, screenshot_mobile, feedback
      from design_directions where project_id = ${projectId} and user_id = ${userId} and is_current order by slot`,
    db<{ id: string; status: string; qa_summary: Record<string, number> | null; completed_at: Date | null }[]>`
      select id, status, qa_summary, completed_at from site_builds where project_id = ${projectId} and user_id = ${userId} order by created_at desc limit 1`,
    db<{ id: string; slug: string; version: number; published_at: Date }[]>`
      select id, slug, version, published_at from published_sites where project_id = ${projectId} and user_id = ${userId} and is_published`,
    db<{ total: string | null }[]>`select sum(cost_usd)::text as total from ai_usage where project_id = ${projectId} and user_id = ${userId}`,
  ]);
  const build = builds[0]
    ? {
        ...builds[0],
        pages: await db<{ id: string; path: string; lang: string; title: string; qa_status: string }[]>`
          select id, path, lang, title, qa_status from site_pages where build_id = ${builds[0].id} and user_id = ${userId} order by lang, (path = '/') desc, path`,
      }
    : null;
  const site = sites[0] ? { ...sites[0], url: siteUrl(sites[0].slug) } : null;
  const domains = site
    ? await db<WizardState["domains"]>`select id, hostname, status, verification from domains where site_id = ${site.id} and user_id = ${userId} order by created_at`
    : [];
  return {
    project,
    pages,
    jobs: Object.fromEntries(jobs.map((j) => [j.kind, j])),
    analysis: analysisRows[0] ?? null,
    directions,
    build,
    site,
    domains,
    cost: Number(cost[0]?.total ?? 0),
  };
}

export async function setPageIncluded(userId: string, pageId: string, included: boolean) {
  const db = sql();
  const result = await db`
    update pages set included = ${included}
    where id = ${pageId} and user_id = ${userId} and error is null
      and not exists (select 1 from projects p where p.id = pages.project_id and p.pages_locked)`;
  if (result.count === 0) throw new UserError("The page list is locked.");
}

export async function setAllPagesIncluded(userId: string, projectId: string, included: boolean) {
  const p = await ownProject(userId, projectId);
  if (p.pages_locked) throw new UserError("The page list is locked.");
  await sql()`update pages set included = ${included} where project_id = ${projectId} and user_id = ${userId} and error is null and (path <> '/' or ${included})`;
}

export async function startAnalysis(userId: string, projectId: string, uiLanguage: string) {
  const db = sql();
  await ownProject(userId, projectId);
  const [crawl] = await db<{ status: string }[]>`select status from jobs where project_id = ${projectId} and kind = 'crawl' order by created_at desc limit 1`;
  if (crawl?.status !== "completed") throw new UserError("Wait for the crawl to finish.");
  const n = (await db<{ n: number }[]>`select count(*)::int as n from pages where project_id = ${projectId} and included and source is not null`)[0]?.n ?? 0;
  if (n === 0) throw new UserError("Select at least one page.");
  await db`update projects set pages_locked = true where id = ${projectId} and user_id = ${userId}`;
  await enqueue(userId, projectId, "analyze", { uiLanguage });
}

export async function updateAnalysis(userId: string, projectId: string, raw: unknown) {
  const summary = analysisSummarySchema.parse(raw);
  const result = await sql()`
    update analyses set summary = ${sql().json(summary as never)} where project_id = ${projectId} and user_id = ${userId} and approved_at is null`;
  if (result.count === 0) throw new UserError("The analysis is approved and locked.");
}

export async function approveAnalysis(userId: string, projectId: string) {
  const db = sql();
  await ownProject(userId, projectId);
  const result = await db`update analyses set approved_at = now() where project_id = ${projectId} and user_id = ${userId} and summary is not null and approved_at is null`;
  if (result.count === 0) throw new UserError("Nothing to approve.");
  await db`update projects set step = greatest(step, 3) where id = ${projectId}`;
  await enqueue(userId, projectId, "directions");
}

export async function regenerateDirection(userId: string, projectId: string, slot: number, feedback: string) {
  const p = await ownProject(userId, projectId);
  if (p.approved_direction_id) throw new UserError("A direction is already approved.");
  if (!feedback.trim()) throw new UserError("Describe what to change.");
  await enqueue(userId, projectId, "direction", { slot, feedback: feedback.slice(0, 2000) });
}

export async function approveDirection(userId: string, projectId: string, directionId: string) {
  const db = sql();
  await ownProject(userId, projectId);
  const [d] = await db<{ id: string }[]>`select id from design_directions where id = ${directionId} and project_id = ${projectId} and user_id = ${userId} and is_current`;
  if (!d) throw new UserError("Direction not found.");
  await db`update projects set approved_direction_id = ${directionId}, step = 4 where id = ${projectId} and user_id = ${userId}`;
  await enqueue(userId, projectId, "build", { directionId });
}

export async function rebuild(userId: string, projectId: string) {
  const p = await ownProject(userId, projectId);
  if (!p.approved_direction_id) throw new UserError("Approve a design first.");
  await enqueue(userId, projectId, "build", { directionId: p.approved_direction_id });
}

export const slugSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, digits and hyphens.").min(3).max(63);

export async function publish(userId: string, projectId: string, rawSlug: string) {
  const slug = slugSchema.parse(rawSlug);
  const db = sql();
  await ownProject(userId, projectId);
  const [taken] = await db<{ id: string }[]>`select id from published_sites where slug = ${slug} and project_id <> ${projectId}`;
  if (taken) throw new UserError("That address is taken.");
  const [build] = await db<{ id: string }[]>`select id from site_builds where project_id = ${projectId} and user_id = ${userId} and status = 'complete' limit 1`;
  if (!build) throw new UserError("Build the website first.");
  await enqueue(userId, projectId, "publish", { slug });
}

export async function unpublish(userId: string, projectId: string) {
  await sql()`update published_sites set is_published = false where project_id = ${projectId} and user_id = ${userId}`;
}

export async function resumeJob(userId: string, jobId: string) {
  const result = await sql()`update jobs set status = 'queued', error = null where id = ${jobId} and user_id = ${userId} and status in ('paused', 'failed')`;
  if (result.count === 0) throw new UserError("This job cannot be resumed.");
}

export async function cancelJob(userId: string, jobId: string) {
  await sql()`update jobs set status = 'cancelled', finished_at = now() where id = ${jobId} and user_id = ${userId} and status in ('queued', 'running', 'paused')`;
}

export async function deleteProject(userId: string, projectId: string) {
  await sql()`delete from projects where id = ${projectId} and user_id = ${userId}`;
}

export async function renameProject(userId: string, projectId: string, name: string) {
  await sql()`update projects set name = ${name.trim().slice(0, 120)} where id = ${projectId} and user_id = ${userId}`;
}

/** Screens bucket objects are namespaced by user id; only the owner may read them. */
export function ownsScreen(userId: string, path: string): boolean {
  return path.startsWith(`${userId}/`) && !path.includes("..");
}

export { enqueue };
