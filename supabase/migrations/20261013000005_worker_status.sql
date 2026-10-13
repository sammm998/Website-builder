-- Worker heartbeats, so the web app can show whether a worker is running or waiting for configuration
-- (the setup page and the wizard). Written by the worker only; no client access.

create table public.worker_status (
  id text primary key,
  state text not null check (state in ('running', 'waiting')),
  missing text[] not null default '{}',
  seen_at timestamptz not null default now()
);

grant all on public.worker_status to service_role;
alter table public.worker_status enable row level security;
