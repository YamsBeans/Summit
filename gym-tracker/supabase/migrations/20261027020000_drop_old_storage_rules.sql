-- Removes older storage rules that were broader than the ones in 20261027010000_tighten_security.sql.
-- Run once in the Supabase dashboard: SQL Editor -> paste this file -> Run. Safe to re-run.

-- Let anyone, even signed-out visitors, read and list every progress photo.
drop policy if exists "Progress photos are publicly readable" on storage.objects;

-- Let anyone list every avatar file (exposing all user IDs). Avatars still display
-- without it, because the avatars bucket is public and serves files by direct link.
drop policy if exists "Avatars are publicly readable" on storage.objects;

-- Duplicates of the newer "<bucket>: ... own folder" rules.
drop policy if exists "Users can upload their own avatar" on storage.objects;
drop policy if exists "Users can update their own avatar" on storage.objects;
drop policy if exists "Users can upload their own progress photos" on storage.objects;
drop policy if exists "Users can update their own progress photos" on storage.objects;
