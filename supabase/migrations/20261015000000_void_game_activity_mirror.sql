-- Void mirror-era game_activity credits from the class ledger.
--
-- Context: the obsolete submit_game_round mirror (20260928000005 era) wrote game
-- achievements into point_transactions.category_key='game_activity', contaminating
-- class/lesson totals. The authoritative game ledger is game_points_transactions.
-- This migration removes the contamination (EXECUTE ONLY AFTER the submit_game_round
-- function swap from 20261007000000 is live).
--
-- Proven identity (see docs/report + manifest):
--   167 rows, category_key='game_activity', NOT is_reversal,
--   created 2026-09-10 .. 2026-09-18, sum +2,231. Sole writer was the mirror.
-- Mechanism (same convention as class_score corrections): additive is_reversal=true
-- offset rows linked by reversed_transaction_id. Nothing is deleted; originals are
-- kept as audit history. Guards abort the transaction if voiding is incomplete.

insert into public.point_transactions
  (student_id, level, category_id, category_key, points, reason, lesson_date, awarded_by, is_reversal, reversed_transaction_id, is_system_award)
select
  pt.student_id,
  s.level,
  pt.category_id,
  pt.category_key,
  -pt.points,
  'Game points correction: removed game_activity mirror credit (already banked in game_points_transactions)',
  pt.lesson_date,
  pt.awarded_by,
  true,
  pt.id,
  true
from public.point_transactions pt
join public.students s on s.id = pt.student_id
where pt.category_key = 'game_activity'
  and not pt.is_reversal
  and not exists (
    select 1 from public.point_transactions v
    where v.reversed_transaction_id = pt.id and v.is_reversal
  );

update public.students s
set points = coalesce(
  (select sum(points) from public.point_transactions pt where pt.student_id = s.id),
  0
)
where s.status = 'Active';

do $$
declare v_net numeric; v_orig int; v_links int;
begin
  select coalesce(sum(points), 0) into v_net
    from public.point_transactions
   where category_key = 'game_activity';
  if v_net <> 0 then
    raise exception 'ABORT: game_activity net = % (void incomplete)', v_net;
  end if;

  select count(*) into v_orig from public.point_transactions
   where category_key = 'game_activity' and not is_reversal;
  select count(*) into v_links from public.point_transactions
   where category_key = 'game_activity' and is_reversal and reversed_transaction_id is not null;
  if v_orig <> v_links then
    raise exception 'ABORT: link count % does not match original count %', v_links, v_orig;
  end if;
end $$;