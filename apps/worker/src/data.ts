import sharp from "sharp";
import type { ImageInput } from "@redesign/ai";
import type { AnalysisSummary, DesignSystem, Facts, GeneratedSection, SourcePage } from "@redesign/schema";
import type { JobContext } from "./context";

export interface ProjectRow {
  id: string;
  user_id: string;
  name: string;
  source_url: string;
  origin: string;
  inspiration_urls: string[];
  source_language: string | null;
  target_languages: string[];
  approved_direction_id: string | null;
  brand: { palette: string[]; fonts: string[]; logoMediaId: string | null; facts: Facts | null } | null;
}

export interface PageRow {
  id: string;
  url: string;
  path: string;
  source: SourcePage;
  screenshot_path: string | null;
}

export interface DirectionRow {
  id: string;
  slot: number;
  version: number;
  name: string;
  rationale: string;
  design_system: DesignSystem;
  header_html: string;
  footer_html: string;
  sections: GeneratedSection[];
  css: string | null;
  screenshot_desktop: string | null;
}

export async function loadProject(ctx: JobContext): Promise<ProjectRow> {
  const [p] = await ctx.sql<ProjectRow[]>`
    select id, user_id, name, source_url, origin, inspiration_urls, source_language, target_languages, approved_direction_id, brand
    from projects where id = ${ctx.projectId} and user_id = ${ctx.userId}`;
  if (!p) throw new Error("Project not found.");
  return p;
}

/** Included pages with content, homepage first then by path. */
export async function loadPages(ctx: JobContext): Promise<PageRow[]> {
  const rows = await ctx.sql<PageRow[]>`
    select id, url, path, source, screenshot_path from pages
    where project_id = ${ctx.projectId} and included and source is not null and error is null
    order by (path = '/') desc, length(path), path`;
  return rows;
}

export async function loadAnalysis(ctx: JobContext): Promise<AnalysisSummary> {
  const [a] = await ctx.sql<{ summary: AnalysisSummary | null }[]>`select summary from analyses where project_id = ${ctx.projectId}`;
  if (!a?.summary) throw new Error("Run the analysis first.");
  return a.summary;
}

export async function mediaIds(ctx: JobContext): Promise<Set<string>> {
  const rows = await ctx.sql<{ id: string }[]>`select id from media where project_id = ${ctx.projectId} and storage_path is not null and error is null`;
  return new Set(rows.map((r) => r.id));
}

export function formKeys(pages: SourcePage[]): Set<string> {
  const keys = new Set<string>();
  for (const p of pages) for (const s of [p.hero, ...p.sections, p.footer]) for (const b of s.blocks) if (b.type === "form") keys.add(b.form.key);
  return keys;
}

/** Downscales a (tall) screenshot for vision input: top part, max 1000px wide. */
export async function visionImage(data: Buffer, label: string, maxHeight = 2600): Promise<ImageInput> {
  const img = sharp(data);
  const meta = await img.metadata();
  const height = Math.min(meta.height ?? maxHeight, maxHeight);
  const out = await img
    .extract({ left: 0, top: 0, width: meta.width ?? 1440, height })
    .resize({ width: Math.min(1000, meta.width ?? 1000) })
    .jpeg({ quality: 70 })
    .toBuffer();
  return { data: out, mediaType: "image/jpeg", label };
}

export async function storedImage(ctx: JobContext, path: string | null, label: string, maxHeight?: number): Promise<ImageInput | undefined> {
  if (!path) return undefined;
  try {
    return await visionImage(await ctx.services.storage.get("screens", path), label, maxHeight);
  } catch {
    return undefined;
  }
}
