# Architecture

Confirmed technical architecture only. See `PROJECT-HANDOFF.md` for product-level status and `DATABASE.md` for schema/RPC detail.

## 1. Stack (confirmed-current)

- **Frontend:** React 18.3 + Vite 5, `react-router-dom` v6 for routing, Tailwind CSS for styling, `i18next`/`react-i18next` for EN/UZ localization.
- **Backend:** Supabase (managed Postgres + Auth + Storage + Realtime not currently used). No custom backend server — all server-side logic lives in Postgres as SECURITY DEFINER RPC functions, gated by Row Level Security (RLS).
- **Hosting:** Vercel (`vercel.json` present, SPA rewrite configured; project `dave-english-academy`, team `student-management-system2`).
- **PWA:** `vite-plugin-pwa` present — service worker + installable app. `/install` is a public route (rendered outside auth) with an explicit Install App button (`beforeinstallprompt`), installed-state detection, and manual Android/Chrome fallback instructions. Production-verified 2026-08-17 (commit `d22a885`, live at `dave-english-academy.vercel.app`): `/install` renders correctly, manifest serves valid JSON, service worker reaches `activated` state, `/` login route unaffected. Real Android/Chrome install + home-screen launch + session-persistence has **not** been tested on a physical device — remains an open verification gap. See `DEPLOYMENT.md` for the stale-cache caveat.
- **PDF generation:** `jspdf` + `jspdf-autotable` (reports, certificates) and `pdf-lib`/`pdfjs-dist` (lesson PDFs, file handling) — client-side, no server PDF service.

## 2. Frontend structure

```
src/
  App.jsx            route table (React Router)
  pages/             admin-facing pages (Students, Rankings, Payments, Reports, ...)
  pages/portal/       student-facing portal pages (PortalHomeV3, GameCenter, the 9 game pages, MyRanking, MyProgress, ...)
  components/        shared UI (StatCard, Panel, PortalNav, ...)
  hooks/              data hooks (useAcademy(), useAcademyData.js, ...)
  lib/storageBridge.js  the single client<->Supabase glue layer: every RPC call and table read/write goes through here
  utils/              client-side helpers (badges.js, attendance.js, date.js, tone.js, points.js [legacy, unused])
  i18n/, locales/     EN/UZ translation resources
```

**Key convention:** `src/lib/storageBridge.js` is the sole data-access layer. Pages do not call `supabase.from(...)` or `supabase.rpc(...)` directly in most cases — they call a named function in `storageBridge.js` (e.g. `awardPoints()`, `getGroupLeaderboard()`, `submitGameRound()`). This is the boundary to check first when tracing any data flow.

## 3. Auth & authorization

- Supabase Auth (email/password) issues a session; `auth.uid()` is the RLS identity primitive throughout.
- Roles are modeled as `is_admin()`, `is_teacher()`, `is_own_student()` — SECURITY DEFINER SQL helper functions used inside RLS policies and inside RPC bodies, not as a separate app-level roles table read by the frontend.
- **Teacher scoping:** as of migrations 0131-0136, teacher RLS on the 6 most sensitive academic tables (exam_scores, homework, lesson_work, student_lesson_progress, attendance, certificates) is scoped by level via `teacher_group_assignments`, not just `is_teacher()`. Prior to that remediation, 15 tables were gated by role alone with no level/group scope — see `DATABASE.md` §RLS principles for what remains role-only by design (e.g. points/achievements, which were already correctly scoped).
- **Student scoping:** `is_own_student(student_id)` — a SECURITY DEFINER function — is the standard predicate for "this row belongs to the calling student," used instead of raw `profile_id` subqueries after a documented RLS hardening pass (`docs/migration-ledger-and-rls-repair-plan.md`).

## 4. RPC architecture

Nearly all writes and non-trivial reads go through Postgres functions (`SECURITY DEFINER`), not raw table access from the client:

- **Grading/scoring RPCs re-validate everything server-side.** Example: `submit_game_round()` re-checks every submitted answer against `lesson_vocabulary`/`game_content_bank` before writing a score — the client-supplied score is never trusted directly.
- **Points are never client-writable.** `point_transactions` has INSERT/SELECT RLS only (no UPDATE/DELETE for any role); `students.points` is a trigger-maintained cache, and the base table's `UPDATE` grant is revoked for the `points` column academy-wide, including for admins acting through the client.
- **Ranking/leaderboard reads are also RPC-mediated** (`get_group_leaderboard`, `get_student_ranking_summary`, `get_game_best_records`, etc.) rather than raw `select *` from ranking tables, so rank/tie logic (`rank()` window function, not `row_number()`) lives in one place.

See `DATABASE.md` for the concrete RPC inventory.

## 5. Frontend/backend boundary

- The frontend never computes anything that affects points, rankings, grading, or achievement unlocks — it only displays what an RPC returns. Client-side "scoring" in game UIs is provisional/optimistic display only; the authoritative score comes back from `submit_game_round()`.
- Curriculum gating (which lessons/vocabulary/game content a student can currently access) is computed server-side via helper functions (`student_unlocked_lesson_number()`, `student_available_vocabulary()`, `min_lesson_number` filters) — the frontend requests a round/lesson and receives only what's already eligible; it does not filter a full dataset client-side.
- Client-side computed values that are *deliberately* not persisted or authoritative: attendance streak (`PortalHomeV3.jsx`, recomputed every render), the frontend-only badge system (`src/utils/badges.js`, `computeBadges()`).

## 6. Key shared components

- `StatCard`, `Panel`, `SectionLabel` — the portal's card/section idiom, reused across admin and student pages (see `docs/dashboard-v3-progress-studio-spec.md` for the convention's origin).
- `PortalNav.jsx` — student portal navigation, includes the Game Center entry.
- `GameCenter.jsx` — hub page for all 9 games; fetches best-scores for all games in parallel (`Promise.all`), not sequentially.

## 7. Major data flows

**Game round (representative of the RPC pattern used throughout):**
```
student -> GameCenter/<Game>.jsx -> get_<game>_round() RPC
        -> server selects content (curriculum-gated: student_available_vocabulary() / min_lesson_number)
        -> student answers in-browser (local state only, no persistence)
        -> submit_game_round(game_type, answers) RPC
              re-validates every answer server-side
              writes game_sessions (score, level tag since 0149)
              upserts game_word_history
              bump_student_metric() -> evaluate_achievements()
        -> no direct write to point_transactions or students.points
```

**Points award:**
```
admin/teacher -> Rankings.jsx -> awardPoints()/bulkAwardPoints() [storageBridge.js]
              -> INSERT into point_transactions (append-only ledger)
                    BEFORE INSERT trigger validates level match
              -> AFTER INSERT trigger refreshes students.points cache
              -> Ranking RPCs (get_group_leaderboard, etc.) read the ledger live for period totals,
                 the cache for all-time
```

See `RANKING-SYSTEM.md` and `GAMING-SYSTEM.md` for the full detail behind each flow.

## 8. What is explicitly NOT part of the architecture

- No custom Node/Express backend — all server logic is Postgres functions.
- No message queue, no background job runner, no server-side cron found in the app codebase (payment reminders are triggered from an admin UI action, not a scheduled job — see `PAYMENTS.md`).
- No mobile native app — PWA installability is the mobile story.
