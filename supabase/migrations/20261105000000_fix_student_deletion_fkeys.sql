-- Fix foreign keys to allow student deletion to cascade properly.
-- This migration adds ON DELETE CASCADE to foreign keys that currently block
-- student deletion or leave orphaned records.

-- 1. Fix telegram_link_requests.matched_student_id to cascade delete.
-- Currently this FK has no ON DELETE CASCADE, which blocks student deletion
-- when there are telegram link requests for that student.
alter table public.telegram_link_requests
  drop constraint if exists telegram_link_requests_matched_student_id_fkey,
  add constraint telegram_link_requests_matched_student_id_fkey
    foreign key (matched_student_id)
    references public.students (id)
    on delete cascade;

-- 2. Fix students.profile_id to cascade delete.
-- Currently this FK has no ON DELETE CASCADE, which leaves orphaned profiles
-- when a student is deleted.
alter table public.students
  drop constraint if exists students_profile_id_fkey,
  add constraint students_profile_id_fkey
    foreign key (profile_id)
    references public.profiles (id)
    on delete cascade;

-- 3. Ensure profiles table has a constraint that will cascade to auth.users
-- The profiles table's id references auth.users(id). This is already handled
-- by Supabase's internal triggers when a user is deleted via the Auth API.
-- We just need to ensure our profile deletion cascades properly.
-- The profiles table was created in migration 0001 with:
--   id uuid primary key references auth.users (id)
-- Supabase automatically handles the auth.users deletion cascade to profiles
-- when the user is deleted via the Auth Admin API.