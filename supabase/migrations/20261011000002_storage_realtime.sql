-- Storage buckets: site-media is public (paths are unguessable project UUIDs; content is already public on
-- the customer's own website). Screens (screenshots of drafts/QA) are private to the owner.
-- Writes happen only through the service role in the worker.
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public) values ('site-media', 'site-media', true)
      on conflict (id) do nothing;
    insert into storage.buckets (id, name, public) values ('screens', 'screens', false)
      on conflict (id) do nothing;
    execute $p$create policy "owners read screens" on storage.objects for select to authenticated
      using (bucket_id = 'screens' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  end if;
end $$;

-- Realtime progress for the wizard.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.jobs, public.pages, public.job_steps;
  end if;
end $$;
