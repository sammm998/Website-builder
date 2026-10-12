-- Own authentication (AUTH_DRIVER=password): email/password and Google sign-in without Supabase Auth.
-- These tables are only ever touched by the server (service connection); no grants to anon/authenticated.

create unique index if not exists users_email_unique on auth.users (lower(email)) where email is not null;

create table public.user_credentials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.oauth_identities (
  provider text not null,
  subject text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now(),
  primary key (provider, subject)
);
create index oauth_identities_user_idx on public.oauth_identities (user_id);

-- Failed sign-in attempts for rate limiting (key = normalized email or hashed IP).
create table public.login_attempts (
  id bigint generated always as identity primary key,
  key text not null,
  created_at timestamptz not null default now()
);
create index login_attempts_key_idx on public.login_attempts (key, created_at desc);

grant all on public.user_credentials, public.oauth_identities, public.login_attempts to service_role;

alter table public.user_credentials enable row level security;
alter table public.oauth_identities enable row level security;
alter table public.login_attempts enable row level security;
