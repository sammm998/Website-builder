-- Shareable test links for unpublished previews (/p/<token>): a design direction or a finished build,
-- viewable without logging in until the link expires. Created and resolved by the server only.

create table public.preview_shares (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null check (kind in ('direction', 'build')),
  target_id uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index preview_shares_target_idx on public.preview_shares (kind, target_id, expires_at desc);

grant all on public.preview_shares to service_role;
alter table public.preview_shares enable row level security;
