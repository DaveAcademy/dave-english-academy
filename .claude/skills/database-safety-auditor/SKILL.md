---
name: database-safety-auditor
description: >
  Automatic safety review for every Dave English Academy database change —
  new migration files under supabase/migrations/, edits to SQL functions,
  or any schema/RLS/policy change. Always run this before a migration is
  considered ready, and treat it as a hard gate, not advisory: never let a
  migration ship that weakens Row Level Security, removes a constraint, or
  changes a SECURITY DEFINER function's search_path without justification.
  Trigger on requests like "add a migration for X", "change this table",
  "add an RPC function", or "why is this query slow" when the query touches
  the database layer.
---

# Database Safety Auditor

## Purpose

This project's database is the source of truth for grading, points,
rankings, payments, and student records — and per project memory, this
environment's writes to production are blocked by design ([[dave-academy-supabase-prod-access]]),
meaning migrations only get one real shot at being correct before they
have to be pushed by an operator with prod access. A bad migration here
isn't a quick fix — it's a support ticket or a manual dashboard repair
later. This skill exists to catch problems while the migration is still a
draft, when fixing them costs nothing.

## When it activates

- A new file is being added to `supabase/migrations/`.
- An existing SQL function (especially anything `SECURITY DEFINER`, like
  the payment status functions in the 0055–0056 migration range) is being
  edited.
- RLS policies are being added, changed, or removed on any table.
- A query is reported as slow and the fix under discussion touches schema
  or indexing.

It does not activate for read-only `SELECT` queries used for debugging or
inspection — those carry no schema risk.

## What it checks

**Security (hard gate — never regress these):**
- RLS is enabled on every new table; policies exist for every role that
  needs access, and none are broader than necessary.
- `SECURITY DEFINER` functions pin `search_path` explicitly (this project
  has already had to harden a function for this — see migration 0056,
  "harden_payment_functions"). A `SECURITY DEFINER` function without a
  pinned `search_path` is a privilege-escalation risk, not a style nit.
- No policy or function change silently widens who can read or write
  sensitive data (payments, student PII, exam scores).

**Structural correctness:**
- Foreign keys exist where one table logically references another, with
  sensible `ON DELETE` behavior (don't let orphaned rows become the norm).
- Constraints (`NOT NULL`, `CHECK`, `UNIQUE`) match what the application
  layer already assumes — a missing constraint is a bug the UI won't catch.
- Indexes exist for columns the new/changed code will filter or join on,
  especially anything feeding `get_leaderboard()` or other aggregation
  functions in the grading → points → rankings chain.

**Migration safety:**
- The migration is additive/backward-compatible where possible (add
  column with default, backfill, then tighten — not add `NOT NULL` to a
  populated table in one step).
- There's a clear rollback path: what would undoing this migration require?
  If a migration is not realistically reversible (e.g. a destructive data
  transform), say so explicitly rather than letting it look reversible by
  default.
- The migration is compatible with existing production data shape and
  volume — check via `execute_sql`/`list_tables` (MCP, read-only) what the
  current data actually looks like rather than assuming.

**Performance:**
- New queries or functions this migration enables won't create N+1 access
  patterns or full-table scans on tables expected to grow (students,
  exam_scores, payment_transactions).

## What actions it takes

- Run this check against the migration draft before it's presented as
  ready. If everything passes, say so briefly — don't produce a full report
  for a clean migration.
- If a security item fails, block: state clearly that the migration should
  not proceed until fixed, and propose the fix. This is the one place in
  the suite where "defer this" is not an acceptable resolution without
  explicit user override.
- If a non-security item fails (missing index, no rollback plan), report it
  and let the user decide priority — these are real but not automatically
  blocking.

## Report format

```
🗄️ Database Safety Report — <migration file or function name>

Security: Pass / Issues found (list)
Structure: Pass / Issues found (list)
Rollback: <clear path — describe it, or "not reversible: <why>">
Performance: <any concern, or "no concern at this scale">

Blocking issues: <list, or "None">
```

## Examples

**Blocks:** a new `SECURITY DEFINER` function that reads `payment_transactions`
without pinning `search_path` → flag as blocking, matching the exact class
of issue migration 0056 already had to fix once.

**Non-blocking:** a new `lesson_quizzes` table with RLS and FKs correct, but
no index on `lesson_id` yet, at a table size where it doesn't matter yet →
report it, mark low priority, let the user decide.

**Doesn't trigger:** a one-off `SELECT count(*) FROM students` run to
answer a question — no schema risk, no migration involved.

## Thresholds

Security issues: always report, always blocking, no threshold. Performance
issues: only worth reporting if the table is already large (thousands of
rows) or is on the grading/points/payments hot path from
[[dave-academy-regression-checklist]] — a missing index on a rarely-queried
config table at current scale isn't worth interrupting for.

## Token usage rules

- Read only the migration file(s) actually being added or changed — not
  the full migration history — unless checking compatibility with an
  earlier migration specifically requires it.
- Use `list_tables` / `execute_sql` (Supabase MCP, read-only) for targeted
  schema lookups instead of guessing at current structure.
- Don't restate the full migration SQL back in the report — reference it by
  filename and line, the user has the file open.
