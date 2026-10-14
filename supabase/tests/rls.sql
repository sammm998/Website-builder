-- RLS regression tests. Fails (ON_ERROR_STOP) when any expectation is violated.
\set ON_ERROR_STOP on
create or replace function pg_temp.expect(cond boolean, msg text) returns void language plpgsql as $$
begin if not cond then raise exception 'FAILED: %', msg; end if; raise notice 'ok: %', msg; end $$;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

select pg_temp.expect((select count(*) from public.profiles) = 2, 'profiles created by trigger');
select pg_temp.expect((select count(*) from public.user_roles where role = 'user') = 2, 'default roles assigned');

-- Service role seeds data (as the server/worker would).
insert into public.projects (id, user_id, name, source_url, origin) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'A', 'https://a.example', 'https://a.example'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'B', 'https://b.example', 'https://b.example');
insert into public.pages (project_id, user_id, url, path) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'https://a.example/', '/'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'https://b.example/', '/');
insert into public.analyses (project_id, user_id, summary) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', '{"tone":"x"}');
insert into public.published_sites (id, project_id, user_id, slug, is_published) values
  ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'site-a', true),
  ('20000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'site-b', false);
insert into public.published_pages (site_id, path, lang, html) values
  ('20000000-0000-0000-0000-00000000000a', '/', 'sv', '<p>a</p>'),
  ('20000000-0000-0000-0000-00000000000b', '/', 'sv', '<p>b</p>');
insert into public.jobs (project_id, user_id, kind) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'crawl');

-- ---- as user A ----
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);

select pg_temp.expect((select count(*) from public.projects) = 1, 'A sees only own project');
select pg_temp.expect((select count(*) from public.pages) = 1, 'A sees only own pages');
select pg_temp.expect((select count(*) from public.jobs) = 1, 'A sees own jobs');
select pg_temp.expect((select count(*) from public.profiles) = 1, 'A sees only own profile');

update public.pages set included = false where path = '/';
select pg_temp.expect((select included from public.pages where path = '/') = false, 'A can toggle page inclusion');

do $$ begin
  begin
    update public.pages set title = 'hack';
    raise exception 'FAILED: A could update page title';
  exception when insufficient_privilege then raise notice 'ok: page title not writable';
  end;
  begin
    insert into public.projects (user_id, source_url, origin) values (auth.uid(), 'https://x.example', 'https://x.example');
    raise exception 'FAILED: A could insert project directly';
  exception when insufficient_privilege then raise notice 'ok: direct project insert denied';
  end;
  begin
    update public.projects set step = 4;
    raise exception 'FAILED: A could change wizard step';
  exception when insufficient_privilege then raise notice 'ok: wizard step not writable';
  end;
  begin
    insert into public.jobs (project_id, user_id, kind) values ('10000000-0000-0000-0000-00000000000a', auth.uid(), 'build');
    raise exception 'FAILED: A could enqueue job';
  exception when insufficient_privilege then raise notice 'ok: jobs not insertable by users';
  end;
  begin
    insert into public.user_roles (user_id, role) values (auth.uid(), 'admin');
    raise exception 'FAILED: A could grant admin';
  exception when insufficient_privilege then raise notice 'ok: roles not self-assignable';
  end;
end $$;

update public.projects set name = 'renamed' where id = '10000000-0000-0000-0000-00000000000b';
select pg_temp.expect((select count(*) from public.projects where name = 'renamed') = 0, 'A cannot rename B project');
update public.projects set name = 'mine' where id = '10000000-0000-0000-0000-00000000000a';
select pg_temp.expect((select name from public.projects) = 'mine', 'A can rename own project');

update public.analyses set summary = '{"tone":"edited"}';
select pg_temp.expect((select summary->>'tone' from public.analyses) = 'edited', 'A edits analysis before approval');

delete from public.projects where id = '10000000-0000-0000-0000-00000000000b';
reset role;
select pg_temp.expect((select count(*) from public.projects where id = '10000000-0000-0000-0000-00000000000b') = 1, 'A cannot delete B project');

-- Lock analysis + pages, then verify edits are blocked.
update public.analyses set approved_at = now();
update public.projects set pages_locked = true where id = '10000000-0000-0000-0000-00000000000a';
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
update public.analyses set summary = '{"tone":"late"}';
select pg_temp.expect((select summary->>'tone' from public.analyses) = 'edited', 'approved analysis is locked');
update public.pages set included = true;
select pg_temp.expect((select included from public.pages) = false, 'locked pages cannot be toggled');

-- ---- anonymous ----
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.expect((select count(*) from public.published_sites) = 1, 'anon sees only published sites');
select pg_temp.expect((select count(*) from public.published_pages) = 1, 'anon sees only pages of published sites');
do $$ begin
  begin
    perform 1 from public.projects;
    raise exception 'FAILED: anon could read projects';
  exception when insufficient_privilege then raise notice 'ok: anon cannot read projects';
  end;
end $$;
reset role;

-- ---- own-auth tables: server only ----
insert into public.user_credentials (user_id, password_hash) values ('00000000-0000-0000-0000-00000000000a', 'scrypt$x$y');
insert into public.oauth_identities (provider, subject, user_id) values ('google', 'g-a', '00000000-0000-0000-0000-00000000000a');
insert into public.login_attempts (key) values ('a@example.com');
do $$
declare r text; t text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    foreach t in array array['user_credentials', 'oauth_identities', 'login_attempts', 'stored_objects', 'worker_status', 'app_settings', 'preview_shares'] loop
      execute format('set local role %I', r);
      perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
      begin
        execute format('select 1 from public.%I', t);
        raise exception 'FAILED: % could read %', r, t;
      exception when insufficient_privilege then raise notice 'ok: % cannot read %', r, t;
      end;
      reset role;
    end loop;
  end loop;
end $$;
select pg_temp.expect((select relrowsecurity from pg_class where oid = 'public.user_credentials'::regclass), 'credentials have RLS enabled');
select pg_temp.expect((select relrowsecurity from pg_class where oid = 'public.stored_objects'::regclass), 'stored objects have RLS enabled');
do $$ begin
  begin
    insert into auth.users (email) values ('A@example.com');
    raise exception 'FAILED: duplicate email (case-insensitive) accepted';
  exception when unique_violation then raise notice 'ok: emails are unique case-insensitively';
  end;
end $$;
\echo 'ALL RLS TESTS PASSED'
