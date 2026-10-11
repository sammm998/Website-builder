-- Redesign AI core schema. Every table is owner-scoped with Row Level Security.
-- Writes that drive paid work (jobs, AI usage) are performed by the service role only.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Profiles & roles
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'user');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  locale text not null default 'sv' check (locale in ('sv', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email, ''), '@', 1)));
  insert into public.user_roles (user_id, role) values (new.id, 'user');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Projects & crawled source
-- ---------------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null default '',
  source_url text not null check (source_url ~ '^https?://'),
  origin text not null,
  inspiration_urls text[] not null default '{}' check (cardinality(inspiration_urls) <= 3),
  source_language text,
  target_languages text[] not null default '{}' check (cardinality(target_languages) <= 8),
  -- wizard: 1 pages, 2 analysis, 3 design, 4 website
  step smallint not null default 1 check (step between 1 and 4),
  status text not null default 'created',
  pages_locked boolean not null default false,
  approved_direction_id uuid,
  brand jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_user_idx on public.projects (user_id, created_at desc);
create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();

create table public.pages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  path text not null,
  depth smallint not null default 0,
  status_code smallint,
  included boolean not null default true,
  title text,
  meta_description text,
  lang text,
  -- Versioned SourcePage JSON (packages/schema): verbatim ordered sections, media, links, forms.
  source jsonb,
  seo jsonb,
  screenshot_path text,
  error text,
  created_at timestamptz not null default now(),
  unique (project_id, url)
);
create index pages_project_idx on public.pages (project_id, path);

create table public.media (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_url text not null,
  storage_path text,
  mime text,
  width integer,
  height integer,
  bytes integer,
  sha256 text,
  alt text,
  -- photo | logo | icon | avatar | badge | illustration
  role text not null default 'photo',
  variants jsonb not null default '[]'::jsonb,
  placeholder text,
  error text,
  created_at timestamptz not null default now(),
  unique (project_id, source_url)
);
create index media_project_idx on public.media (project_id);

-- ---------------------------------------------------------------------------
-- Analysis, design directions, builds
-- ---------------------------------------------------------------------------
create table public.analyses (
  project_id uuid primary key references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  summary jsonb,
  seo_report jsonb,
  approved_at timestamptz,
  updated_at timestamptz not null default now()
);
create trigger analyses_touch before update on public.analyses
  for each row execute function public.touch_updated_at();

create table public.design_directions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  slot smallint not null check (slot between 0 and 2),
  version integer not null default 1,
  name text not null default '',
  rationale text not null default '',
  design_system jsonb not null,
  header_html text not null default '',
  footer_html text not null default '',
  -- [{ sourceIndex, archetype, html }]; sourceIndex -1 = hero
  sections jsonb not null default '[]'::jsonb,
  css text,
  feedback text,
  screenshot_desktop text,
  screenshot_mobile text,
  is_current boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index design_directions_current_idx on public.design_directions (project_id, slot) where is_current;

alter table public.projects
  add constraint projects_approved_direction_fk
  foreign key (approved_direction_id) references public.design_directions(id) on delete set null;

create table public.site_builds (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  direction_id uuid not null references public.design_directions(id) on delete restrict,
  status text not null default 'building' check (status in ('building', 'qa', 'complete', 'paused', 'failed')),
  header_html text,
  footer_html text,
  css text,
  qa_summary jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index site_builds_project_idx on public.site_builds (project_id, created_at desc);

create table public.site_pages (
  id uuid primary key default gen_random_uuid(),
  build_id uuid not null references public.site_builds(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_page_id uuid not null references public.pages(id) on delete cascade,
  path text not null,
  lang text not null,
  title text not null default '',
  description text not null default '',
  -- [{ sourceIndex, archetype, html }]
  sections jsonb not null default '[]'::jsonb,
  qa_status text not null default 'pending' check (qa_status in ('pending', 'passed', 'warning', 'failed')),
  updated_at timestamptz not null default now(),
  unique (build_id, source_page_id, lang)
);
create index site_pages_build_idx on public.site_pages (build_id, lang, path);
create trigger site_pages_touch before update on public.site_pages
  for each row execute function public.touch_updated_at();

create table public.qa_reports (
  id uuid primary key default gen_random_uuid(),
  build_id uuid not null references public.site_builds(id) on delete cascade,
  site_page_id uuid not null references public.site_pages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  iteration smallint not null default 0,
  checks jsonb not null default '{}'::jsonb,
  critique jsonb,
  passed boolean not null default false,
  screenshot_desktop text,
  screenshot_mobile text,
  created_at timestamptz not null default now()
);
create index qa_reports_page_idx on public.qa_reports (site_page_id, iteration desc);

-- ---------------------------------------------------------------------------
-- Jobs (resumable background work) & AI usage
-- ---------------------------------------------------------------------------
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('crawl', 'analyze', 'directions', 'direction', 'build', 'publish')),
  status text not null default 'queued' check (status in ('queued', 'running', 'paused', 'failed', 'completed', 'cancelled')),
  input jsonb not null default '{}'::jsonb,
  progress jsonb not null default '{}'::jsonb,
  error text,
  cost_usd numeric(10, 4) not null default 0,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);
create index jobs_project_idx on public.jobs (project_id, created_at desc);
-- At most one active job of each kind per project.
create unique index jobs_active_kind_idx on public.jobs (project_id, kind) where status in ('queued', 'running');
create trigger jobs_touch before update on public.jobs
  for each row execute function public.touch_updated_at();

create table public.job_steps (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed', 'skipped')),
  output jsonb,
  error text,
  cost_usd numeric(10, 4) not null default 0,
  updated_at timestamptz not null default now(),
  unique (job_id, key)
);
create trigger job_steps_touch before update on public.job_steps
  for each row execute function public.touch_updated_at();

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  provider text not null,
  model text not null,
  purpose text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric(10, 4) not null default 0,
  created_at timestamptz not null default now()
);
create index ai_usage_user_idx on public.ai_usage (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Publishing, domains, forms
-- ---------------------------------------------------------------------------
create table public.published_sites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  build_id uuid references public.site_builds(id) on delete set null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) between 3 and 63),
  site_name text not null default '',
  default_lang text not null default 'sv',
  languages text[] not null default '{}',
  css text not null default '',
  is_published boolean not null default true,
  version integer not null default 1,
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger published_sites_touch before update on public.published_sites
  for each row execute function public.touch_updated_at();

create table public.published_pages (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.published_sites(id) on delete cascade,
  path text not null,
  lang text not null,
  title text not null default '',
  html text not null,
  unique (site_id, lang, path)
);

create table public.domains (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.published_sites(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  hostname text not null unique check (hostname ~ '^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$'),
  status text not null default 'pending' check (status in ('pending', 'verified', 'error')),
  verification jsonb not null default '[]'::jsonb,
  last_checked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.published_sites(id) on delete cascade,
  form_key text not null,
  page_path text not null default '/',
  data jsonb not null,
  ip_hash text,
  created_at timestamptz not null default now()
);
create index form_submissions_site_idx on public.form_submissions (site_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;

grant select, update on public.profiles to authenticated;
grant select on public.user_roles to authenticated;
grant select, delete on public.projects to authenticated;
grant select, update on public.pages to authenticated;
grant select on public.media to authenticated;
grant select, update on public.analyses to authenticated;
grant select on public.design_directions to authenticated;
grant select on public.site_builds to authenticated;
grant select on public.site_pages to authenticated;
grant select on public.qa_reports to authenticated;
grant select on public.jobs to authenticated;
grant select on public.job_steps to authenticated;
grant select on public.ai_usage to authenticated;
grant select on public.published_sites to anon, authenticated;
grant select on public.published_pages to anon, authenticated;
grant select on public.domains to anon, authenticated;
grant select, delete on public.form_submissions to authenticated;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.projects enable row level security;
alter table public.pages enable row level security;
alter table public.media enable row level security;
alter table public.analyses enable row level security;
alter table public.design_directions enable row level security;
alter table public.site_builds enable row level security;
alter table public.site_pages enable row level security;
alter table public.qa_reports enable row level security;
alter table public.jobs enable row level security;
alter table public.job_steps enable row level security;
alter table public.ai_usage enable row level security;
alter table public.published_sites enable row level security;
alter table public.published_pages enable row level security;
alter table public.domains enable row level security;
alter table public.form_submissions enable row level security;

create policy "own profile read" on public.profiles for select to authenticated using (id = auth.uid());
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "own roles read" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create policy "own projects read" on public.projects for select to authenticated using (user_id = auth.uid());
-- Projects are created by validated server actions (service role) so wizard state cannot be forged.
create policy "own projects update" on public.projects for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own projects delete" on public.projects for delete to authenticated using (user_id = auth.uid());

create policy "own pages read" on public.pages for select to authenticated using (user_id = auth.uid());
-- Owners may only toggle inclusion while pages are not locked (column grant below restricts the rest).
create policy "own pages update" on public.pages for update to authenticated
  using (user_id = auth.uid() and not exists (select 1 from public.projects p where p.id = project_id and p.pages_locked))
  with check (user_id = auth.uid());
revoke update on public.pages from authenticated;
grant update (included) on public.pages to authenticated;

create policy "own media read" on public.media for select to authenticated using (user_id = auth.uid());

create policy "own analyses read" on public.analyses for select to authenticated using (user_id = auth.uid());
create policy "own analyses update" on public.analyses for update to authenticated
  using (user_id = auth.uid() and approved_at is null) with check (user_id = auth.uid());
revoke update on public.analyses from authenticated;
grant update (summary) on public.analyses to authenticated;

create policy "own directions read" on public.design_directions for select to authenticated using (user_id = auth.uid());
create policy "own builds read" on public.site_builds for select to authenticated using (user_id = auth.uid());
create policy "own site pages read" on public.site_pages for select to authenticated using (user_id = auth.uid());
create policy "own qa read" on public.qa_reports for select to authenticated using (user_id = auth.uid());
create policy "own jobs read" on public.jobs for select to authenticated using (user_id = auth.uid());
create policy "own job steps read" on public.job_steps for select to authenticated using (user_id = auth.uid());
create policy "own usage read" on public.ai_usage for select to authenticated using (user_id = auth.uid());

create policy "published sites public read" on public.published_sites for select to anon, authenticated
  using (is_published or user_id = auth.uid());
create policy "published pages public read" on public.published_pages for select to anon, authenticated
  using (exists (select 1 from public.published_sites s where s.id = site_id and (s.is_published or s.user_id = auth.uid())));
create policy "verified domains public read" on public.domains for select to anon, authenticated
  using (status = 'verified' or user_id = auth.uid());
create policy "own form submissions read" on public.form_submissions for select to authenticated
  using (exists (select 1 from public.published_sites s where s.id = site_id and s.user_id = auth.uid()));
create policy "own form submissions delete" on public.form_submissions for delete to authenticated
  using (exists (select 1 from public.published_sites s where s.id = site_id and s.user_id = auth.uid()));

-- Profiles: only display_name/locale are user-editable.
revoke update on public.profiles from authenticated;
grant update (display_name, locale) on public.profiles to authenticated;
-- Projects: owners cannot move ownership or bypass wizard locks via direct updates.
revoke update on public.projects from authenticated;
grant update (name) on public.projects to authenticated;
