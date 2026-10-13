-- Installation-wide settings entered in the app (e.g. the Anthropic API key, stored encrypted), so the
-- all-in-one deployment needs no platform variables. Server and worker only; no client access.

create table public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

grant all on public.app_settings to service_role;
alter table public.app_settings enable row level security;

-- Whether the worker has a usable Claude key (from its environment or app_settings).
alter table public.worker_status add column ai_ready boolean not null default false;
