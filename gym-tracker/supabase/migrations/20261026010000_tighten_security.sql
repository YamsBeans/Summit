-- Closes the gaps found in the row-level security review.
-- Run once in the Supabase dashboard: SQL Editor -> paste this file -> Run.
-- Safe to run more than once.

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
  select new.id,
         coalesce(nullif(new.raw_user_meta_data->>'username', ''), split_part(new.email, '@', 1)),
         new.email,
         'managed_by_supabase_auth'
  where not exists (select 1 from public.users where user_id = new.id);
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
-- 3. avatars bucket: users may only add, change, list or delete files in
--    their own folder (avatars/<their user id>/...). Viewing avatars still
--    works through public URLs as before.
---------------------------------------------------------------------------
drop policy if exists "avatars: read own folder" on storage.objects;
create policy "avatars: read own folder" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "avatars: upload to own folder" on storage.objects;
create policy "avatars: upload to own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "avatars: update own folder" on storage.objects;
create policy "avatars: update own folder" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "avatars: delete own folder" on storage.objects;
create policy "avatars: delete own folder" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

---------------------------------------------------------------------------
-- Afterwards, check for older storage rules that are broader than these
-- (any avatars rule not named above should be reviewed or dropped):
--   select policyname, cmd, roles, qual, with_check
--   from pg_policies where schemaname = 'storage';
---------------------------------------------------------------------------
