import { analyzeSite } from "@redesign/ai";
import type { SeoReport } from "@redesign/crawler";
import type { JobContext } from "../context";
import { loadPages, loadProject, storedImage } from "../data";

export async function runAnalyze(ctx: JobContext) {
  const project = await loadProject(ctx);
  const pages = await loadPages(ctx);
  if (!pages.length) throw new Error("No pages with content to analyse.");
  const [row] = await ctx.sql<{ seo_report: SeoReport | null }[]>`select seo_report from analyses where project_id = ${ctx.projectId}`;
  const report = row?.seo_report;
  const shot = await storedImage(ctx, pages[0]!.screenshot_path, "Screenshot of the current homepage:");
  await ctx.progress({ phase: "analysing" });
  const summary = await ctx.step("analysis", () =>
    analyzeSite(ctx.deps, {
      pages: pages.map((p) => p.source),
      seoSummary: {
        score: report?.score ?? null,
        failing: (report?.checks ?? []).filter((c) => c.status === "fail" || c.status === "warn").map((c) => ({ title: c.title, detail: c.detail, severity: c.severity, count: c.paths.length })),
      },
      screenshots: shot ? [shot] : [],
      outputLanguage: String(ctx.job.input["uiLanguage"] ?? "sv"),
      origin: project.origin,
    }),
  );
  await ctx.sql`
    insert into analyses (project_id, user_id, summary) values (${ctx.projectId}, ${ctx.userId}, ${ctx.sql.json(summary as never)})
    on conflict (project_id) do update set summary = excluded.summary, approved_at = null`;
  await ctx.sql`update projects set status = 'analysed', step = greatest(step, 2) where id = ${ctx.projectId}`;
}
