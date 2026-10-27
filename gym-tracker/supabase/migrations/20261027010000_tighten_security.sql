-- Closes the gaps found in the row-level security review.
-- Run once in the Supabase dashboard: SQL Editor -> paste this file -> Run. Safe to re-run.
-- Run it together with deploying the app version that contains this file:
-- older app versions create the profile row themselves and will fail to sign up afterwards.

---------------------------------------------------------------------------
-- 1. users: stop letting anyone insert profile rows.
--    The profile row is now created by a trigger when someone signs up,
--    using the username the app passes as sign-up metadata.
---------------------------------------------------------------------------
drop policy if exists "anon can insert users" on public.users;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (user_id, username, email, password_hash)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'username', ''), split_part(new.email, '@', 1)),
    new.email,
    'managed_by_supabase_auth'
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

---------------------------------------------------------------------------
-- 2. personal_records and custom_exercises: turn on RLS and limit each
--    user to their own rows.
---------------------------------------------------------------------------
alter table public.personal_records enable row level security;
drop policy if exists "users manage own personal_records" on public.personal_records;
create policy "users manage own personal_records" on public.personal_records
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter table public.custom_exercises enable row level security;
drop policy if exists "users manage own custom_exercises" on public.custom_exercises;
create policy "users manage own custom_exercises" on public.custom_exercises
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

---------------------------------------------------------------------------
-- 3. progress-photos bucket: make it private. The app now shows photos
--    through short-lived signed links, and still handles older saved links.
---------------------------------------------------------------------------
update storage.buckets set public = false where id = 'progress-photos';

---------------------------------------------------------------------------
-- 4. Storage: each user may only read, add, change or delete files in their
--    own folder (<bucket>/<their user id>/...). Avatars stay viewable through
--    public links as before.
---------------------------------------------------------------------------
do $$
declare
  b text;
begin
  foreach b in array array['avatars', 'progress-photos'] loop
    execute format('drop policy if exists %I on storage.objects', b || ': read own folder');
    execute format('drop policy if exists %I on storage.objects', b || ': upload to own folder');
    execute format('drop policy if exists %I on storage.objects', b || ': update own folder');
    execute format('drop policy if exists %I on storage.objects', b || ': delete own folder');

    execute format($p$create policy %I on storage.objects for select to authenticated
      using (bucket_id = %L and (storage.foldername(name))[1] = (select auth.uid())::text)$p$,
      b || ': read own folder', b);
    execute format($p$create policy %I on storage.objects for insert to authenticated
      with check (bucket_id = %L and (storage.foldername(name))[1] = (select auth.uid())::text)$p$,
      b || ': upload to own folder', b);
    execute format($p$create policy %I on storage.objects for update to authenticated
      using (bucket_id = %L and (storage.foldername(name))[1] = (select auth.uid())::text)
      with check (bucket_id = %L and (storage.foldername(name))[1] = (select auth.uid())::text)$p$,
      b || ': update own folder', b, b);
    execute format($p$create policy %I on storage.objects for delete to authenticated
      using (bucket_id = %L and (storage.foldername(name))[1] = (select auth.uid())::text)$p$,
      b || ': delete own folder', b);
  end loop;
end;
$$;

---------------------------------------------------------------------------
-- Afterwards, list all storage rules. Any older rule on these buckets that
-- isn't one of the eight above may be broader and should be reviewed or dropped:
--   select policyname, cmd, roles, qual, with_check
--   from pg_policies where schemaname = 'storage';
---------------------------------------------------------------------------
