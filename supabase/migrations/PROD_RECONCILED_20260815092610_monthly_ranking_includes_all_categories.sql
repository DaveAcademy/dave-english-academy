-- RECONCILIATION ARTIFACT — DOCUMENTATION ONLY. NOT APPLIED VIA `supabase db push`.
-- Original prod migration: 20260815092610_0132_monthly_ranking_includes_all_categories
-- (applied directly to project usqzcsoolkbuxyiiawmx, no local file existed).
-- Confidence: RECOVERED-CURRENT-LIVE-DEFINITION.
--   The exact original migration body could not be retrieved (Supabase MCP does not
--   expose historical migration SQL text, only version/name via list_migrations).
--   What follows is the CURRENT live `CREATE OR REPLACE FUNCTION` source for the two
--   ranking functions, pulled via pg_get_functiondef(). Both currently sum
--   point_transactions with NO category_id/category_key filter at all — i.e. "all
--   categories" — which matches the name/intent of this migration and is presumed to
--   be its result. This is NOT necessarily byte-identical to the original migration
--   file (e.g. it may have folded in later unrelated edits), but it is the accurate
--   CURRENT deployed behavior.
-- Local files 0131_monthly_ranking_includes_penalty_category (prod ts 20260815085701)
-- is a DIFFERENT, EARLIER migration in the same short sequence and was judged
-- UNRECOVERABLE (see report) because its intermediate state left no distinct trace
-- once 0132 superseded it — do not confuse it with local git's unrelated
-- 0131_exam_scores_teacher_level_scope.sql (different project, different timestamp).

CREATE OR REPLACE FUNCTION public.get_student_ranking_summary(p_student_id bigint)
 RETURNS TABLE(level text, lifetime_points numeric, week_points numeric, month_points numeric, level_rank_all_time integer, level_rank_week integer, level_rank_month integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
         and pt.lesson_date between v_month_start and v_month_end and not pt.is_baseline),
    (select rnk::integer from all_time_rank where id = p_student_id),
    (select rnk::integer from week_rank where id = p_student_id),
    (select rnk::integer from month_rank where id = p_student_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_group_leaderboard(p_level text, p_period_type text, p_period_start date DEFAULT NULL::date)
 RETURNS TABLE(student_id bigint, real_name text, points numeric, rank integer, prev_points numeric, prev_rank integer, rank_change integer, attendance_rate numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
