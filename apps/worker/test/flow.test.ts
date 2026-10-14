import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeText, sectionTexts, type SourcePage } from "@redesign/schema";
import { startFixtureServer } from "../../../packages/crawler/test/server";
import { createServices, processJob } from "../src/index";
import { claimJob } from "../src/queue";
import { loadEnv } from "../src/env";
import { startDatabase } from "./pg";

const USER = "00000000-0000-0000-0000-0000000000aa";
let db: Awaited<ReturnType<typeof startDatabase>>;
let fixture: Awaited<ReturnType<typeof startFixtureServer>>;
let services: ReturnType<typeof createServices>;
let storageDir: string;
let projectId: string;

async function runJob(kind: string, input: Record<string, unknown> = {}) {
  const { sql } = services;
  const [job] = await sql<{ id: string }[]>`insert into jobs (project_id, user_id, kind, input) values (${projectId}, ${USER}, ${kind}, ${sql.json(input as never)}) returning id`;
  const claimed = await claimJob(sql);
  expect(claimed?.id).toBe(job!.id);
  await processJob(services, claimed!);
  const [row] = await sql<{ status: string; error: string | null; progress: Record<string, unknown>; cost_usd: string }[]>`select status, error, progress, cost_usd from jobs where id = ${job!.id}`;
  return row!;
}

const stripTags = (html: string) =>
  normalizeText(
    html
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'"),
  );

beforeAll(async () => {
  db = await startDatabase();
  fixture = await startFixtureServer();
  storageDir = mkdtempSync(join(tmpdir(), "redesign-storage-"));
  const env = loadEnv({
    DATABASE_URL: db.url,
    STORAGE_DRIVER: "local",
    LOCAL_STORAGE_DIR: storageDir,
    LOCAL_STORAGE_PUBLIC_URL: "http://storage.test/storage",
    APP_ORIGIN: "https://app.example",
    CRAWLER_ALLOW_PRIVATE: "1",
    AI_PROVIDER: "fake",
    CHROMIUM_PATH: process.env["CHROMIUM_PATH"] ?? "/opt/pw-browsers/chromium",
  });
  services = createServices(env);
  const { sql } = services;
  await sql`insert into auth.users (id, email) values (${USER}, 'owner@example.com')`;
  const [p] = await sql<{ id: string }[]>`
    insert into projects (user_id, source_url, origin, target_languages) values (${USER}, ${`${fixture.origin}/`}, ${fixture.origin}, ${["en"]}) returning id`;
  projectId = p!.id;
}, 60_000);

afterAll(async () => {
  await services?.close();
  await fixture?.close();
  await db?.stop();
  if (storageDir && !process.env["KEEP_STORAGE"]) rmSync(storageDir, { recursive: true, force: true });
  else if (storageDir) console.log("storage kept at", storageDir);
});

describe("end-to-end job flow", () => {
  it("crawls the site, caches media and audits SEO", async () => {
    const job = await runJob("crawl", { limit: 20 });
    expect(job.error).toBeNull();
    expect(job.status).toBe("completed");
    const { sql } = services;
    const pages = await sql<{ path: string; source: SourcePage }[]>`select path, source from pages where project_id = ${projectId} and source is not null order by path`;
    expect(pages.map((p) => p.path)).toEqual(["/", "/kontakt", "/om-oss", "/om-oss/historia", "/tjanster"]);
    const media = await sql<{ storage_path: string | null; role: string }[]>`select storage_path, role from media where project_id = ${projectId}`;
    expect(media.filter((m) => m.storage_path).length).toBeGreaterThanOrEqual(5);
    expect(media.some((m) => m.role === "logo" && m.storage_path)).toBe(true);
    const home = pages.find((p) => p.path === "/")!.source;
    const services_ = home.sections.find((s) => s.heading === "Våra tjänster")!;
    expect(services_.blocks.filter((b) => b.type === "media" && b.media.mediaId)).toHaveLength(3);
    const [analysis] = await sql<{ seo_report: { score: number; checks: unknown[] } }[]>`select seo_report from analyses where project_id = ${projectId}`;
    expect(analysis!.seo_report.score).toBeGreaterThan(0);
    const [project] = await sql<{ status: string; source_language: string; brand: { logoMediaId: string | null; palette: string[] } }[]>`select status, source_language, brand from projects where id = ${projectId}`;
    expect(project).toMatchObject({ status: "crawled", source_language: "sv" });
    expect(project!.brand.logoMediaId).toBeTruthy();
    expect(project!.brand.palette[0]).toBe("#0b6e4f");
  }, 120_000);

  it("analyses and generates three rendered design directions", async () => {
    expect((await runJob("analyze", { uiLanguage: "sv" })).status).toBe("completed");
    const job = await runJob("directions");
    expect(job.error).toBeNull();
    const { sql } = services;
    const dirs = await sql<{ slot: number; name: string; css: string; screenshot_desktop: string; screenshot_mobile: string }[]>`
      select slot, name, css, screenshot_desktop, screenshot_mobile from design_directions where project_id = ${projectId} and is_current order by slot`;
    expect(dirs.map((d) => d.slot)).toEqual([0, 1, 2]);
    expect(new Set(dirs.map((d) => d.name)).size).toBe(3);
    for (const d of dirs) {
      expect(d.css).toContain("--color-bg");
      expect(existsSync(join(storageDir, "screens", d.screenshot_desktop))).toBe(true);
      expect(existsSync(join(storageDir, "screens", d.screenshot_mobile))).toBe(true);
    }
  }, 180_000);

  it("builds every page in both languages with QA, then publishes a snapshot", async () => {
    const { sql } = services;
    const [dir] = await sql<{ id: string }[]>`select id from design_directions where project_id = ${projectId} and slot = 1 and is_current`;
    await sql`update projects set approved_direction_id = ${dir!.id} where id = ${projectId}`;
    const build = await runJob("build", { directionId: dir!.id });
    expect(build.error).toBeNull();
    expect(build.status).toBe("completed");
    const pages = await sql<{ path: string; lang: string; qa_status: string }[]>`select sp.path, sp.lang, sp.qa_status from site_pages sp join site_builds b on b.id = sp.build_id where b.project_id = ${projectId}`;
    expect(pages).toHaveLength(10);
    expect(pages.filter((p) => p.qa_status === "failed")).toEqual([]);
    const reports = await sql<{ checks: { missingText: string[]; overflowMobile: number } }[]>`select checks from qa_reports where user_id = ${USER}`;
    expect(reports.length).toBeGreaterThanOrEqual(5);
    for (const r of reports) {
      expect(r.checks.missingText).toEqual([]);
      expect(r.checks.overflowMobile).toBeLessThanOrEqual(0);
    }

    // Cost guard: one page call per page, and the paid visual critique only where needed (here: homepage).
    const calls = Object.fromEntries(
      (await sql<{ purpose: string; n: number }[]>`select purpose, count(*)::int as n from ai_usage where project_id = ${projectId} group by 1`).map((r) => [r.purpose, r.n]),
    );
    expect(calls["page"]).toBe(5);
    expect(calls["critique"]).toBe(1);
    const publish = await runJob("publish", { slug: "byggfirma-ek" });
    expect(publish.error).toBeNull();
    const [site] = await sql<{ id: string; sitemap_xml: string; robots_txt: string; css: string; base_path: string }[]>`select id, sitemap_xml, robots_txt, css, base_path from published_sites where project_id = ${projectId}`;
    expect(site!.base_path).toBe("/site/byggfirma-ek");
    expect(site!.sitemap_xml).toContain("<loc>https://app.example/site/byggfirma-ek/tjanster</loc>");
    expect(site!.sitemap_xml).toContain('hreflang="en" href="https://app.example/site/byggfirma-ek/en/tjanster"');
    expect(site!.robots_txt).toContain("Sitemap: https://app.example/site/byggfirma-ek/sitemap.xml");
    const published = await sql<{ path: string; lang: string; html: string }[]>`select path, lang, html from published_pages where site_id = ${site!.id}`;
    expect(published).toHaveLength(10);
    const sources = await sql<{ path: string; source: SourcePage }[]>`select path, source from pages where project_id = ${projectId} and source is not null`;
    for (const page of published.filter((p) => p.lang === "sv")) {
      const text = stripTags(page.html);
      const src = sources.find((s) => s.path === page.path)!.source;
      for (const t of [src.hero, ...src.sections].flatMap(sectionTexts)) expect(text).toContain(normalizeText(t));
      expect(page.html).toContain(`<link rel="canonical" href="https://app.example/site/byggfirma-ek${page.path === "/" ? "" : page.path}`);
      expect(page.html).not.toContain("media:");
      expect(page.html).toContain('href="/site/byggfirma-ek/_site.css?v=1"');
    }
    // The menu is made of the built pages (including /om-oss/historia, which the source menu lacked).
    const home = published.find((p) => p.path === "/" && p.lang === "sv")!;
    const headerHtml = /<header[\s\S]*?<\/header>/.exec(home.html)![0];
    for (const label of ["Tjänster", "Om oss", "Kontakt", "Historia"]) expect(headerHtml).toContain(`>${label}<`);
    expect(headerHtml).toContain('href="/site/byggfirma-ek/om-oss/historia"');
    const contact = published.find((p) => p.path === "/kontakt" && p.lang === "sv")!;
    expect(contact.html).toMatch(new RegExp(`action="https://app.example/api/forms/${site!.id}/form-1"`));
    const en = published.find((p) => p.path === "/" && p.lang === "en")!;
    expect(en.html).toContain('<html lang="en"');
    expect(en.html).toContain("[EN] ");
  }, 300_000);
});
