-- C1 (Critical) + H1 (High), Student Achievements & Milestones Integrity
-- Audit: evaluate_achievements(bigint) is SECURITY DEFINER with EXECUTE
-- granted to anon/authenticated - it runs with elevated privileges and
-- never checked that the caller was authorized for the supplied
-- p_student_id before inserting into student_achievements, bypassing that
-- table's otherwise-correct RLS entirely. It also gated bonus-point
-- authorization on is_own_student() rather than is_own_active_student(),
-- letting an inactive student collect new achievement points for
-- themselves - the same gap already closed everywhere else in migration
-- 0123.
--
-- Fix shape: split into a checked public wrapper and an unchecked internal
-- worker, rather than adding the caller check directly to the one
-- function. Reason: three SECURITY DEFINER triggers
-- (on_attendance_evaluate_achievements, on_lesson_progress_evaluate_achievements,
-- on_lesson_work_submission_evaluate_achievements) call evaluate_achievements()
-- as a side effect of an already-authorized write to a *different* table.
-- attendance_teacher_mark lets any teacher (not level-scoped) mark any
-- student's attendance - if the outer caller-authorization guard applied
-- to trigger-fired calls too, a teacher marking attendance for a student
-- outside their own assigned level would silently stop that student's
-- achievements from being evaluated at all, which never happened before
-- this fix. The public RPC surface (what a browser/API client can call
-- directly) is the actual attack surface C1 addresses; trigger-internal
-- calls are server-initiated and were never part of that surface.
--
-- public.evaluate_achievements(bigint): unchanged signature (still the
-- only variant granted/called anywhere), now checks the caller is the
-- student themselves (any status - historical/own evaluation always
-- allowed, matching the "self access stays, new earning doesn't" pattern
-- used everywhere else this academy enforces active-status), an admin, or
-- a teacher assigned to that student's level - silent no-op otherwise,
-- same style as the pre-existing v_level-null guard, not an exception.
-- Delegates to the internal worker when authorized.
--
-- public._evaluate_achievements_internal(bigint): the original
-- qualification/award loop, unchanged except is_own_student() ->
-- is_own_active_student() in v_points_authorized (H1) - so a caller
-- context that resolves to an inactive student's own account never
-- authorizes bonus points, regardless of whether that call came through
-- the public wrapper or a trigger. Not exposed to anon/authenticated -
-- only reachable via the checked wrapper or the three trigger functions
-- (which run as the trigger's own SECURITY DEFINER owner).
--
-- Also revokes anon EXECUTE on the public wrapper: no unauthenticated
-- caller has any legitimate reason to invoke this - real usage is either
-- a signed-in student's own action or the three triggers, none of which
-- are anon.

create or replace function public._evaluate_achievements_internal(p_student_id bigint)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_level text;
  v_points numeric;
  v_points_authorized boolean;
  r record;
  v_qualifies boolean;
  v_inserted integer;
  v_txn_id bigint;
begin
  select level, points into v_level, v_points from public.students where id = p_student_id;
  if v_level is null then
    return;
  end if;

  v_points_authorized := is_admin()
    or public.is_own_active_student(p_student_id)
    or (is_teacher() and exists (
      select 1 from public.teacher_group_assignments tga
      where tga.teacher_id = auth.uid() and tga.level = v_level
    ));

  for r in
    select d.* from public.achievement_definitions d
    where d.active
      and d.trigger_type in ('immediate_event', 'threshold')
      and not exists (
        select 1 from public.student_achievements sa
        where sa.student_id = p_student_id and sa.achievement_id = d.id
      )
  loop
    if r.rule_config->>'metric' = 'total_points' then
      v_qualifies := v_points >= (r.rule_config->>'value')::numeric;
    else
      v_qualifies := exists (
        select 1 from public.student_metric_snapshots m
        where m.student_id = p_student_id
          and m.metric_key = r.rule_config->>'metric'
          and m.value >= (r.rule_config->>'value')::numeric
      );
    end if;

    if not v_qualifies then
      continue;
    end if;

    insert into public.student_achievements (student_id, achievement_id)
    values (p_student_id, r.id)
    on conflict (student_id, achievement_id) do nothing;
    get diagnostics v_inserted = row_count;

    if v_inserted = 0 then
      continue;
    end if;

    if r.bonus_points > 0 and v_points_authorized then
      insert into public.point_transactions (
        student_id, level, category_id, category_key, points, reason, is_baseline, awarded_by
      )
      values (
        p_student_id, v_level,
        (select id from public.point_categories where key = 'achievement_bonus'),
        'achievement_bonus', r.bonus_points, r.name, false, auth.uid()
      )
      returning id into v_txn_id;

      update public.student_achievements
        set point_transaction_id = v_txn_id
        where student_id = p_student_id and achievement_id = r.id;
    end if;
  end loop;
end;
$function$;

revoke all on function public._evaluate_achievements_internal(bigint) from public, anon, authenticated;

create or replace function public.evaluate_achievements(p_student_id bigint)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_level text;
  v_authorized_caller boolean;
begin
  select level into v_level from public.students where id = p_student_id;
  if v_level is null then
    return;
  end if;

  v_authorized_caller := public.is_own_student(p_student_id)
    or is_admin()
    or (is_teacher() and exists (
      select 1 from public.teacher_group_assignments tga
      where tga.teacher_id = auth.uid() and tga.level = v_level
    ));

  if not v_authorized_caller then
    return;
  end if;

  perform public._evaluate_achievements_internal(p_student_id);
end;
$function$;

revoke execute on function public.evaluate_achievements(bigint) from anon;

create or replace function public.on_attendance_evaluate_achievements()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.status = 'Present' then
    perform public.bump_student_metric(new.student_id, 'attendance_present', 1);
    perform public._evaluate_achievements_internal(new.student_id);
  end if;
  return new;
end;
$function$;

create or replace function public.on_lesson_progress_evaluate_achievements()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
    perform public.bump_student_metric(new.student_id, 'lessons_completed', 1);
    perform public._evaluate_achievements_internal(new.student_id);
  end if;
  return new;
end;
$function$;

create or replace function public.on_lesson_work_submission_evaluate_achievements()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.bump_student_metric(new.student_id, 'practice_submitted', 1);
  perform public._evaluate_achievements_internal(new.student_id);
  return new;
end;
$function$;
