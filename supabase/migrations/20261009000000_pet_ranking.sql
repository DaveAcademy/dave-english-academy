-- Pet Ranking: cross-student leaderboard by premium pets owned.
--
-- Read-only. Returns display name + owned count only (no emails, payments,
-- purchase history, or other private fields). Same access pattern as the
-- group/class leaderboards: SECURITY DEFINER, revoked from anon/public,
-- granted to authenticated.
--
-- Source of truth for "pets owned": premium_pet_ownership rows (one per
-- student per unlocked catalogue pet). Catalogue-only or never-owned pets
-- are not counted. Pet XP / game points are not used as the score.
-- Population mirrors leaderboard convention: Active students, academy-wide
-- (pets are not level-scoped). Ties share a rank via rank().
create or replace function public.get_pet_ranking()
returns table(student_id bigint, real_name text, pets_owned integer, rank integer)
language plpgsql
stable
security definer
set search_path = 'public'
as $$
begin
  if auth.uid() is null then
    raise exception 'Must be signed in.';
  end if;

  return query
  with counts as (
    select s.id as sid, s.real_name as rname,
           count(o.pet_key)::integer as owned
      from public.students s
      left join public.premium_pet_ownership o on o.student_id = s.id
     where s.status = 'Active'
     group by s.id, s.real_name
  ),
  ranked as (
    select sid, rname, owned, rank() over (order by owned desc) as rnk
      from counts
  )
  select r.sid, r.rname, r.owned, r.rnk::integer
    from ranked r
   order by r.rnk, r.rname;
end $$;

revoke execute on function public.get_pet_ranking() from anon;
revoke execute on function public.get_pet_ranking() from public;
grant execute on function public.get_pet_ranking() to authenticated;
