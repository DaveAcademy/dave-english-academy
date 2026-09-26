-- Ranking V2: give point_transactions the capability to reference a
-- class_session. Pure schema capability -- no backfill, no trigger
-- changes, no RPC changes, no behavior change of any kind.
--
-- Per design (docs/ranking-v2-class-session-design.md §5, reaffirmed
-- 2026-08-15): historical rows are never retroactively assigned a
-- session. This column starts and stays NULL for every existing row;
-- it will only be populated going forward, by the not-yet-built
-- session-creation/award-attachment workflow (a separate change).

alter table public.point_transactions
  add column class_session_id bigint references public.class_session(id);

create index point_transactions_class_session_id_idx
  on public.point_transactions (class_session_id);
