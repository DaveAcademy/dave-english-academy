-- Ranking redesign, step 7 of 7: the ranking engine, recognition
-- finalization, and the simplified student-facing history read. All
-- functions require auth.uid() is not null (mirrors get_leaderboard()'s
-- existing pattern from 0007/0008), and get_leaderboard() itself is left
-- untouched here - it keeps working for every existing caller
-- (Rankings.jsx, MyRanking.jsx, PortalHome.jsx, Dashboard.jsx,
-- Reports.jsx) until each is migrated to these new, level-scoped
-- functions in a later phase. Nothing breaks mid-rollout.
--
-- week_bounds/month_bounds operate on a plain `date` (no time-of-day, no
-- timezone attached), so once a transaction's lesson_date is correctly
-- stamped in the academy's local calendar day (Asia/Tashkent - see 0019),
-- no further timezone conversion is needed to bucket it into the right
-- Monday-Sunday week or calendar month.

create or replace function public.week_bounds(d date)
returns table(period_start date, period_end date)
language sql
immutable
as $$
  select date_trunc('week', d)::date, (date_trunc('week', d) + interval '6 days')::date;
$$;

create or replace function public.month_bounds(d date)
returns table(period_start date, period_end date)
language sql
immutable
as $$
  select date_trunc('month', d)::date, (date_trunc('month', d) + interval '1 month - 1 day')::date;
$$;

-- ---------- Group leaderboard (admin/teacher Rankings page, student
-- ---------- MyRanking page) ----------
--
-- p_period_type: 'all_time' | 'week' | 'month'. all_time reads the
-- students.points cache directly (fast, and it's the lifetime figure by
-- definition); week/month sum point_transactions for that level over the
-- period, excluding is_baseline rows, and also compute the prior
-- equivalent period so the caller can show a rank-change arrow.
--
-- Joins point_transactions on pt.level = p_level (the level the student
-- was in *at award time*), not the student's current level, so a
-- student's history stays with the level it was actually earned in even
-- if they've since moved levels - this is a deliberate consequence of
-- snapshotting level onto each ledger row, not an oversight.
create or replace function public.get_group_leaderboard(
  p_level text,
  p_period_type text,
  p_period_start date default null
)
returns table(
  student_id bigint,
  real_name text,
  points numeric,
  rank integer,
  prev_points numeric,
  prev_rank integer,
  rank_change integer,
  attendance_rate numeric
)
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_start date;
  v_end date;
  v_prev_start date;
  v_prev_end date;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in.';
  end if;
  if p_level not in ('A', 'B', 'C') then
    raise exception 'Invalid level: %', p_level;
  end if;

  if p_period_type = 'all_time' then
    return query
      select s.id, s.real_name, s.points,
             rank() over (order by s.points desc)::integer,
             null::numeric, null::integer, null::integer,
             null::numeric
      from public.students s
      where s.level = p_level and s.status = 'Active'
      order by s.points desc;
    return;
  end if;

  if p_period_type = 'week' then
    select wb.period_start, wb.period_end into v_start, v_end
      from public.week_bounds(coalesce(p_period_start, (now() at time zone 'Asia/Tashkent')::date)) wb;
    select wb.period_start, wb.period_end into v_prev_start, v_prev_end
      from public.week_bounds(v_start - 7) wb;
  elsif p_period_type = 'month' then
    select mb.period_start, mb.period_end into v_start, v_end
      from public.month_bounds(coalesce(p_period_start, (now() at time zone 'Asia/Tashkent')::date)) mb;
    select mb.period_start, mb.period_end into v_prev_start, v_prev_end
      from public.month_bounds((v_start - interval '1 day')::date) mb;
  else
    raise exception 'Invalid period type: %', p_period_type;
  end if;

  return query
  with current_totals as (
    select s.id as sid, s.real_name as rname,
           coalesce(sum(pt.points) filter (
             where pt.lesson_date between v_start and v_end and not pt.is_baseline
           ), 0) as pts
    from public.students s
    left join public.point_transactions pt on pt.student_id = s.id and pt.level = p_level
    where s.level = p_level and s.status = 'Active'
    group by s.id, s.real_name
  ),
  prev_totals as (
    select s.id as sid,
           coalesce(sum(pt.points) filter (
             where pt.lesson_date between v_prev_start and v_prev_end and not pt.is_baseline
           ), 0) as pts
    from public.students s
    left join public.point_transactions pt on pt.student_id = s.id and pt.level = p_level
    where s.level = p_level and s.status = 'Active'
    group by s.id
  ),
  attendance_rates as (
    select a.student_id as sid,
           round(100.0 * count(*) filter (where a.status in ('Present', 'Late')) / nullif(count(*), 0), 1) as rate
    from public.attendance a
    join public.students s on s.id = a.student_id
    where s.level = p_level and a.date between v_start and v_end
    group by a.student_id
  ),
  cur_ranked as (
    select sid, rname, pts, rank() over (order by pts desc) as rnk from current_totals
  ),
  prev_ranked as (
    select sid, pts, rank() over (order by pts desc) as rnk from prev_totals
  )
  -- rank_change = prev_rank - current_rank: positive means the student
  -- moved up (a better/lower rank number now), negative means they fell.
  select c.sid, c.rname, c.pts, c.rnk::integer,
         p.pts, p.rnk::integer,
         (p.rnk - c.rnk)::integer,
         ar.rate
  from cur_ranked c
  left join prev_ranked p on p.sid = c.sid
  left join attendance_rates ar on ar.sid = c.sid
  order by c.rnk;
end;
$$;

revoke execute on function public.get_group_leaderboard(text, text, date) from public;
grant execute on function public.get_group_leaderboard(text, text, date) to authenticated;

-- ---------- Per-student summary (PortalHome hero stat) ----------
create or replace function public.get_student_ranking_summary(p_student_id bigint)
returns table(
  level text,
  lifetime_points numeric,
  week_points numeric,
  month_points numeric,
  level_rank_all_time integer,
  level_rank_week integer,
  level_rank_month integer
)
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_level text;
  v_week_start date;
  v_week_end date;
  v_month_start date;
  v_month_end date;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in.';
  end if;

  select s.level into v_level from public.students s where s.id = p_student_id;
  if v_level is null then
    raise exception 'Student not found.';
  end if;

  if not (
    is_admin()
    or (is_teacher() and exists (
      select 1 from public.teacher_group_assignments tga
      where tga.teacher_id = auth.uid() and tga.level = v_level
    ))
    or exists (select 1 from public.students s where s.id = p_student_id and s.profile_id = auth.uid())
  ) then
    raise exception 'Not authorized to view this student.';
  end if;

  select wb.period_start, wb.period_end into v_week_start, v_week_end
    from public.week_bounds((now() at time zone 'Asia/Tashkent')::date) wb;
  select mb.period_start, mb.period_end into v_month_start, v_month_end
    from public.month_bounds((now() at time zone 'Asia/Tashkent')::date) mb;

  return query
  with all_time_rank as (
    select s.id, rank() over (order by s.points desc) as rnk
    from public.students s where s.level = v_level and s.status = 'Active'
  ),
  week_rank as (
    select s.id,
           rank() over (order by coalesce(sum(pt.points) filter (
             where pt.lesson_date between v_week_start and v_week_end and not pt.is_baseline
           ), 0) desc) as rnk
    from public.students s
    left join public.point_transactions pt on pt.student_id = s.id and pt.level = v_level
    where s.level = v_level and s.status = 'Active'
    group by s.id
  ),
  month_rank as (
    select s.id,
           rank() over (order by coalesce(sum(pt.points) filter (
             where pt.lesson_date between v_month_start and v_month_end and not pt.is_baseline
           ), 0) desc) as rnk
    from public.students s
    left join public.point_transactions pt on pt.student_id = s.id and pt.level = v_level
    where s.level = v_level and s.status = 'Active'
    group by s.id
  )
  select
    v_level,
    (select s.points from public.students s where s.id = p_student_id),
    (select coalesce(sum(points), 0) from public.point_transactions
       where student_id = p_student_id and lesson_date between v_week_start and v_week_end and not is_baseline),
    (select coalesce(sum(points), 0) from public.point_transactions
       where student_id = p_student_id and lesson_date between v_month_start and v_month_end and not is_baseline),
    (select rnk::integer from all_time_rank where id = p_student_id),
    (select rnk::integer from week_rank where id = p_student_id),
    (select rnk::integer from month_rank where id = p_student_id);
end;
$$;

revoke execute on function public.get_student_ranking_summary(bigint) from public;
grant execute on function public.get_student_ranking_summary(bigint) to authenticated;

-- ---------- Student-facing point history ----------
--
-- Deliberately narrower than the raw table: no awarded_by (teacher
-- identity), no category_key/category_id, no attendance_id, no
-- reversed_transaction_id - just what's motivational and honest for a
-- student to see. is_baseline rows are relabeled "Starting Points" rather
-- than exposing the migration internally.
create or replace function public.get_my_point_history()
returns table(
  lesson_date date,
  category_name text,
  category_icon text,
  reason text,
  points numeric,
  is_correction boolean
)
language sql
stable
security definer
set search_path = 'public'
as $$
  select pt.lesson_date,
         case when pt.is_baseline then 'Starting Points' else coalesce(pc.name, initcap(pt.category_key)) end,
         case when pt.is_baseline then '🌱' else coalesce(pc.icon, '➕') end,
         pt.reason,
         pt.points,
         pt.is_reversal
  from public.point_transactions pt
  left join public.point_categories pc on pc.id = pt.category_id
  join public.students s on s.id = pt.student_id
  where s.profile_id = auth.uid()
  order by pt.lesson_date desc, pt.created_at desc;
$$;

revoke execute on function public.get_my_point_history() from public;
grant execute on function public.get_my_point_history() to authenticated;

-- ---------- Recognition finalization ----------
--
-- Admin-triggered for this phase (no pg_cron dependency), but the
-- function itself takes no session-specific input beyond its arguments,
-- so a future scheduled job can call it identically with no schema
-- change - only an admin action needs to exist to wire that up, not a
-- redesign of this function.
--
-- Tie-break, exactly as approved: highest period points, then highest
-- count of distinct lesson_dates with a positive award, then highest
-- attendance rate. rank() (not row_number()) is what makes a genuine tie
-- survive all three criteria - it assigns every genuinely-tied student
-- the same rank 1, so all of them become co-winners (is_co_winner = true)
-- rather than one being arbitrarily chosen.
--
-- Re-finalizing an already-final period requires a non-empty p_reason;
-- the previous winner(s) are marked status = 'superseded' (never deleted
-- or overwritten) and the action is recorded in recognition_reopen_log.
create or replace function public.finalize_recognition(
  p_award_type text,
  p_level text,
  p_period_type text,
  p_period_start date,
  p_period_end date,
  p_reason text default null
)
returns table(student_id bigint, points numeric, is_co_winner boolean)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_existing_count integer;
begin
  if not is_admin() then
    raise exception 'Only administrators can finalize recognition awards.';
  end if;
  if p_award_type not in ('student_of_week', 'student_of_month') then
    raise exception 'finalize_recognition() only computes student_of_week/student_of_month in this phase.';
  end if;
  if p_level not in ('A', 'B', 'C') then
    raise exception 'Invalid level: %', p_level;
  end if;

  select count(*) into v_existing_count from public.recognition_awards
    where award_type = p_award_type and level = p_level
      and period_start = p_period_start and period_end = p_period_end and status = 'final';

  if v_existing_count > 0 then
    if p_reason is null or length(trim(p_reason)) = 0 then
      raise exception 'A reason is required to re-finalize an already-finalized period.';
    end if;
    update public.recognition_awards
      set status = 'superseded', superseded_at = now(), superseded_by = auth.uid()
      where award_type = p_award_type and level = p_level
        and period_start = p_period_start and period_end = p_period_end and status = 'final';
    insert into public.recognition_reopen_log
      (award_type, level, period_type, period_start, period_end, action, performed_by, reason)
      values (p_award_type, p_level, p_period_type, p_period_start, p_period_end, 'reopen_and_refinalize', auth.uid(), p_reason);
  else
    insert into public.recognition_reopen_log
      (award_type, level, period_type, period_start, period_end, action, performed_by, reason)
      values (p_award_type, p_level, p_period_type, p_period_start, p_period_end, 'finalize', auth.uid(), p_reason);
  end if;

  -- Plain insert (no RETURNING/RETURN QUERY combination here - kept
  -- simple and unambiguous rather than clever) followed by a separate
  -- read of exactly the batch just written. The partial unique index on
  -- recognition_awards guarantees only one 'final' batch can exist for
  -- this (award_type, level, period_start, period_end) at a time, and any
  -- prior batch was just superseded above, so this select can only see
  -- the rows this call inserted.
  with period_totals as (
    select pt.student_id as sid,
           sum(pt.points) as total_points,
           count(distinct pt.lesson_date) filter (where pt.points > 0) as active_days
    from public.point_transactions pt
    where pt.level = p_level
      and pt.lesson_date between p_period_start and p_period_end
      and not pt.is_baseline
    group by pt.student_id
  ),
  attendance_rates as (
    select a.student_id as sid,
           round(100.0 * count(*) filter (where a.status in ('Present', 'Late')) / nullif(count(*), 0), 1) as rate
    from public.attendance a
    join public.students s on s.id = a.student_id
    where s.level = p_level and a.date between p_period_start and p_period_end
    group by a.student_id
  ),
  ranked as (
    select pt.sid, pt.total_points, pt.active_days, coalesce(ar.rate, 0) as rate,
           rank() over (order by pt.total_points desc, pt.active_days desc, coalesce(ar.rate, 0) desc) as rnk
    from period_totals pt
    left join attendance_rates ar on ar.sid = pt.sid
    where pt.total_points > 0
  ),
  winners as (
    select sid, total_points, count(*) over () > 1 as co_winner
    from ranked
    where rnk = 1
  )
  insert into public.recognition_awards
    (award_type, level, period_type, period_start, period_end, student_id, points, is_co_winner, status, computed_by)
  select p_award_type, p_level, p_period_type, p_period_start, p_period_end, w.sid, w.total_points, w.co_winner, 'final', auth.uid()
  from winners w;

  return query
    select ra.student_id, ra.points, ra.is_co_winner
    from public.recognition_awards ra
    where ra.award_type = p_award_type and ra.level = p_level
      and ra.period_start = p_period_start and ra.period_end = p_period_end
      and ra.status = 'final';
end;
$$;

revoke execute on function public.finalize_recognition(text, text, text, date, date, text) from public;
grant execute on function public.finalize_recognition(text, text, text, date, date, text) to authenticated;
