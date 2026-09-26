-- Owl 500-Point Collection: deterministic milestones 100/200/300/400/500
-- Points source: point_transactions ledger via students.points cache (legitimate Points already deduped)
-- No new tables; derive from authoritative points; auto-unlocked by threshold, no manual claim needed
-- Parts: Head(100), Body(200), Wings(300), Eyes(400), Complete(500) — maps to existing pet_parts if present, else virtual

create or replace function get_owl_progress()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_student_id bigint; v_points int; v_milestones int[] := array[100,200,300,400,500];
declare v_parts jsonb := '[]'::jsonb; m int; unlocked bool;
begin
  select s.id into v_student_id from students s where s.profile_id=auth.uid();
  if v_student_id is null then raise exception 'No linked student' using errcode='42501'; end if;
  select coalesce(points,0)::int into v_points from students where id=v_student_id;
  -- also ensure game_points counted? Students.points already includes all point_transactions; game points are separate ledger, but spec says Academy Points → Owl, which is point_transactions. Keep as is.
  foreach m in array v_milestones loop
    unlocked := v_points >= m;
    v_parts := v_parts || jsonb_build_object(
      'milestone', m,
      'name', case m when 100 then 'Head' when 200 then 'Body' when 300 then 'Wings' when 400 then 'Eyes' else 'Complete' end,
      'icon', case m when 100 then '🦉' when 200 then '🪶' when 300 then '🪽' when 400 then '👁️' else '✨' end,
      'unlocked', unlocked,
      'points_needed', case when unlocked then 0 else m - v_points end
    );
  end loop;
  return jsonb_build_object(
    'points', v_points,
    'total_needed', 500,
    'remaining', greatest(0, 500 - v_points),
    'complete', v_points >= 500,
    'parts', v_parts,
    'next_milestone', (select min(x) from unnest(v_milestones) x where x > v_points)
  );
end $$;
revoke execute on function get_owl_progress() from public;
grant execute on function get_owl_progress() to authenticated;

create or replace function get_student_owl_progress(p_student_id bigint)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_points int; v_milestones int[] := array[100,200,300,400,500]; v_parts jsonb := '[]'::jsonb; m int; unlocked bool;
begin
  if not (is_own_student(p_student_id) or is_admin() or is_teacher()) then raise exception 'Not authorized' using errcode='42501'; end if;
  select coalesce(points,0)::int into v_points from students where id=p_student_id;
  foreach m in array v_milestones loop
    unlocked := v_points >= m;
    v_parts := v_parts || jsonb_build_object('milestone',m,'name',case m when 100 then 'Head' when 200 then 'Body' when 300 then 'Wings' when 400 then 'Eyes' else 'Complete' end,'icon',case m when 100 then '🦉' when 200 then '🪶' when 300 then '🪽' when 400 then '👁️' else '✨' end,'unlocked',unlocked,'points_needed',case when unlocked then 0 else m - v_points end);
  end loop;
  return jsonb_build_object('points',v_points,'total_needed',500,'remaining',greatest(0,500-v_points),'complete',v_points>=500,'parts',v_parts);
end $$;
revoke execute on function get_student_owl_progress(bigint) from public;
grant execute on function get_student_owl_progress(bigint) to authenticated;
