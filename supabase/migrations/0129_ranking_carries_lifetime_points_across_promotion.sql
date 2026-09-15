-- Promotion & Ranking Rules decision (explicit product decision, not a
-- coding defect - see the Points & Ranking Consistency Audit and its
-- follow-up): when a student is promoted A -> B, their ranking inside B
-- must carry their lifetime points forward, not reset to a fresh
-- within-B total. Promotion changes who you compete against (population:
-- s.level = p_level), not how much you've earned (score: every
-- point_transaction the student has, regardless of which level it was
-- logged under).
--
-- Both ranking functions previously joined point_transactions with
-- `and pt.level = p_level` / `and pt.level = v_level` - a level-scoped
-- SUM, not just a level-scoped population. That is what "fresh start"
-- would mean, and it is the opposite of the decision above. This removes
-- the level restriction from every points SUM/join in both functions,
-- while leaving the `where s.level = p_level and s.status = 'Active'`
-- filter untouched - that's the population filter (who you're ranked
-- against: your current classmates), and it was already correct.
--
-- This also applies to week/month rankings for the same reason: if a
-- student is promoted mid-week, points they earned this week under their
-- old level must still count toward this week's total for their new
-- cohort - the promotion boundary shouldn't create a gap in periodic
-- totals either.
--
-- attendance_rate / lifetime_attendance are untouched - attendance rows
-- are tied to the level a student was actually in at that lesson and
-- were never level-filtered on point_transactions to begin with; nothing
-- about the promotion decision changes them.
--
-- 0127 (which aligned get_student_ranking_summary's lifetime_points to
-- match its own level_rank_all_time) is superseded by this migration -
-- that fix was correct under the previous "fresh start" assumption; the
-- product decision has now reversed, so both the summary and the
-- leaderboard move to "lifetime points, current-level population"
-- together, keeping them consistent with each other exactly as before.

create or replace function public.get_group_leaderboard(p_level text, p_period_type text, p_period_start date default null::date)
returns table(student_id bigint, real_name text, points numeric, rank integer, prev_points numeric, prev_rank integer, rank_change integer, attendance_rate numeric)
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
  if p_level not in ('A', 'A1', 'B', 'C') then
    raise exception 'Invalid level: %', p_level;
  end if;

  if p_period_type = 'all_time' then
    return query
    with lifetime_totals as (
      select s.id as sid, s.real_name as rname,
             coalesce(sum(pt.points), 0) as pts
      from public.students s
      left join public.point_transactions pt on pt.student_id = s.id
      where s.level = p_level and s.status = 'Active'
      group by s.id, s.real_name
    ),
    lifetime_attendance as (
      select a.student_id as sid,
             round(100.0 * count(*) filter (where a.status in ('Present', 'Late')) / nullif(count(*), 0), 1) as rate
      from public.attendance a
      join public.students s on s.id = a.student_id
      where s.level = p_level
      group by a.student_id
    ),
    lt_ranked as (
      select sid, rname, pts, rank() over (order by pts desc) as rnk from lifetime_totals
    )
    select lt.sid, lt.rname, lt.pts, lt.rnk::integer,
           null::numeric, null::integer, null::integer,
           la.rate
    from lt_ranked lt
    left join lifetime_attendance la on la.sid = lt.sid
    order by lt.rnk;
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
               and (p_period_type <> 'month' or pt.category_key = 'bonus')
           ), 0) as pts
    from public.students s
    left join public.point_transactions pt on pt.student_id = s.id
    where s.level = p_level and s.status = 'Active'
    group by s.id, s.real_name
  ),
  prev_totals as (
    select s.id as sid,
           coalesce(sum(pt.points) filter (
             where pt.lesson_date between v_prev_start and v_prev_end and not pt.is_baseline
               and (p_period_type <> 'month' or pt.category_key = 'bonus')
           ), 0) as pts
    from public.students s
    left join public.point_transactions pt on pt.student_id = s.id
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

create or replace function public.get_student_ranking_summary(p_student_id bigint)
returns table(level text, lifetime_points numeric, week_points numeric, month_points numeric, level_rank_all_time integer, level_rank_week integer, level_rank_month integer)
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
    select s.id,
           rank() over (order by coalesce(sum(pt.points), 0) desc) as rnk
    from public.students s
    left join public.point_transactions pt on pt.student_id = s.id
    where s.level = v_level and s.status = 'Active'
    group by s.id
  ),
  week_rank as (
    select s.id,
           rank() over (order by coalesce(sum(pt.points) filter (
             where pt.lesson_date between v_week_start and v_week_end and not pt.is_baseline
           ), 0) desc) as rnk
    from public.students s
    left join public.point_transactions pt on pt.student_id = s.id
    where s.level = v_level and s.status = 'Active'
    group by s.id
  ),
  month_rank as (
    select s.id,
           rank() over (order by coalesce(sum(pt.points) filter (
             where pt.lesson_date between v_month_start and v_month_end and not pt.is_baseline
               and pt.category_key = 'bonus'
           ), 0) desc) as rnk
    from public.students s
    left join public.point_transactions pt on pt.student_id = s.id
    where s.level = v_level and s.status = 'Active'
    group by s.id
  )
  select
    v_level,
    (select coalesce(sum(pt.points), 0) from public.point_transactions pt
       where pt.student_id = p_student_id),
    (select coalesce(sum(pt.points), 0) from public.point_transactions pt
       where pt.student_id = p_student_id
         and pt.lesson_date between v_week_start and v_week_end and not pt.is_baseline),
    (select coalesce(sum(pt.points), 0) from public.point_transactions pt
       where pt.student_id = p_student_id
         and pt.lesson_date between v_month_start and v_month_end and not pt.is_baseline
         and pt.category_key = 'bonus'),
    (select rnk::integer from all_time_rank where id = p_student_id),
    (select rnk::integer from week_rank where id = p_student_id),
    (select rnk::integer from month_rank where id = p_student_id);
end;
$$;
