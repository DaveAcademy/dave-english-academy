# Migration Reconciliation — 2026-08-15

Goal: make the local `supabase/migrations/` git history accurately represent
what is actually live in production (project `usqzcsoolkbuxyiiawmx`), without
modifying any already-correct production behavior. This is documentation and
a `git add`/commit only — no `apply_migration`, no `db push`, no schema or
data changes were made as part of this reconciliation.

## Files committed by this reconciliation

All of the following were already applied directly to production (via the
Supabase MCP `apply_migration` path, not `supabase db push`) in earlier
sessions, but had never been committed to git. Content was verified against
the live database immediately before committing — see per-file notes below.

**Standard-numbered files, content matches an exact known prod migration:**
- `0126_enforce_lesson_pacing_on_progress_writes.sql` — verified byte-for-byte
  against live `student_lesson_progress` RLS policies immediately before this
  commit (`student_lesson_progress_self_insert`/`_self_update` `with_check`
  expressions match exactly). This is the standing "never touch" file from
  the lesson-pacing RLS fix — committed as-is, untouched.
- `0127_ranking_summary_level_scoped_lifetime.sql` — matches prod migration
  `20260814125736`.
- `0128_drop_dead_get_leaderboard.sql` — matches `20260814130512`.
- `0129_ranking_carries_lifetime_points_across_promotion.sql` — matches
  `20260814131112`.
- `0130_homework_file_upload_requires_active_student.sql` — matches
  `20260814132909`.
- `0137_class_group_class_session.sql` — matches `20260815112642` (applied
  this session, Ranking V2 foundation).
- `0138_point_transactions_class_session_id.sql` — matches `20260815113007`
  (applied this session, Ranking V2 foundation).

**`PROD_RECONCILED_*` files — reconstructed documentation, not original
source, confidence stated in each file's own header:**
- `PROD_RECONCILED_20260815092610_monthly_ranking_includes_all_categories.sql`
  — recovered current live function definitions directly (high confidence).
- `PROD_RECONCILED_20260815093941_reverse_august_exam_points_per_owner_request.sql`
  — reconstructed from resulting `point_transactions` row data (71 rows).
- `PROD_RECONCILED_20260815094736_reverse_august_achievement_points_per_owner_request.sql`
  — reconstructed from resulting row data (131 rows).
- `PROD_RECONCILED_20260815095157_pause_automatic_point_awards.sql` —
  recovered current live function definition, matches an inline author
  comment dated the same day (high confidence).
- `PROD_RECONCILED_20260815101344_reverse_hanna_redundant_manual_level_transfer.sql`
  — reconstructed from resulting row data (2 rows, near-exact).

These use the `PROD_RECONCILED_<prod_timestamp>_<name>` naming scheme rather
than a numbered prefix because `0131`–`0136` were already taken locally by an
unrelated, already-completed teacher-authorization remediation batch (applied
2026-08-14, different timestamps — no real conflict, since the true migration
identity in Supabase is the timestamp, not the embedded number, but reusing
those numbers here would be confusing).

## Deliberately absent: prod migration `0131` (timestamp `20260815085701`,
`monthly_ranking_includes_penalty_category`)

No local file exists for this one, on purpose. It was fully superseded by
`0132` one minute later, and left no distinct trace in the current live
function state — there is nothing to recover or reconstruct from, and
fabricating plausible-looking SQL for it would misrepresent history rather
than document it. Its existence and fate are recorded here instead.

## What this reconciliation did NOT do

- Did not renumber, rename, or edit the content of any existing committed
  migration file.
- Did not run any migration against production.
- Did not touch `point_transactions`, `students`, or any other data.
- Did not touch Ranking V2, Student Portal design, or Recognition-flow code
  — this is a git-history-only cleanup task, kept deliberately separate from
  those workstreams per standing instruction.
