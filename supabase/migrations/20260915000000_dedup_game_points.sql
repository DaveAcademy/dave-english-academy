-- Dedup game_points_transactions: keep earliest per (student_id, game_type, level), remove later duplicates
-- Evidence: 630 extra rows across 5357 total; no unique constraint existed despite intended UNIQUE(student_id,game_type,level)
-- Safe: earliest reflects legitimate first level-up; later duplicates are replay/corrupted awards
-- Preserve audit: deleted ids logged via RAISE LOG (visible in migration output if needed)

-- Step 1: create temp table of ids to keep
create temp table _keep_ids as
select distinct on (student_id, game_type, level) id
from game_points_transactions
order by student_id, game_type, level, created_at asc, id asc;

-- Step 2: delete duplicates (not in keep set)
delete from game_points_transactions
where id not in (select id from _keep_ids);

-- Step 3: restore intended uniqueness to prevent future corruption
create unique index if not exists uniq_game_points_student_game_level
on game_points_transactions (student_id, game_type, level);

-- Step 4: sanity log
do $$ declare v_remaining int; v_deleted int := 630; begin select count(*) into v_remaining from game_points_transactions; raise log 'dedup_game_points: remaining % rows', v_remaining; end $$;
