-- RECONCILIATION ARTIFACT — DOCUMENTATION ONLY. NOT APPLIED VIA `supabase db push`.
-- Original prod migration: 20260815095157_0135_pause_automatic_point_awards
-- (applied directly to project usqzcsoolkbuxyiiawmx, no local file existed).
-- Confidence: RECOVERED-CURRENT-LIVE-DEFINITION (high confidence).
--   The live function body contains an inline comment left by the original
--   migration author dated 2026-08-15 explicitly describing this exact change,
--   so the reconstruction below is very likely near-identical to the original
--   migration's intent, even though the literal DDL text of the original
--   migration file itself could not be retrieved from Supabase (list_migrations
--   only exposes version/name, not SQL text).
-- Effect: achievement badges still unlock (student_achievements insert kept),
-- but the point-award side effect of achievement unlocking was removed —
-- automatic point awards from achievements are paused. Attendance/lesson-progress/
-- lesson-work triggers still call _evaluate_achievements_internal(), which itself
-- no longer awards points.

CREATE OR REPLACE FUNCTION public._evaluate_achievements_internal(p_student_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_level text;
  v_points numeric;
  r record;
  v_qualifies boolean;
  v_inserted integer;
begin
  select level, points into v_level, v_points from public.students where id = p_student_id;
  if v_level is null then
    return;
  end if;

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

    -- Point-award block intentionally removed (owner request, 2026-08-15):
    -- badges still unlock above, but no point_transactions row is
    -- created for them while automatic point awards are paused.
  end loop;
end;
$function$;
