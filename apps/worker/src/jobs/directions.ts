import { generateDirection, planDirections, type Brief, type DirectionContext } from "@redesign/ai";
import { guardedContext } from "@redesign/crawler";
import type { Direction } from "@redesign/schema";
import type { JobContext } from "../context";
import { formKeys, loadAnalysis, loadPages, loadProject, mediaIds, storedImage, visionImage, type DirectionRow, type ProjectRow } from "../data";
import { ASSET_HOST, loadMedia, renderDocument, screenshots, siteContext } from "../render";

async function directionContext(ctx: JobContext, project: ProjectRow): Promise<DirectionContext> {
  const pages = await loadPages(ctx);
  const home = pages[0];
  if (!home) throw new Error("No homepage content found.");
  const analysis = await loadAnalysis(ctx);
  const inspiration = await ctx.step("inspiration", () => captureInspiration(ctx, project.inspiration_urls));
  const inspirationImages = await Promise.all(
    inspiration.map((path, i) => storedImage(ctx, path, `Inspiration site ${i + 1} (client's taste reference, do not copy content):`, 1800)),
  );
  return {
    home: home.source,
    analysis,
    validation: { origin: project.origin, mediaIds: await mediaIds(ctx), formKeys: formKeys(pages.map((p) => p.source)) },
    inspiration: inspirationImages.filter((x): x is NonNullable<typeof x> => !!x),
    current: await storedImage(ctx, home.screenshot_path, "Current homepage (the site being redesigned):", 2200),
  };
}

/** Screenshots of the inspiration sites (first two screens), through the SSRF guard. */
async function captureInspiration(ctx: JobContext, urls: string[]): Promise<string[]> {
  if (!urls.length) return [];
  const browser = await ctx.services.browser();
  const guard = { allowPrivate: ctx.services.env.CRAWLER_ALLOW_PRIVATE === "1", viewport: { width: 1440, height: 900 } };
  const context = await guardedContext(browser, guard);
  const paths: string[] = [];
  try {
    for (const [i, url] of urls.slice(0, 3).entries()) {
      const page = await context.newPage();
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25_000 });
        await page.waitForLoadState("load", { timeout: 10_000 }).catch(() => {});
        await page.waitForTimeout(1200);
        const shot = await page.screenshot({ type: "jpeg", quality: 72, clip: { x: 0, y: 0, width: 1440, height: 1800 }, fullPage: true });
        const path = `${ctx.userId}/${ctx.projectId}/inspiration-${i}.jpg`;
        await ctx.services.storage.put("screens", path, shot, "image/jpeg");
        paths.push(path);
      } catch {
        /* unreachable inspiration sites are skipped */
      } finally {
        await page.close();
      }
    }
  } finally {
    await context.close();
  }
  return paths;
}

/** Stores a direction and renders its preview screenshots + CSS. */
async function saveDirection(ctx: JobContext, project: ProjectRow, slot: number, direction: Direction, warnings: unknown[], feedback?: string) {
  const { sql, storage, env } = ctx.services;
  const pages = await loadPages(ctx);
  const home = pages[0]!;
  const media = await loadMedia(sql, storage, ctx.projectId);
  const lang = project.source_language ?? "sv";
  const siteCtx = siteContext({
    siteName: project.name,
    origin: project.origin,
    basePath: "",
    assetBase: ASSET_HOST,
    defaultLang: lang,
    languages: [lang],
    pages: [{ path: "/", lang, title: home.source.title }],
    media,
    designSystem: direction.designSystem,
    facts: home.source.facts,
    logoMediaId: project.brand?.logoMediaId ?? undefined,
    sourceOrigin: project.origin,
    mode: "preview",
  });
  const doc = await renderDocument(siteCtx, {
    path: "/",
    lang,
    title: home.source.title,
    description: home.source.description,
    sections: direction.sections,
    header: direction.headerHtml,
    footer: direction.footerHtml,
    source: home.source,
  });
  const browser = await ctx.services.browser();
  const desktop = await screenshots(browser, env, doc.html, 1440, 900);
  const mobile = await screenshots(browser, env, doc.html, 390, 844);
  const [next] = await sql<{ version: number }[]>`
    select coalesce(max(version), 0) + 1 as version from design_directions where project_id = ${ctx.projectId} and slot = ${slot}`;
  const version = next?.version ?? 1;
  const base = `${ctx.userId}/${ctx.projectId}/directions/${slot}-v${version}`;
  await storage.put("screens", `${base}-desktop.jpg`, desktop.hero, "image/jpeg");
  await storage.put("screens", `${base}-desktop-full.jpg`, desktop.full, "image/jpeg");
  await storage.put("screens", `${base}-mobile.jpg`, mobile.full, "image/jpeg");
  await sql.begin(async (tx) => {
    await tx`update design_directions set is_current = false where project_id = ${ctx.projectId} and slot = ${slot} and is_current`;
    await tx`
      insert into design_directions (project_id, user_id, slot, version, name, rationale, design_system, header_html, footer_html, sections, css, feedback, screenshot_desktop, screenshot_mobile)
      values (${ctx.projectId}, ${ctx.userId}, ${slot}, ${version}, ${direction.name}, ${direction.rationale}, ${tx.json(direction.designSystem as never)},
        ${direction.headerHtml}, ${direction.footerHtml}, ${tx.json(direction.sections as never)}, ${doc.css}, ${feedback ?? null},
        ${`${base}-desktop.jpg`}, ${`${base}-mobile.jpg`})`;
  });
  await ctx.progress({ [`direction${slot}`]: "done", warnings: warnings.length });
}

export async function runDirections(ctx: JobContext) {
  const project = await loadProject(ctx);
  await ctx.progress({ phase: "planning" });
  const dctx = await directionContext(ctx, project);
  const briefs = await ctx.step<Brief[]>("briefs", () => planDirections(ctx.deps, dctx));
  await ctx.progress({ phase: "designing", briefs: briefs.map((b) => b.name) });
  // The three directions are independent: generate them in parallel, each as its own resumable step.
  await Promise.all(
    briefs.map((brief, slot) =>
      ctx.step(`direction-${slot}`, async () => {
        const result = await generateDirection(ctx.deps, dctx, brief, briefs.filter((_, i) => i !== slot));
        await saveDirection(ctx, project, slot, result.direction, result.warnings);
        return { name: result.direction.name };
      }),
    ),
  );
  await ctx.sql`update projects set status = 'directions-ready', step = greatest(step, 3) where id = ${ctx.projectId}`;
}

/** Regenerates one direction with the owner's feedback (explicit, single billed action). */
export async function runDirection(ctx: JobContext) {
  const project = await loadProject(ctx);
  const slot = Number(ctx.job.input["slot"]);
  const feedback = String(ctx.job.input["feedback"] ?? "").slice(0, 2000);
  const [current] = await ctx.sql<DirectionRow[]>`select * from design_directions where project_id = ${ctx.projectId} and slot = ${slot} and is_current`;
  if (!current) throw new Error("Direction not found.");
  const dctx = await directionContext(ctx, project);
  const brief: Brief = { name: current.name, concept: current.rationale, mode: current.design_system.mode, color: "keep", typography: `${current.design_system.typography.display} + ${current.design_system.typography.body}`, layout: "keep", motion: current.design_system.motion.personality, hero: "keep" };
  await ctx.step("regenerate", async () => {
    const previous: Direction = { name: current.name, rationale: current.rationale, designSystem: current.design_system, headerHtml: current.header_html, footerHtml: current.footer_html, sections: current.sections };
    const result = await generateDirection(ctx.deps, dctx, brief, [], { previous, text: feedback });
    await saveDirection(ctx, project, slot, result.direction, result.warnings, feedback);
    return { name: result.direction.name };
  });
}

export { visionImage };
