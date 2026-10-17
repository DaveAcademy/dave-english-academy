-- XP Levels: deterministic progression from total XP
-- XP is separate from Points (10 per correct normal, 5 hint). XP is 10 per valid game completion.
-- Thresholds chosen to be simple, explainable, and grow: early levels fast (10-15 games), later slower, no 100-level RPG.
-- One authoritative source: xp_level_for() + get_my_xp_progress(). No scattered JS thresholds.

-- Core function: maps total XP to level and thresholds
-- Levels 1-10 defined explicitly, 11+ unbounded via formula (avoids migration per level)
create or replace function public.xp_level_for(total_xp integer)
returns table (level integer, current_level_xp integer, next_level_xp integer)
language sql
immutable
as $$
  select
    case
      when total_xp < 100 then 1
      when total_xp < 250 then 2
      when total_xp < 500 then 3
      when total_xp < 800 then 4
      when total_xp < 1200 then 5
      when total_xp < 1700 then 6
      when total_xp < 2300 then 7
      when total_xp < 3000 then 8
      when total_xp < 3800 then 9
      when total_xp < 4700 then 10
      else greatest(11, 11 + ((total_xp - 4700) / 900)::int)
    end as level,
    case
      when total_xp < 100 then 0
      when total_xp < 250 then 100
      when total_xp < 500 then 250
      when total_xp < 800 then 500
      when total_xp < 1200 then 800
      when total_xp < 1700 then 1200
      when total_xp < 2300 then 1700
      when total_xp < 3000 then 2300
      when total_xp < 3800 then 3000
      when total_xp < 4700 then 3800
      else 4700 + (((total_xp - 4700) / 900)::int * 900)
    end as current_level_xp,
    case
      when total_xp < 100 then 100
      when total_xp < 250 then 250
      when total_xp < 500 then 500
      when total_xp < 800 then 800
      when total_xp < 1200 then 1200
      when total_xp < 1700 then 1700
      when total_xp < 2300 then 2300
      when total_xp < 3000 then 3000
      when total_xp < 3800 then 3800
      when total_xp < 4700 then 4700
      else 4700 + ((((total_xp - 4700) / 900)::int + 1) * 900)
    end as next_level_xp
$$;
comment on function public.xp_level_for(integer) is 'XP 1:0, 2:100, 3:250, 4:500, 5:800, 6:1200, 7:1700, 8:2300, 9:3000, 10:3800, 11+:4700+900*n. Deterministic, no table.';

-- Single authoritative progression response
create or replace function public.get_my_xp_progress()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_total integer;
  v_level integer;
  v_cur integer;
  v_next integer;
  v_into integer;
  v_remaining integer;
  v_percent numeric;
  v_is_max boolean := false;
begin
  select coalesce(sum(amount),0)::integer into v_total from public.student_xp_transactions where student_id = (select id from public.students where profile_id = auth.uid());

  select level, current_level_xp, next_level_xp into v_level, v_cur, v_next from public.xp_level_for(v_total);

  -- For 11+ unbounded, there is no max; but we treat as not max (progress always toward next 900)
  -- If we ever cap, set v_is_max when total_xp >= max threshold and next_level_xp = current_level_xp
  v_into := v_total - v_cur;
  v_remaining := v_next - v_total;
  if v_next = v_cur then
    v_percent := 100;
    v_is_max := true;
  elsif v_next > v_cur then
    v_percent := least(100, greatest(0, (v_into::numeric / (v_next - v_cur)::numeric) * 100));
  else
    v_percent := 0;
  end if;

  -- Handle exact threshold boundary: if total == next, we are at next level with 0% (already handled by xp_level_for)
  -- xp_level_for returns next level when total >= threshold, so progress 0% correctly

  return jsonb_build_object(
    'total_xp', v_total,
    'level', v_level,
    'current_level_xp', v_cur,
    'next_level_xp', v_next,
    'xp_into_level', v_into,
    'xp_remaining', v_remaining,
    'progress_percent', round(v_percent::numeric,1),
    'is_max', v_is_max
  );
end;
$$;
revoke execute on function public.get_my_xp_progress() from public;
grant execute on function public.get_my_xp_progress() to authenticated;
comment on function public.get_my_xp_progress() is 'Authoritative XP progression: total, level, current/next thresholds, xp_into/remaining, progress %. From ledger SUM, deterministic xp_level_for.';

-- For admin/teacher to view another student's progression (with checks)
create or replace function public.get_student_xp_progress(p_student_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_total integer;
  v_level integer;
  v_cur integer;
  v_next integer;
  v_into integer;
  v_remaining integer;
  v_percent numeric;
begin
  if not (public.is_own_student(p_student_id) or is_admin() or is_teacher()) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  select coalesce(sum(amount),0)::integer into v_total from public.student_xp_transactions where student_id = p_student_id;
  select level, current_level_xp, next_level_xp into v_level, v_cur, v_next from public.xp_level_for(v_total);
  v_into := v_total - v_cur;
  v_remaining := v_next - v_total;
  if v_next > v_cur then v_percent := least(100, greatest(0, (v_into::numeric / (v_next - v_cur)::numeric) * 100)); else v_percent := 100; end if;
  return jsonb_build_object('total_xp', v_total, 'level', v_level, 'current_level_xp', v_cur, 'next_level_xp', v_next, 'xp_into_level', v_into, 'xp_remaining', v_remaining, 'progress_percent', round(v_percent::numeric,1));
end;
$$;
revoke execute on function public.get_student_xp_progress(bigint) from public;
grant execute on function public.get_student_xp_progress(bigint) to authenticated;
