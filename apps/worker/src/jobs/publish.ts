import { renderPage, robotsTxt, sitemapXml } from "@redesign/renderer";
import type { GeneratedSection, SourcePage } from "@redesign/schema";
import type { JobContext } from "../context";
import { loadProject, type DirectionRow } from "../data";
import { loadMedia, siteContext } from "../render";

/** Publishes an immutable snapshot of the latest complete build to /site/:slug or its domain. */
export async function runPublish(ctx: JobContext) {
  const { sql, env, storage } = ctx.services;
  const project = await loadProject(ctx);
  const slug = String(ctx.job.input["slug"] ?? "");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length < 3 || slug.length > 63) throw new Error("Invalid site address.");
  const [build] = await sql<{ id: string; direction_id: string; css: string; layouts: Record<string, { header: string; footer: string }> }[]>`
    select id, direction_id, css, layouts from site_builds where project_id = ${ctx.projectId} and status = 'complete' order by completed_at desc limit 1`;
  if (!build) throw new Error("Build the website before publishing.");
  const [dir] = await sql<DirectionRow[]>`select * from design_directions where id = ${build.direction_id}`;
  const rows = await sql<{ path: string; lang: string; title: string; description: string; sections: GeneratedSection[]; source: SourcePage | null }[]>`
    select sp.path, sp.lang, sp.title, sp.description, sp.sections, p.source
    from site_pages sp join pages p on p.id = sp.source_page_id
    where sp.build_id = ${build.id} order by sp.lang, sp.path`;
  const [existing] = await sql<{ id: string; version: number; slug: string }[]>`select id, version, slug from published_sites where project_id = ${ctx.projectId}`;
  if (!existing || existing.slug !== slug) {
    const [taken] = await sql<{ id: string }[]>`select id from published_sites where slug = ${slug} and project_id <> ${ctx.projectId}`;
    if (taken) throw new Error("That site address is already taken. Choose another one.");
  }
  const siteId = existing?.id ?? crypto.randomUUID();
  const version = (existing?.version ?? 0) + 1;
  const [domain] = existing
    ? await sql<{ hostname: string }[]>`select hostname from domains where site_id = ${existing.id} and status = 'verified' order by created_at limit 1`
    : [];
  const origin = domain ? `https://${domain.hostname}` : env.SITES_DOMAIN ? `https://${slug}.${env.SITES_DOMAIN}` : env.APP_ORIGIN;
  const basePath = domain || env.SITES_DOMAIN ? "" : `/site/${slug}`;
  const sourceLang = project.source_language ?? "sv";
  const languages = [sourceLang, ...project.target_languages.filter((l) => l !== sourceLang && rows.some((r) => r.lang === l))];
  const home = rows.find((r) => r.path === "/" && r.lang === sourceLang)?.source;
  const ctxSite = siteContext({
    siteName: project.name,
    origin,
    basePath,
    assetBase: env.APP_ORIGIN,
    defaultLang: sourceLang,
    languages,
    pages: rows.map((r) => ({ path: r.path, lang: r.lang, title: r.title })),
    media: await loadMedia(sql, storage, ctx.projectId),
    designSystem: dir!.design_system,
    facts: home?.facts ?? { organizationName: project.name, phones: [], emails: [], addresses: [], socials: [], schemaTypes: [], openingHours: [] },
    logoMediaId: project.brand?.logoMediaId ?? undefined,
    sourceOrigin: project.origin,
    mode: "publish",
    siteId,
    cssHref: `${basePath}/_site.css?v=${version}`,
  });
  const rendered = rows.map((r) => {
    const layout = build.layouts[r.lang] ?? build.layouts[sourceLang]!;
    return {
      path: r.path,
      lang: r.lang,
      title: r.title,
      html: renderPage({ path: r.path, lang: r.lang, title: r.title, description: r.description, sections: r.sections, header: layout.header, footer: layout.footer, source: r.lang === sourceLang ? r.source : null }, ctxSite, "").html,
    };
  });
  await sql.begin(async (tx) => {
    await tx`
      insert into published_sites (id, project_id, user_id, build_id, slug, site_name, default_lang, languages, css, origin, base_path, sitemap_xml, robots_txt, is_published, version, published_at)
      values (${siteId}, ${ctx.projectId}, ${ctx.userId}, ${build.id}, ${slug}, ${project.name}, ${sourceLang}, ${languages}, ${build.css}, ${origin}, ${basePath},
        ${sitemapXml(ctxSite, new Date().toISOString().slice(0, 10))}, ${robotsTxt(ctxSite)}, true, ${version}, now())
      on conflict (project_id) do update set build_id = excluded.build_id, slug = excluded.slug, site_name = excluded.site_name, default_lang = excluded.default_lang,
        languages = excluded.languages, css = excluded.css, origin = excluded.origin, base_path = excluded.base_path, sitemap_xml = excluded.sitemap_xml,
        robots_txt = excluded.robots_txt, is_published = true, version = excluded.version, published_at = now()`;
    await tx`delete from published_pages where site_id = ${siteId}`;
    for (const page of rendered) {
      await tx`insert into published_pages (site_id, path, lang, title, html) values (${siteId}, ${page.path}, ${page.lang}, ${page.title}, ${page.html})`;
    }
  });
  await sql`update projects set status = 'published' where id = ${ctx.projectId}`;
  await ctx.progress({ url: `${origin}${basePath || "/"}`, version, pages: rendered.length });
}
