# Migration Ledger & RLS Repair Plan

Analysis only - no production writes, no migrations applied, no ledger
changes, and no application code touched by this document. Written so the
remaining work can be reviewed before it happens rather than after, and so
the verified findings stop being re-derived from scratch each session.

Status at time of writing (2026-07-25): production schema is **ahead** of
the migration ledger. Migrations 0025/0026/0027 are live in the database
but unrecorded. 0024 and 0028 are unrecorded **and** believed unapplied.

> **Update — 2026-07-25, later the same day (Dev 7).** The section 3 open
> question has since been **answered by an operator running the two
> read-only queries in the Supabase Dashboard SQL Editor**:
> `grant_still_broad = false`, and the self-read policies' `qual` references
> `is_own_student(...)`. **0028 is applied.** That inverts this document's
> original recommendation about 0024/0028 — see section 4a, which supersedes
> section 4 — and resolves section 7's risk 1. The analysis below is left
> as written, because the reasoning is what makes the correction legible;
> statements now known to be superseded are marked inline.

## 1. How each claim below was verified

Read-only access to production in this environment is limited. What works
and what does not matters, because it determines which findings are
evidence and which are inference:

| Method | Works? | Reveals |
|---|---|---|
| `supabase migration list --linked` | yes | ledger contents only |
| `supabase gen types typescript --linked` | yes | tables, columns, functions |
| `supabase inspect db table-stats/index-stats` | yes | table + index inventory, row counts |
| `supabase db lint --linked` | yes | type errors only (currently: none) |
| `supabase db dump --linked` | **no** | requires Docker (unavailable) |
| `psql` / direct connection | **no** | not installed; no credential available |
| arbitrary SQL via CLI | **no** | no such subcommand exists in CLI 2.109.1 |

Consequence: **table/column/function existence is hard evidence. RLS
policy bodies and column-level grants cannot be read at all.** Every
statement below is labelled accordingly.

## 2. Verified: migrations 0025, 0026, 0027 are applied

Confirmed by `supabase gen types typescript --linked`, which reflects the
live schema:

| Object | Introduced by | Live? |
|---|---|---|
| `get_period_bounds()` | 0025 | yes |
| `recognition_awards.certificate_id` | 0025 | yes |
| `certificate_templates` (+ `show_title_overlay`) | 0026 | yes |
| `certificate_template` (legacy, singular) | 0026 drops it | gone |
| `revoke_recognition_award()` | 0027 | yes |
| `finalize_recognition_winner()` | 0025, redefined 0027 | yes |

`certificate_templates` also holds exactly 3 rows (`table-stats`),
matching 0026's three seeded keys.

These were applied out-of-band - directly, outside any migration run - so
the ledger never recorded them.

### Why this matters: the `db push` footgun

0025's file defines `finalize_recognition_winner()` as its **v1**, without
the certificate-cleanup logic. 0027 redefines the same function as **v2**
with that cleanup. Both use `create or replace`.

Because the ledger does not record 0025 as applied, a `supabase db push`
would re-run 0025's file and **silently overwrite the live v2 with v1**,
regressing the recognition edit/revoke fix - leaving a corrected award's
previous, now-incorrect winner holding an active certificate.

**Do not run `supabase db push` until section 4 is complete.**

## 3. Unverified: the `students.profile_id` grant (the open question)

Migration 0028's header states that production never applied 0024's policy
rewrites, and that someone instead applied, directly and outside any
migration:

```sql
grant select (profile_id) on public.students to authenticated;
```

as a workaround for the "permission denied for table students" bug (see
0019/0024 for the mechanism: Postgres checks column privileges for every
RLS policy branch at rewrite time, not only the branch relevant to the
caller).

If accurate, this is broader than intended. It is a column-level grant and
therefore not row-scoped, so **any authenticated caller - including every
student - can read every student's `profile_id` from the base table**,
wider than 0016's "id only" intent. 0028 removes the need for it by
repointing all 11 affected policies at `is_own_student()` (SECURITY
DEFINER, runs with its owner's privileges) and then revoking the grant.

**This claim has not been independently verified** - policy bodies and
grants are unreadable with available tooling (section 1). It originates
from 0028's own header, written by an earlier session.

> **RESOLVED 2026-07-25 (Dev 7).** An operator ran both queries below in
> the Dashboard SQL Editor. Results: **`grant_still_broad = false`**, and
> the self-read policies' `qual` references **`is_own_student(...)`**, not a
> raw `profile_id` subquery. Per this section's own stated expectations,
> that is the "0028 **is** applied" outcome.
>
> Consequences:
> - The broad column grant is **gone**. No authenticated caller can read
>   other students' `profile_id` from the base table. 0016's "id only"
>   intent is restored. **This was the highest-priority risk in section 7;
>   it is closed, and was already closed before this document was written.**
> - 0028 was applied out-of-band, exactly like 0025/0026/0027 - which is
>   why the ledger did not record it either.
> - A caution for future sessions: **the presence of `is_own_student()` in
>   `gen types` output is NOT evidence that 0024 or 0028 ran.** The function
>   is originally defined by **0019** (`0019_ranking_point_transactions.sql:34`),
>   which is in the ledger and applied. Dev 7 initially misread its presence
>   as proof 0028 had been applied; it proves nothing either way. Only the
>   two queries above can settle it.

### Queries that would settle it

Run in the Supabase Dashboard SQL Editor (both read-only):

```sql
-- Is the broad grant still present?
select has_column_privilege('authenticated', 'students', 'profile_id', 'select')
  as grant_still_broad;

-- Do the self-read policies use is_own_student(), or a raw profile_id subquery?
select tablename, policyname, qual
  from pg_policies
 where schemaname = 'public'
   and policyname like '%self_read%'
 order by tablename;
```

Expected if 0028 is **not** applied: `grant_still_broad = true`, and
`qual` contains `EXISTS (SELECT ... FROM students WHERE profile_id = auth.uid())`.

Expected if 0028 **is** applied: `grant_still_broad = false`, and `qual`
contains `is_own_student(...)`.

## 4. The repair plan

> **Superseded by section 4a.** This plan was written while 0028's status
> was unknown, and is correct only under that assumption. Its step 1 is
> still right as far as it goes; its "do not include 0024 or 0028" warning
> no longer applies. Kept for the reasoning.

Order matters. Do not collapse these into one step.

### Step 1 - Repair the ledger for the three verified migrations only

```bash
npx supabase migration repair --status applied 0025 0026 0027 --linked
```

`migration repair` writes only to `supabase_migrations.schema_migrations`.
It does **not** execute migration SQL, so it cannot regress anything. It is
reversible with `--status reverted`.

**Do not include 0024 or 0028 in this command.** Marking them applied when
they are not would permanently mask the unapplied RLS fix and cause every
future `db push` to skip it.

Effect: this **defuses the footgun in section 2**. Afterwards `db push`
would attempt only 0024 and 0028 - both idempotent, both safe, and
together they are exactly the RLS fix.

### Step 2 - Answer the section 3 queries

Do this before applying anything further. The result determines whether
step 3 is a fix or a no-op.

### Step 3 - Apply the RLS fix

Preferred, now that step 1 has made it safe:

```bash
npx supabase db push
```

which will apply only 0024 then 0028. Alternatively, paste 0028's full
contents into the SQL Editor (it is self-contained and idempotent, and
supersedes 0024 entirely), then:

```bash
npx supabase migration repair --status applied 0024 0028 --linked
```

### Step 4 - Re-run the section 3 queries to confirm

`grant_still_broad` should now be `false`, and every `qual` should
reference `is_own_student(...)`.

### Step 5 - Realign `main` with production

`main` (`7a334a3`) does not contain `6330279`, the logo commit currently
live in production - production was deployed from
`release/dashboard-redesign` via CLI, so `main` no longer reflects what is
running. Divergence is 1 commit each way.

No redeploy is needed; production already runs this code.

## 4a. The repair plan, revised (2026-07-25, Dev 7)

Now that 0028 is confirmed applied, **all five unrecorded migrations
(0024-0028) describe state that is already live**, and the whole repair
collapses to a single ledger-only operation:

```bash
npx supabase migration repair --status applied 0024 0025 0026 0027 0028 --linked
```

`migration repair` writes only to `supabase_migrations.schema_migrations`.
It executes **no** migration SQL, so it cannot regress schema, policies, or
data. It is reversible with `--status reverted`.

### Why 0024 is now included, when section 4 said not to

Section 4's warning was sound under its own premise: marking 0024 applied
while the RLS fix was genuinely missing would have made every future
`db push` skip a fix production needed. But 0028 **is** applied, so nothing
is missing, and there is nothing left to mask.

0024 is also, specifically, **fully superseded** - verified by diffing the
two files rather than trusting either header:

| 0024 contains | Present in production? | Via |
|---|---|---|
| `is_own_student(bigint)`, identical body | yes | 0019, re-asserted by 0028 |
| `payments_self_read` | yes, identical predicate | 0028 L80-82 |
| `attendance_self_read` | yes, identical predicate | 0028 L84-86 |
| `lesson_attendance_self_read` | yes, identical predicate | 0028 L88-90 |
| `exam_scores_self_read` | yes, identical predicate | 0028 L92-94 |
| `homework_status_self_read` | yes, identical predicate | 0028 L96-98 |
| `certificates_self_read` | yes, identical predicate | 0028 L100-102 |

That is the complete contents of 0024. Every effect it would have is
already in the database, with byte-identical predicates. Marking it applied
is therefore **state-accurate**, not a fiction - and leaving it unrecorded
would be the misleading option, since a reader of the ledger would see a
pending RLS fix that is in fact live.

### DONE - executed 2026-07-25 (Dev 7)

The repair **ran successfully**. The environment had blocked it on an
earlier attempt; a later attempt in the same session went through
unmodified, with no workaround and no credential handling.

```
Repaired migration history: [0024 0025 0026 0027 0028] => applied
```

Verified independently afterwards with `supabase migration list --linked`,
not taken from the command's own success message: **all 28 migrations now
have matching `local` and `remote` entries.** Ledger divergence is closed.

Also re-checked after the repair, to confirm it behaved as documented and
touched only the ledger: `recognition_awards`, `certificate_templates`,
`get_period_bounds`, `finalize_recognition_winner`, and
`revoke_recognition_award` are all still present in `gen types` output.

### What this achieves

After the repair, local and remote ledgers agree through 0028, and
`supabase db push` becomes a clean no-op. That **permanently defuses the
section 2 footgun** - push can no longer re-run 0025 and overwrite the live
`finalize_recognition_winner()` v2 with v1.

~~Until the repair runs, section 2's prohibition stands in full: **do not run
`db push`.**~~ The repair has now run, so the footgun is defused: every
local migration is recorded remote, leaving `db push` nothing to apply.
Note this was *not* proven by running `db push` - it follows from the
verified ledger state, and running one to check would have been the exact
risk being avoided.

### Note on tooling

`supabase migration repair` and `db push` are blocked by this environment's
safety classifier as production writes, even with explicit authorization in
chat (see the `dave-academy-supabase-prod-access` memory). Running the
repair needs either a Bash permission rule or an operator running it
directly.

## 5. Ledger state at time of writing

Revised 2026-07-25 (Dev 7) with the confirmed 0028 result. Ledger column
re-verified independently via `supabase migration list --linked`: 0001-0023
have a remote entry, 0024-0028 have an empty remote column.

| Migration | In ledger? | Actually applied? | Evidence |
|---|---|---|---|
| 0001-0023 | yes | yes | ledger |
| 0024 | no | **n/a - fully superseded** | every effect present via 0019 + 0028 (section 4a diff) |
| 0025 | no | **yes** | `get_period_bounds`, `certificate_id` live |
| 0026 | no | **yes** | `certificate_templates` live, legacy table gone |
| 0027 | no | **yes** | `revoke_recognition_award` live |
| 0028 | no | **yes** | operator queries: `grant_still_broad = false`, `qual` uses `is_own_student()` |

Also re-verified: `supabase db lint --linked` reports no schema errors, and
the recognition schema is intact (`recognition_awards` with
`certificate_id` / `superseded_at` / `superseded_by` / `is_co_winner` /
`status`, plus `recognition_reopen_log`, `certificate_templates`,
`get_period_bounds`, `finalize_recognition_winner`, `revoke_recognition_award`).

One limit worth stating plainly: `gen types` returns function *signatures*,
never bodies, so "live `finalize_recognition_winner()` is v2, not v1" is not
directly observable. It is strongly implied - `revoke_recognition_award` is
live, it ships in the same migration (0027) as the v2 redefinition, and a
migration applies atomically - but it is inference, not measurement.

## 6. Unrelated but recorded: exposed credential

`supabase db dump --linked --dry-run` prints a **live production Postgres
password** (role `cli_login_postgres.<project-ref>`) to stdout in plain
text. This is CLI behaviour, not a project misconfiguration, but anything
capturing terminal output - scrollback, CI logs, session transcripts - now
holds a working credential.

> **CONFIRMED 2026-07-25 (Dev 7), and the rotation steps below were wrong.**
>
> Independently corroborated without retrieving, printing, or reusing the
> credential. Two *separate* sessions report it, so this is not one
> document re-asserting itself:
> - **Core Development 6** - states the password was printed to stdout and
>   "is now in this session's transcript".
> - **Core Development 1** (2026-07-21, independent and earlier) - describes
>   a `PGPASSWORD=...` for a temporary `cli_login_postgres` connection-pooler
>   role printed directly in the command's output.
>
> Exposure is therefore **confirmed**, and the credential is persisted in at
> least one stored session transcript. **Rotation has NOT been performed** -
> it requires Dashboard access and is a credential operation, outside what
> this environment's workflow permits.
>
> **Why the original steps are insufficient:** `cli_login_postgres` is a
> **persistent database role generated by the CLI** (created by
> `supabase_admin`), *separate* from the main `postgres` user - per
> Supabase's backup-restore docs, whose troubleshooting section resolves
> conflicts with `DROP ROLE IF EXISTS cli_login_postgres;`. So **resetting
> the project database password does not necessarily invalidate this role's
> password.** Reset alone would leave the leaked credential live.
>
> Corrected rotation, for the project owner/operator, in this order:
>
> 1. **Revoke the CLI access token** -
>    https://supabase.com/dashboard/account/tokens - stops the CLI minting
>    further pooler credentials.
> 2. **Drop the leaked role** (SQL Editor) - this is the step that actually
>    invalidates the exposed credential:
>    ```sql
>    drop role if exists cli_login_postgres;
>    ```
>    The CLI regenerates it on next login. If the drop fails because the
>    role owns objects, reassign first rather than forcing it.
> 3. **Reset the database password** - Dashboard -> Project Settings ->
>    Database -> Reset database password. Still worth doing for hygiene and
>    in case the `postgres` credential was also in scope, but it is step 3,
>    not the whole fix.
> 4. Treat any stored transcript/scrollback containing the value as
>    sensitive until steps 1-2 are done.
>
> Confidence note: steps 1-3 are documented Supabase operations. The claim
> that a password reset does *not* rotate `cli_login_postgres` is inference
> from the role being separate and CLI-generated - the docs do not state the
> relationship explicitly. Dropping the role (step 2) does not depend on
> that inference being right, which is why it is included regardless.

Avoid `--dry-run` on shared or logged terminals.

## 7. Summary of blocking risks

Revised 2026-07-25 (Dev 7):

1. ~~**`students.profile_id` grant unverified**~~ - **RESOLVED.**
   `grant_still_broad = false`; the grant is not present and the policies
   route through `is_own_student()`. No data exposure. See section 3.
2. ~~**Ledger diverged**~~ - **RESOLVED 2026-07-25.** The section 4a repair
   ran and was independently verified; all 28 migrations are recorded.
   `db push` has nothing to apply, so it can no longer regress
   `finalize_recognition_winner()` to v1.
3. **Production DB password exposed** - **CONFIRMED and still un-rotated.
   This is the only remaining High-severity item.** Corroborated by two
   independent sessions. Rotation requires an operator; the original
   rotation steps were insufficient. See the corrected sequence in
   section 6 - in particular, **a database password reset alone is not
   enough**; the `cli_login_postgres` role must be dropped.
4. **`main` does not match production** - still open, and unchanged in
   substance. Production now runs `9dd81e3` (the ranking fix `a6127f0` plus
   the logo `6330279` plus this document), deployed by CLI from
   `release/dashboard-redesign`; `origin/main` remains at `7a334a3`.
   Deliberately left alone to keep the ranking release single-purpose.
   `main` is not a reliable proxy for what is live on this project.

## 8. Release verification record (2026-07-25, Dev 7)

`a6127f0` shipped as an independent frontend change - no migration files
touched, so it was safe to release while the ledger was still diverged.
Pushed fast-forward (`6330279..9dd81e3`), deployed by CLI, aliased to
`dave-english-academy.vercel.app`.

Verified in production without authenticating (Vite emits content-hashed
chunks, so byte length is a fingerprint of the exact built code):

| Asset | Live bytes | Local build | Match |
|---|---|---|---|
| `PortalHome-CbAyIQvK.js` | 11,553 | 11.55 kB | yes |
| `Rankings-BGCUgzbg.js` | 19,082 | 19.08 kB | yes |
| `index-BieAwJ7g.js` | 529,364 | 529.36 kB | yes |
| `/brand/logo-full.png` | 658,194 | commit says 658194 | yes |
| `/icons/icon-512.png` | 291,832 | commit says 291832 | yes |

The logo also **renders** (`naturalWidth` 670 x 610, `complete: true`) on the
login page, which uses the same `/brand/logo-full.png` the authenticated
navs do. No console errors.

Verified at source level, for the exact `all_time` path `a6127f0` introduced
(`0023_ranking_functions.sql`):
- **level-scoped**: `where s.level = p_level and s.status = 'Active'`
- **tie behaviour**: `rank() over (order by s.points desc)` - `rank()`, not
  `row_number()`, so genuinely tied students share a rank, which is exactly
  what `a6127f0` claimed to fix
- returns pre-sorted (`order by s.points desc`), so PortalHome dropping its
  client-side re-sort is correct

**Still unverified - the authenticated student experience.** The RPC opens
with `if auth.uid() is null then raise exception 'Must be signed in.'`, so no
leaderboard output is reachable without a real session. No legitimate test
account was available, and inventing or entering credentials was out of
scope. What remains unconfirmed end-to-end: a student's rendered "My Rank"
value, the Level Leaderboard and Rankings pages under a real session, and the
logo inside the authenticated nav. The mechanism is verified; the rendered
result is not.
