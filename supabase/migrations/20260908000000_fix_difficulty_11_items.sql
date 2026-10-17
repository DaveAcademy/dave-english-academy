-- Fix: 11-item difficulty bug in get_round_difficulty
-- Previous version produced 11 total items for levels 11-30 (e.g., 10 Medium +1 Hard =11)
-- This corrects to exactly 10 items per round while preserving intended progression
-- Also fixes language sql -> plpgsql (was incorrectly sql with plpgsql body)

create or replace function public.get_round_difficulty(p_level integer)
returns table (easy_count integer, medium_count integer, hard_count integer, vh_count integer)
language plpgsql
immutable
set search_path to 'public'
as $$
begin
  if p_level < 1 then p_level := 1;
  elsif p_level > 100 then p_level := 100;
  end if;

  if p_level <= 10 then
    return query select (11 - p_level)::integer as easy_count,
                     (p_level - 1)::integer as medium_count,
                     0::integer as hard_count,
                     0::integer as vh_count;
  end if;

  if p_level <= 20 then
    return query select 0::integer as easy_count,
                     (20 - p_level)::integer as medium_count,
                     (p_level - 10)::integer as hard_count,
                     0::integer as vh_count;
  end if;

  if p_level <= 30 then
    return query select 0::integer as easy_count,
                     0::integer as medium_count,
                     (30 - p_level)::integer as hard_count,
                     (p_level - 20)::integer as vh_count;
  end if;

  return query select 0::integer as easy_count,
                  0::integer as medium_count,
                  0::integer as hard_count,
                  10::integer as vh_count;
end
$$;

-- Ensure the other duplicate definition in 20260903000000 is also fixed (same function, same bug)
-- The above CREATE OR REPLACE fixes both, but we explicitly handle the duplicate file's language issue
-- No additional action needed as both migrations define same function name

revoke execute on function public.get_round_difficulty(integer) from public;
grant execute on function public.get_round_difficulty(integer) to authenticated;

comment on function public.get_round_difficulty(integer) is 'Maps level 1-100 to Easy/Medium/Hard/VeryHard composition for 10-item rounds. Fixed 11-item bug for 11-30.';
