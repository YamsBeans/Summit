-- Lets a signed-in user permanently delete their own account and data.
-- Required for App Store review (Guideline 5.1.1(v)) and Google Play's account deletion policy.
--
-- Run once in the Supabase dashboard: SQL Editor -> paste this file -> Run. Safe to re-run.
-- The app calls it with: supabase.rpc('delete_my_account')
--
-- Photos in the "avatars" and "progress-photos" buckets are removed by the app through
-- the Storage API before this runs, since Supabase blocks deleting storage objects via SQL.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;

  -- Workout history (children first, in case foreign keys don't cascade)
  delete from session_exercise_sets
   where session_exercise_id in (
     select se.session_exercise_id
       from session_exercises se
       join workout_sessions ws on ws.session_id = se.session_id
      where ws.user_id = uid);
  delete from session_exercises
   where session_id in (select session_id from workout_sessions where user_id = uid);
  delete from workout_sessions where user_id = uid;

  -- Routines
  delete from routine_exercise_sets
   where routine_exercise_id in (
     select re.routine_exercise_id
       from routine_exercises re
       join routines r on r.routine_id = re.routine_id
      where r.user_id = uid);
  delete from routine_exercises
   where routine_id in (select routine_id from routines where user_id = uid);
  delete from routines where user_id = uid;

  -- Everything else tied to the user
  delete from personal_records where user_id = uid;
  delete from custom_exercises where user_id = uid;
  delete from users where user_id = uid;

  -- Finally, the login itself
  delete from auth.users where id = uid;
end;
$$;

-- Only signed-in users may call it, and it only ever touches auth.uid()'s own data.
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
