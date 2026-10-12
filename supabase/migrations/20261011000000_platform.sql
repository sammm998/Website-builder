-- Platform prerequisites. Supabase provides these (roles, the auth schema, auth.users, auth.uid()); on a
-- plain Postgres (Railway, local, CI) they are created here so every later migration runs unchanged.
-- Everything is guarded, so this is a no-op on Supabase and safe to run more than once.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

do $$
begin
  -- Supabase defines auth.uid() from the request JWT; ours reads the same setting (used by RLS tests).
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'auth' and p.proname = 'uid'
  ) then
    execute $f$create function auth.uid() returns uuid language sql stable as $b$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $b$ $f$;
  end if;
end $$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
