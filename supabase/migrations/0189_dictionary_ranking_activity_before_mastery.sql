-- Dictionary Ranking: let dictionary activity count before mastery.
--
-- Audit finding (2026-08-23): get_dictionary_leaderboard() filters
-- "and ps.mastered_words > 0", so a student who has started/reviewed
-- words but not yet mastered any never appears - and with the V1 SRS
-- mastery threshold at a ~90-day interval, that meant the ranking stays
-- empty academy-wide for months despite Learn/Review working. The
-- frontend already renders a per-row learning-words pill
-- (DictionaryTabs.jsx LeaderboardTab), so the UI contract always
-- anticipated non-mastered students appearing.
--
-- Changes (ranking metric redesign, minimal):
--   * learning_words now counts ALL started-but-not-mastered words
--     (NEW / LEARNING / REVIEWING / LAPSED) instead of only
--     LEARNING/REVIEWING - starting a word today is visible progress.
--   * Drop the mastered_words > 0 filter; any Active student with at
--     least one started word is ranked.
--   * Order: mastered DESC (mastery still dominates), then learning
--     DESC, then review accuracy DESC, then earliest mastery, then
--     student_id ASC so the order is fully deterministic. Anti-grind:
--     word starts are capped server-side at 10/day by
--     start_dictionary_words, and review volume is bounded by the SRS
--     schedule; no time-on-page or repeatable-action metric is used.
--
-- Deliberately NOT changed: returned column set (frontend contract),
-- SECURITY DEFINER + search_path, auth guard, level filter, academic
-- points system (this function reads only student_dictionary_words).
-- Privileges are untouched - CREATE OR REPLACE preserves ACLs and 0187's
-- authenticated-only grant stays in force. Written 2026-08-23; NOT yet
-- applied to production - pending explicit approval.

create or replace function public.get_dictionary_leaderboard(p_level text default null)
returns table (
  rank bigint,
  student_id bigint,
  real_name text,
  english_name text,
  level text,
  mastered_words bigint,
  learning_words bigint,
  accuracy numeric,
  last_mastered_at timestamptz
) language plpgsql stable security definer set search_path = public as $$
begin
  -- Any authenticated caller may view (same academy-wide convention as the
  -- game leaderboards); students see ranks/names only, never private rows.
  if not exists (select 1 from public.students where profile_id = auth.uid())
     and not (public.is_teacher() or public.is_admin()) then
    raise exception 'No student record for the current user';
  end if;

  return query
  with per_student as (
    select
      sdw.student_id,
      count(*) as total_started,
      count(*) filter (where sdw.state = 'MASTERED') as mastered_words,
      count(*) filter (where sdw.state <> 'MASTERED') as learning_words,
      coalesce(sum(sdw.times_seen), 0) as times_seen,
      coalesce(sum(sdw.times_correct), 0) as times_correct,
      max(sdw.mastered_at) as last_mastered_at
    from public.student_dictionary_words sdw
    group by sdw.student_id
  )
  select
    (row_number() over (
      order by ps.mastered_words desc,
               ps.learning_words desc,
               case when ps.times_seen > 0
                    then 1.0 * ps.times_correct / ps.times_seen else 0 end desc,
               ps.last_mastered_at asc nulls last,
               ps.student_id asc
    ))::bigint,
    s.id,
    s.real_name,
    s.english_name,
    s.level,
    ps.mastered_words,
    ps.learning_words,
    case when ps.times_seen > 0
      then round(100.0 * ps.times_correct / ps.times_seen, 1) else 0 end,
    ps.last_mastered_at
  from per_student ps
  join public.students s on s.id = ps.student_id
  where s.status = 'Active'
    and ps.total_started > 0
    and (p_level is null or s.level = p_level)
  order by 1;
end;
$$;
