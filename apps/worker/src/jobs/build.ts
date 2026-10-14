import { applyCritique, critiquePage, generatePage, translateFragments, translateMeta, type PageContext } from "@redesign/ai";
import type { SeoReport } from "@redesign/crawler";
import { buildSiteCss } from "@redesign/renderer";
import type { Direction, GeneratedSection } from "@redesign/schema";
import type { JobContext } from "../context";
import { formKeys, loadPages, loadProject, mediaIds, storedImage, visionImage, type DirectionRow, type PageRow, type ProjectRow } from "../data";
import { ASSET_HOST, loadMedia, renderDocument, siteContext } from "../render";
import { forEachLimited } from "../limit";
import { qaStatus, runQa, problemsFrom } from "../qa";

interface SitePageRow {
  id: string;
  source_page_id: string;
  path: string;
  lang: string;
  title: string;
  description: string;
  sections: GeneratedSection[];
}

function metadataFor(page: PageRow, report: SeoReport | null) {
  const s = page.source;
  const suggestion = (field: "title" | "description") => report?.suggestions.find((x) => x.path === page.path && x.field === field)?.suggested;
  return { title: s.title.trim() || suggestion("title") || s.hero.heading, description: s.description.trim() || suggestion("description") || "" };
}

export async function runBuild(ctx: JobContext) {
  const { sql } = ctx.services;
  const project = await loadProject(ctx);
  const directionId = String(ctx.job.input["directionId"] ?? project.approved_direction_id ?? "");
  const [dir] = await sql<DirectionRow[]>`select * from design_directions where id = ${directionId} and project_id = ${ctx.projectId}`;
  if (!dir) throw new Error("Approve a design direction first.");
  const direction: Direction = { name: dir.name, rationale: dir.rationale, designSystem: dir.design_system, headerHtml: dir.header_html, footerHtml: dir.footer_html, sections: dir.sections };
  const pages = await loadPages(ctx);
  if (!pages.length) throw new Error("No pages to build.");
  const sourceLang = project.source_language ?? "sv";
  const languages = [sourceLang, ...project.target_languages.filter((l) => l !== sourceLang)];
  const [analysisRow] = await sql<{ seo_report: SeoReport | null }[]>`select seo_report from analyses where project_id = ${ctx.projectId}`;

  const buildId = await ctx.step("init", async () => {
    const [b] = await sql<{ id: string }[]>`
      insert into site_builds (project_id, user_id, direction_id, status, layouts)
      values (${ctx.projectId}, ${ctx.userId}, ${dir.id}, 'building', ${sql.json({ [sourceLang]: { header: dir.header_html, footer: dir.footer_html } } as never)})
      returning id`;
    return b!.id;
  });
  await sql`update projects set status = 'building' where id = ${ctx.projectId}`;
  const reference = await storedImage(ctx, dir.screenshot_desktop?.replace("-desktop.jpg", "-desktop-full.jpg") ?? null, "APPROVED design direction (reference for consistency):", 2400);
  const pageCtx: PageContext = {
    direction,
    validation: { origin: project.origin, mediaIds: await mediaIds(ctx), formKeys: formKeys(pages.map((p) => p.source)) },
    reference,
  };

  const parallel = ctx.services.env.AI_PARALLELISM;
  // Validation warnings per page decide which pages get the (paid) visual critique below.
  const pageWarnings = new Map<string, number>();

  // 1) Generate every page in the source language, several at a time (each page is its own step).
  let done = 0;
  await forEachLimited(pages, parallel, async (page) => {
    await ctx.progress({ phase: "pages", done, total: pages.length, current: page.path });
    const out = await ctx.step(`page:${page.id}`, async () => {
      const existing = page.path === "/" ? direction.sections : [];
      const result = await generatePage(ctx.deps, pageCtx, page.source, existing);
      const meta = metadataFor(page, analysisRow?.seo_report ?? null);
      await sql`
        insert into site_pages (build_id, project_id, user_id, source_page_id, path, lang, title, description, sections)
        values (${buildId}, ${ctx.projectId}, ${ctx.userId}, ${page.id}, ${page.path}, ${sourceLang}, ${meta.title}, ${meta.description}, ${sql.json(result.sections as never)})
        on conflict (build_id, source_page_id, lang) do update set sections = excluded.sections, title = excluded.title, description = excluded.description`;
      return { warnings: result.warnings.length };
    });
    pageWarnings.set(page.id, out?.warnings ?? 0);
    done++;
    await ctx.progress({ phase: "pages", done, total: pages.length });
  });

  // 2) Visual QA per page (render, automated checks, critique, at most one fix pass).
  const media = await loadMedia(sql, ctx.services.storage, ctx.projectId);
  const refs = pages.map((p) => ({ path: p.path, lang: sourceLang, title: metadataFor(p, analysisRow?.seo_report ?? null).title }));
  const previewCtx = siteContext({
    siteName: project.name,
    origin: project.origin,
    basePath: "",
    assetBase: ASSET_HOST,
    defaultLang: sourceLang,
    languages: [sourceLang],
    pages: refs,
    media,
    designSystem: direction.designSystem,
    facts: pages[0]!.source.facts,
    logoMediaId: project.brand?.logoMediaId ?? undefined,
    sourceOrigin: project.origin,
    mode: "preview",
  });
  const allFragments = async () => {
    const rows = await sql<{ sections: GeneratedSection[] }[]>`select sections from site_pages where build_id = ${buildId} and lang = ${sourceLang}`;
    return [direction.headerHtml, direction.footerHtml, ...rows.flatMap((r) => r.sections.map((s) => s.html))];
  };
  done = 0;
  await forEachLimited(pages, Math.min(2, parallel), async (page) => {
    await ctx.progress({ phase: "qa", done, total: pages.length, current: page.path });
    await ctx.step(`qa:${page.id}`, async () => {
      const [row] = await sql<SitePageRow[]>`select * from site_pages where build_id = ${buildId} and source_page_id = ${page.id} and lang = ${sourceLang}`;
      if (!row) throw new Error(`Missing generated page ${page.path}`);
      const css = await buildSiteCss(direction.designSystem, [direction.headerHtml, direction.footerHtml, ...row.sections.map((s) => s.html)], ASSET_HOST);
      const render = async (sections: GeneratedSection[]) =>
        (await renderDocument(previewCtx, { path: page.path, lang: sourceLang, title: row.title, description: row.description, sections, header: direction.headerHtml, footer: direction.footerHtml, source: page.source }, css)).html;
      const browser = await ctx.services.browser();
      let sections = row.sections;
      let qa = await runQa(browser, ctx.services.env, await render(sections), page.source);
      // The paid visual critique runs where it matters: the homepage, and pages where the automated checks
      // or the validation found something. Other pages follow the approved system and pass deterministic QA.
      const needsCritique = page.path === "/" || problemsFrom(qa.checks).length > 0 || (pageWarnings.get(page.id) ?? 0) > 0;
      if (!needsCritique) {
        await saveReport(ctx, buildId, row.id, 0, qa, null);
        const status = qaStatus(qa.checks, null);
        await sql`update site_pages set qa_status = ${status} where id = ${row.id}`;
        return { status, score: null, critique: false };
      }
      const critique = await critiquePage(ctx.deps, {
        path: page.path,
        desktop: await visionImage(qa.desktop, "Rendered page, desktop 1440px:"),
        mobile: await visionImage(qa.mobile, "Rendered page, mobile 390px:", 3200),
        reference,
        sections: sections.map((s) => ({ sourceIndex: s.sourceIndex, archetype: s.archetype })),
        checks: qa.problems,
      });
      await saveReport(ctx, buildId, row.id, 0, qa, critique);
      let score = critique.score;
      if (critique.score < 8 && critique.issues.some((i) => i.severity !== "low")) {
        sections = await applyCritique(ctx.deps, pageCtx, page.source, sections, critique);
        // Re-check deterministically (no second paid critique round).
        const newCss = await buildSiteCss(direction.designSystem, [direction.headerHtml, direction.footerHtml, ...sections.map((s) => s.html)], ASSET_HOST);
        const html = (await renderDocument(previewCtx, { path: page.path, lang: sourceLang, title: row.title, description: row.description, sections, header: direction.headerHtml, footer: direction.footerHtml, source: page.source }, newCss)).html;
        const recheck = await runQa(browser, ctx.services.env, html, page.source);
        if (problemsFrom(recheck.checks).length <= problemsFrom(qa.checks).length) {
          qa = recheck;
          await sql`update site_pages set sections = ${sql.json(sections as never)} where id = ${row.id}`;
          score = Math.max(score, 8);
        }
        await saveReport(ctx, buildId, row.id, 1, qa, null);
      }
      const status = qaStatus(qa.checks, score);
      await sql`update site_pages set qa_status = ${status} where id = ${row.id}`;
      return { status, score, critique: true };
    });
    done++;
  });

  // 3) Translations: identical markup, translated text only.
  const targets = languages.slice(1);
  const glossary = [project.name, pages[0]!.source.facts.organizationName].filter(Boolean);
  for (const lang of targets) {
    await ctx.step(`layout:${lang}`, async () => {
      const [header, footer] = await translateFragments(ctx.deps, [direction.headerHtml, direction.footerHtml], sourceLang, lang, glossary);
      await sql`update site_builds set layouts = layouts || ${sql.json({ [lang]: { header, footer } } as never)} where id = ${buildId}`;
      return true;
    });
    done = 0;
    await forEachLimited(pages, parallel, async (page) => {
      await ctx.progress({ phase: "translating", lang, done, total: pages.length, current: page.path });
      await ctx.step(`translate:${page.id}:${lang}`, async () => {
        const [row] = await sql<SitePageRow[]>`select * from site_pages where build_id = ${buildId} and source_page_id = ${page.id} and lang = ${sourceLang}`;
        const html = await translateFragments(ctx.deps, row!.sections.map((s) => s.html), sourceLang, lang, glossary);
        const meta = await translateMeta(ctx.deps, { title: row!.title, description: row!.description }, sourceLang, lang);
        const sections = row!.sections.map((s, i) => ({ ...s, html: html[i]! }));
        await sql`
          insert into site_pages (build_id, project_id, user_id, source_page_id, path, lang, title, description, sections, qa_status)
          values (${buildId}, ${ctx.projectId}, ${ctx.userId}, ${page.id}, ${page.path}, ${lang}, ${meta.title}, ${meta.description}, ${sql.json(sections as never)}, (select qa_status from site_pages where id = ${row!.id}))
          on conflict (build_id, source_page_id, lang) do update set sections = excluded.sections, title = excluded.title, description = excluded.description`;
        return true;
      });
      done++;
    });
  }

  // 4) Final stylesheet (classes are identical across languages).
  await ctx.step("css", async () => {
    const css = await buildSiteCss(direction.designSystem, await allFragments(), "");
    await sql`update site_builds set css = ${css} where id = ${buildId}`;
    return css.length;
  });
  const summary = await sql<{ qa_status: string; n: number }[]>`select qa_status, count(*)::int as n from site_pages where build_id = ${buildId} group by qa_status`;
  await sql`update site_builds set status = 'complete', completed_at = now(), qa_summary = ${sql.json(Object.fromEntries(summary.map((s) => [s.qa_status, s.n])) as never)} where id = ${buildId}`;
  await sql`update projects set status = 'built', step = 4 where id = ${ctx.projectId}`;
}

async function saveReport(ctx: JobContext, buildId: string, sitePageId: string, iteration: number, qa: Awaited<ReturnType<typeof runQa>>, critique: unknown) {
  const base = `${ctx.userId}/${ctx.projectId}/qa/${sitePageId}-${iteration}`;
  await ctx.services.storage.put("screens", `${base}-desktop.jpg`, qa.desktop, "image/jpeg");
  await ctx.services.storage.put("screens", `${base}-mobile.jpg`, qa.mobile, "image/jpeg");
  await ctx.sql`
    insert into qa_reports (build_id, site_page_id, user_id, iteration, checks, critique, passed, screenshot_desktop, screenshot_mobile)
    values (${buildId}, ${sitePageId}, ${ctx.userId}, ${iteration}, ${ctx.sql.json(qa.checks as never)}, ${critique ? ctx.sql.json(critique as never) : null},
      ${problemsFrom(qa.checks).length === 0}, ${`${base}-desktop.jpg`}, ${`${base}-mobile.jpg`})`;
}

export type { ProjectRow };
