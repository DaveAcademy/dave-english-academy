-- Server-side duplicate-award guard for the manual quick-award path
-- (awardPoints/bulkAwardPoints, storageBridge.js -> Rankings.jsx "Add
-- Points" / "Award Class Points"). This is the one point-entry path with
-- no existing idempotency protection: game submissions got a round-token
-- guard in 0141, lesson-work grading has a points_awarded IS NULL claim
-- guard (storageBridge.js awardLessonWorkPoints), but a plain manual award
-- is a bare insert with only a client-side (React state, per-tab,
-- non-persistent) duplicate check. That gap is confirmed, not theoretical:
-- 0097 reversed a real production incident where the same bulk batch was
-- submitted twice ~40s apart and doubled Level B's points for the day.
--
-- Duplicate invariant chosen: category_key in ('bonus', 'penalty') - the
-- only two values the manual award UI ever writes (see Rankings.jsx) - is
-- not a reversal or baseline row, and an existing non-reversal/non-baseline
-- row for the same student/category_key/points/reason/awarded_by was
-- created within the last 120 seconds. 120s matches the existing client-
-- side DUP_WINDOW_MS in Rankings.jsx exactly, so this closes the gap
-- (persists across reloads/tabs/devices, can't be bypassed by a retry)
-- without changing the UX teachers already expect from that window.
--
-- Scoped to category_key alone, not every insert into point_transactions:
-- homework/exam/achievement/game/lesson-work awards use different
-- category_keys and already have their own protections or are legitimately
-- automated (e.g. grading several students the identical score+reason in
-- quick succession is normal and must not be blocked - that's a different
-- student_id each time, so the guard never fires for them anyway. Two
-- different teachers coincidentally awarding the same student the same
-- bonus within the window is excluded by including awarded_by in the
-- match, so it is not treated as a duplicate.
--
-- This does not touch existing rows, RLS, or the level-match trigger from
-- 0019 - it only adds one more BEFORE INSERT check in front of the same
-- insert-only ledger.

create or replace function public.prevent_duplicate_point_transaction()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if new.category_key in ('bonus', 'penalty')
     and not new.is_reversal
     and not new.is_baseline
     and exists (
       select 1
       from public.point_transactions pt
       where pt.student_id = new.student_id
         and pt.category_key = new.category_key
         and pt.points = new.points
         and pt.reason is not distinct from new.reason
         and pt.awarded_by is not distinct from new.awarded_by
         and not pt.is_reversal
         and not pt.is_baseline
         and pt.created_at > now() - interval '120 seconds'
     )
  then
    raise exception 'Duplicate point award: an identical award for this student was already recorded in the last 2 minutes.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.prevent_duplicate_point_transaction() from public;

drop trigger if exists point_transactions_prevent_duplicate on public.point_transactions;
create trigger point_transactions_prevent_duplicate
  before insert on public.point_transactions
  for each row execute function public.prevent_duplicate_point_transaction();
