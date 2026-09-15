-- Ranking redesign, step 4 of 7: students.points becomes a database-
-- maintained cache of the ledger, not an independently-editable value.
--
-- The trigger function is SECURITY DEFINER, so it can write students.points
-- even though the UPDATE (points) grant below is revoked from authenticated
-- entirely - including administrators. That revocation is what makes "no
-- application code overwrites students.points" an enforced rule rather than
-- a convention: the only path left to change it is inserting a row into
-- point_transactions and letting this trigger recompute the sum. The old
-- admin +/- point buttons must become inserts of a bonus/penalty
-- transaction instead of a direct students.points update.
--
-- This intentionally does not touch monthly_fee or any other column's
-- privileges - see 0016 for the unrelated financial-masking work this
-- must not disturb.
--
-- IMPORTANT, found only by actually testing this against a real database
-- (staging validation, 2026-07-21): a plain `revoke update (points) on
-- students from authenticated` is NOT enough on its own. Supabase applies
-- a platform-default `grant all on all tables in schema public to
-- authenticated` outside of our own migrations, which gives authenticated
-- a table-level UPDATE on every column of students - and a column-level
-- REVOKE does not override a broader table-level GRANT that already
-- covers the same column through a different path; Postgres privilege
-- checks are permissive across every applicable grant. Verified directly:
-- with only the column-level revoke, `update students set points = ...`
-- as the authenticated role still succeeded. The fix is to revoke the
-- table-level UPDATE entirely and re-grant it only on the specific
-- columns the app is allowed to touch from the client - everything on
-- students except points, id, and created_at.

create or replace function public.refresh_student_points_cache()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  update public.students
    set points = (
      select coalesce(sum(points), 0) from public.point_transactions where student_id = new.student_id
    )
    where id = new.student_id;
  return new;
end;
$$;

revoke execute on function public.refresh_student_points_cache() from public;

drop trigger if exists point_transactions_refresh_cache on public.point_transactions;
create trigger point_transactions_refresh_cache
  after insert on public.point_transactions
  for each row execute function public.refresh_student_points_cache();

revoke update on public.students from authenticated;
grant update (
  profile_id, real_name, english_name, level, phone, parent_phone,
  join_date, payment_deadline, monthly_fee, status, notes, group_name
) on public.students to authenticated;
