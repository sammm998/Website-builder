-- Object storage in Postgres (STORAGE_DRIVER=db): crawled media variants and screenshots when no bucket is
-- configured. Only the server and worker touch it; public site media is served by the web app.

create table public.stored_objects (
  bucket text not null check (bucket in ('site-media', 'screens')),
  path text not null,
  content_type text not null,
  body bytea not null,
  created_at timestamptz not null default now(),
  primary key (bucket, path)
);

grant all on public.stored_objects to service_role;
alter table public.stored_objects enable row level security;
