# Student Portal Design System Cleanup — 2026-08-15

Scope: `StatusPill` vs `TONE` unification, shared `ErrorBanner`, card-idiom consistency in `MyProgress`, and loading states for `MyProgress`/`MyHomework`/`MyCertificates`. No ranking logic, RPCs, `MyRanking` data behavior, admin `Rankings.jsx`, `PointsSummary.jsx`, or migrations touched.

## 1. StatusPill vs TONE — resolved
`StatusPill.jsx` previously defined its own `good/watch/attention/info` color map, coincidentally identical in hex-equivalent classes to `utils/tone.js`'s `success/warning/danger/info`. Rewrote it to source colors directly from `TONE`, with a back-compat `ALIAS` (`good→success`, `watch→warning`, `attention→danger`) so every existing call site (`PortalHomeV3.jsx`, `Students.jsx`, `MyProgress.jsx`) renders byte-identical classes — verified by comparing old/new class strings per tone, zero visual change. `MyHomework.jsx`'s inline third pill implementation (raw span + local `TONE` lookup) was replaced with `<StatusPill tone={...}>`, so there is now exactly one status-pill code path in the app instead of three.

## 2. Shared ErrorBanner — extracted
New `src/components/ErrorBanner.jsx`, identical markup/classes to the duplicated JSX in `MyHomework.jsx`/`MyCertificates.jsx` (`rounded-lg border border-inactive/30 bg-inactive/5 px-4 py-3 text-sm text-inactive`), renders `null` when empty. Both pages now render `<ErrorBanner>{errorState}</ErrorBanner>` instead of a copy-pasted conditional div. The other ~16 files app-wide using this same class combination (admin pages) were **not** touched — out of scope for this session.

## 3. Card-system consistency — MyProgress
Added `border border-ink/[0.06]` (+ `sm:p-4` bump where padding was still `p-3`) to the previously un-bordered cards: attendance-history rows, exam-score rows, the lesson-progress info bar, and both empty states — bringing them in line with `Panel`/`StatCard`/Phase 1's list-row idiom. `MyRanking`, `MyHomework`, `MyCertificates` were already consistent from prior sessions; not modified here (`MyRanking.jsx` currently has separate in-flight Ranking V2 changes — untouched by this session, see boundary note below). Did **not** force the Attendance History/Exam Scores lists into `StatCard` (they're lists of records, not KPIs) or `Panel` (would diverge from the bare-header list pattern already established in `MyHomework`/`MyCertificates`) — kept the existing section shape, just fixed the card idiom.

## 4. Loading states — added
Discovered `useAcademy()` already exposes a `loading` boolean (`src/lib/useAcademyData.js:826`) that no portal page was reading. Added a new shared `src/components/Skeleton.jsx` (`SkeletonList`/`SkeletonCard`/`SkeletonLine`), visually identical pulse pattern to `AttentionCard`'s existing private `SkeletonRows` (`animate-pulse rounded bg-ink/5`) — reusing the established treatment rather than inventing a new one. Wired into:
- `MyHomework.jsx` — skeleton before the homework list
- `MyCertificates.jsx` — skeleton before the certificate list
- `MyProgress.jsx` — skeleton for Attendance History, the Homework Progress `Panel`, and Exam Scores **only** — deliberately did not touch the top KPI `StatCard` grid, since `points`/`rank` there come from `getGroupLeaderboard()` (ranking data), which is out of scope this session.

## 5. Mobile review (static only — no test account)
Reused Phase 1's verified patterns (`border-ink/[0.06]`, `sm:p-4`, `break-words`/`min-w-0` on titles) for every card touched in this session, so no new responsive risk was introduced. Checked specifically:
- Attendance/exam row cards: `flex items-center justify-between` with fixed-width status text on the right — short, bounded content (date + one-word status), no long-string overflow risk found.
- Homework Progress panel rows (inside `Panel`, unchanged structure) — already used `StatusPill`, now the canonical one; no layout change.
- Skeleton cards inherit the same bordered/padded shape as their loaded-state counterparts, so no layout shift between loading → loaded.

**Not browser-verified** — no student test account available this session either; verification here is static code review + successful build, recorded explicitly rather than claimed as visual confirmation.

## Boundary confirmation
- `admin Rankings.jsx`: untouched.
- Ranking V2 RPCs / ranking calculation logic: untouched.
- `PointsSummary.jsx`: untouched (pre-existing, from the separate Ranking V2 session).
- `MyRanking.jsx` ranking data/RPC behavior: untouched — file has unrelated in-flight changes from the Ranking V2 session (now using `PointsSummary`) not committed as part of this design session.
- Migrations/deployment: untouched.
- `npm run build`: passes.
- `git diff --check`: passes (only CRLF-on-checkout warnings, no real whitespace errors).
