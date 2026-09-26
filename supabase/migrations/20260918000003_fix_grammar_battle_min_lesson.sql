-- Fix remaining ambiguous min_lesson_number in get_grammar_battle_round
-- Previous fix qualified id but min_lesson_number in WHERE is still ambiguous
-- between RETURNS TABLE min_lesson_number and game_content_bank.min_lesson_number
create or replace function public.get_grammar_battle_round()
 returns table(round_id uuid, id uuid, question text, options jsonb, difficulty text, min_lesson_number integer, correct_index integer)
 language plpgsql
 stable
 set search_path to 'public'
as $function$
declare
  v_student_id bigint;
  v_current_level integer;
  v_max_lesson integer;
begin
  select s.id into v_student_id from public.students s where s.profile_id = auth.uid();
  if v_student_id is null then return; end if;
  select current_level into v_current_level from public.game_level_progress where student_id = v_student_id and game_type = 'grammar_battle';
  if v_current_level is null then v_current_level := 1; end if;
  v_max_lesson := greatest(1, least(100, (v_current_level * 5)));
  return query
  select
    gen_random_uuid() as round_id,
    game_content_bank.id,
    (payload->'question')::text as question,
    payload->'options' as options,
    (payload->'difficulty')::text as difficulty,
    (payload->'min_lesson_number')::integer as min_lesson_number,
    (payload->'correct_index')::integer as correct_index
  from public.game_content_bank
  where game_type = 'grammar_battle'
    and game_content_bank.min_lesson_number is not null
    and game_content_bank.min_lesson_number <= v_max_lesson
  order by
    case
      when (payload->'difficulty')::text = 'very_easy' then 1
      when (payload->'difficulty')::text = 'easy' then 2
      when (payload->'difficulty')::text = 'medium' then 3
      when (payload->'difficulty')::text = 'hard' then 4
      when (payload->'difficulty')::text = 'very_hard' then 5
    end,
    random()
  limit 1;
end;
$function$;

revoke execute on function public.get_grammar_battle_round() from public;
grant execute on function public.get_grammar_battle_round() to authenticated;
