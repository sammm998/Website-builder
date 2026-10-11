import { randomUUID } from "node:crypto";
import {
  attachMediaIds,
  auditSeo,
  crawlFinished,
  crawlNext,
  guardedContext,
  initCrawl,
  LOGO_SCREENSHOT_PATH,
  pageMedia,
  processImage,
  processImageBuffer,
  safeFetch,
  type CrawlState,
  type CrawledPage,
} from "@redesign/crawler";
import type { SourcePage } from "@redesign/schema";
import type { JobContext } from "../context";

/** Crawls the project's site page by page; state is saved after every page so it can resume. */
export async function runCrawl(ctx: JobContext) {
  const { sql, env } = ctx.services;
  const guard = { allowPrivate: env.CRAWLER_ALLOW_PRIVATE === "1" };
  const [project] = await sql<{ source_url: string; origin: string }[]>`select source_url, origin from projects where id = ${ctx.projectId}`;
  if (!project) throw new Error("Project not found.");
  const limit = Math.min(Number(ctx.job.input["limit"] ?? 50), 50);

  let state = (ctx.job.progress["state"] as CrawlState | undefined) ?? (await initCrawl(project.source_url, { ...guard, limit }));
  await ctx.progress({ state, processed: state.processed, discovered: state.seen.length, phase: "crawling" });
  await sql`update projects set status = 'crawling' where id = ${ctx.projectId}`;

  const browser = await ctx.services.browser();
  const context = await guardedContext(browser, guard);
  try {
    while (!crawlFinished(state)) {
      await ctx.checkCancelled();
      const step = await crawlNext(state, context, guard);
      state = step.state;
      if (step.page) await savePage(ctx, step.page);
      await ctx.progress({ state, processed: state.processed, discovered: state.seen.length, current: step.page?.path ?? null });
    }
  } finally {
    await context.close();
  }

  // Brand + language from the homepage; SEO audit across all pages.
  const pages = await sql<{ url: string; path: string; status_code: number | null; source: SourcePage | null }[]>`
    select url, path, status_code, source from pages where project_id = ${ctx.projectId} order by path`;
  const home = pages.find((p) => p.path === "/")?.source ?? pages.find((p) => p.source)?.source ?? null;
  const languages = [...new Set(pages.map((p) => p.source?.lang?.slice(0, 2).toLowerCase()).filter((l): l is string => !!l))];
  const robotsTxt = await safeFetch(`${project.origin}/robots.txt`, { ...guard, maxBytes: 200_000 }).then((r) => r.status < 400, () => false);
  const report = auditSeo(
    pages.map((p) => ({ url: p.url, path: p.path, status: p.status_code ?? 0, source: p.source })),
    { origin: project.origin, robotsTxt, sitemapUrls: state.sitemapCount, languages },
  );
  await sql`
    insert into analyses (project_id, user_id, seo_report) values (${ctx.projectId}, ${ctx.userId}, ${sql.json(report as never)})
    on conflict (project_id) do update set seo_report = excluded.seo_report`;
  await sql`
    update projects set
      status = 'crawled',
      source_language = ${home?.lang?.slice(0, 2).toLowerCase() || "sv"},
      name = case when name = '' then ${home?.facts.organizationName || home?.title?.split(/\s[|–—-]\s/).pop() || new URL(project.origin).hostname} else name end,
      brand = ${sql.json({ palette: home?.palette ?? [], fonts: home?.fonts ?? [], logoMediaId: home?.logo?.mediaId ?? null, facts: home?.facts ?? null } as never)}
    where id = ${ctx.projectId}`;
  await ctx.progress({ phase: "done", state: null });
}

async function savePage(ctx: JobContext, page: CrawledPage) {
  const { sql, storage } = ctx.services;
  let source = page.source;
  if (source) {
    const ids = await cacheMedia(ctx, source, page);
    source = attachMediaIds(source, ids);
  }
  let screenshotPath: string | null = null;
  if (page.screenshot) {
    screenshotPath = `${ctx.userId}/${ctx.projectId}/source${page.path === "/" ? "/index" : page.path}.jpg`;
    await storage.put("screens", screenshotPath, page.screenshot, "image/jpeg");
  }
  await sql`
    insert into pages (project_id, user_id, url, path, depth, status_code, title, meta_description, lang, source, screenshot_path, error, included)
    values (${ctx.projectId}, ${ctx.userId}, ${page.url}, ${page.path}, ${page.depth}, ${page.status || null}, ${source?.title ?? null},
      ${source?.description ?? null}, ${source?.lang ?? null}, ${source ? sql.json(source as never) : null}, ${screenshotPath}, ${page.error}, ${!page.error})
    on conflict (project_id, url) do update set
      status_code = excluded.status_code, title = excluded.title, meta_description = excluded.meta_description, lang = excluded.lang,
      source = excluded.source, screenshot_path = excluded.screenshot_path, error = excluded.error`;
}

/** Downloads every media reference once per project; returns source URL -> media id. */
async function cacheMedia(ctx: JobContext, source: SourcePage, page: CrawledPage): Promise<Map<string, string>> {
  const { sql, storage, env } = ctx.services;
  const guard = { allowPrivate: env.CRAWLER_ALLOW_PRIVATE === "1" };
  const refs = pageMedia(source);
  const unique = [...new Map(refs.map((m) => [m.src, m])).values()].slice(0, 80);
  if (!unique.length) return new Map();
  const known = await sql<{ id: string; source_url: string; storage_path: string | null }[]>`
    select id, source_url, storage_path from media where project_id = ${ctx.projectId} and source_url in ${sql(unique.map((m) => m.src))}`;
  const ids = new Map(known.filter((k) => k.storage_path).map((k) => [k.source_url, k.id]));
  for (const ref of unique) {
    if (ids.has(ref.src) || known.some((k) => k.source_url === ref.src)) continue;
    const id = randomUUID();
    const base = `${ctx.projectId}/${id}`;
    try {
      if (ref.kind === "video") {
        const res = await safeFetch(ref.src, { ...guard, maxBytes: 60_000_000, accept: ["video/"], timeoutMs: 60_000 });
        const ext = res.contentType.includes("webm") ? "webm" : "mp4";
        await storage.put("site-media", `${base}/video.${ext}`, res.body, res.contentType);
        await sql`insert into media (id, project_id, user_id, source_url, storage_path, mime, bytes, alt, role, width, height)
          values (${id}, ${ctx.projectId}, ${ctx.userId}, ${ref.src}, ${`${base}/video.${ext}`}, ${res.contentType}, ${res.body.byteLength}, ${ref.alt}, ${ref.role}, ${ref.width ?? null}, ${ref.height ?? null})`;
      } else {
        const store = { put: (path: string, body: Buffer, type: string) => storage.put("site-media", path, body, type) };
        const processed =
          ref.src.endsWith(LOGO_SCREENSHOT_PATH) && page.logoPng
            ? await processImageBuffer(page.logoPng, "image/png", base, store)
            : await processImage(ref.src, base, store, guard);
        await sql`insert into media (id, project_id, user_id, source_url, storage_path, mime, width, height, bytes, sha256, alt, role, variants, placeholder)
          values (${id}, ${ctx.projectId}, ${ctx.userId}, ${ref.src}, ${processed.path}, ${processed.mime}, ${processed.width}, ${processed.height},
            ${processed.bytes}, ${processed.sha256}, ${ref.alt}, ${ref.role}, ${sql.json(processed.variants as never)}, ${processed.placeholder})
          on conflict (project_id, source_url) do nothing`;
      }
      ids.set(ref.src, id);
    } catch (error) {
      await sql`insert into media (id, project_id, user_id, source_url, alt, role, error)
        values (${id}, ${ctx.projectId}, ${ctx.userId}, ${ref.src}, ${ref.alt}, ${ref.role}, ${(error as Error).message.slice(0, 500)})
        on conflict (project_id, source_url) do nothing`;
    }
  }
  return ids;
}
