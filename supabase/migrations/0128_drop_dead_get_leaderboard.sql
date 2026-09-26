-- get_leaderboard() (0008) is dead: it returns students.points (the
-- global, all-level cache) with no level filter, and every frontend
-- caller has since migrated to the level-scoped get_group_leaderboard()
-- (0023) - Dashboard, My Ranking, and My Progress all call that instead
-- (see the Points & Ranking Consistency Audit; confirmed zero remaining
-- frontend references to getLeaderboard()/get_leaderboard before this
-- migration). Left in place, it's a live landmine: a future page could
-- reach for the "obvious" get_leaderboard() name and silently reintroduce
-- an unscoped, promotion-inconsistent ranking. Dropping it removes that
-- path entirely rather than leaving unreachable-but-callable dead logic
-- around. No table/data change - a single function drop.

drop function if exists public.get_leaderboard();
