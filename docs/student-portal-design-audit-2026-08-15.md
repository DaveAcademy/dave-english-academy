# Student Portal Design Audit — 2026-08-15

Scope: `src/pages/portal/` (PortalHomeV3, MyRanking, MyProgress, MyHomework, MyCertificates, +GameCenter skim). Read-only audit, no code changed.

## Current strengths (preserve these)
- A real token system exists: `tailwind.config.js` defines `ink`/`paper`/`brand` 50-700/`active`/`inactive`/`levelA-C`, plus `font-display` (Sora) / `font-body` (Inter) and a `shadow-card` token.
- `src/utils/tone.js` maps 6 semantic tones (success/warning/danger/info/brand/neutral) consistently into `StatCard`, `AttentionCard`, `StatusPill`, `Badge`.
- A real shared component set already exists: `StatCard`, `Panel`, `SectionLabel`, `Badge` (`LevelBadge`/`StatusBadge`), `BadgeShelf`, `StatusPill`, `ProfileHeroCard`, `QuickActions`, `AttentionCard` (has proper skeleton+empty state), `GameCard`.
- `PortalHomeV3` and `GameCenter` are the strongest pages today — good component reuse, gradient hero/CTA styling, hover/lift micro-interactions (`GameCard`: `hover:-translate-y-1 hover:shadow-lg transition-transform`).
- `AttentionCard` shows the right pattern for loading/empty states (animated skeleton) — just not used everywhere.

## Current weaknesses (harm student experience)
1. **Two competing card idioms.** The "real" system (`border border-ink/[0.06] bg-white shadow-card`) vs. an ad-hoc idiom used in MyRanking/MyProgress lists/MyHomework/MyCertificates (`rounded-xl bg-white p-3 shadow-card`, no border) — copy-pasted per page instead of one shared `ListRow` component.
2. **Status pills implemented 3 different ways**: `StatusPill.jsx`, `Badge.jsx`'s `StatusBadge`, and raw inline ternary classes in `MyHomework` — same visual concept, three code paths, guaranteed to drift.
3. **Error banner copy-pasted verbatim** in `MyHomework` and `MyCertificates` (`rounded-lg border border-inactive/30 bg-inactive/5 ... text-inactive`) — not componentized.
4. **Loading states are inconsistent**: `AttentionCard` has a real skeleton; `MyRanking` uses plain "Loading…" text; `MyProgress`/`MyHomework`/`MyCertificates` have **no loading state at all**.
5. **Animation is concentrated on 2 of 7 pages** (PortalHomeV3, GameCenter/GameCard). MyProgress, MyHomework, MyCertificates have zero transitions — progress/points changes, homework status, and certificate reveals all feel inert.
6. **Responsive coverage is uneven**: PortalHomeV3 (8 breakpoint classes) and MyRanking (6) are responsive-aware; MyProgress is thin (2); **MyHomework and MyCertificates have zero responsive breakpoint classes** — pure flex-wrap reliance, unverified on mobile.
7. **Achievements render through two different UI patterns**: `BadgeShelf` (compact shelf, on Home/Progress) vs. a separate larger achievement-card grid inside `MyRanking` — inconsistent visual language for the same concept.
8. **No dedicated Attendance page** — attendance lives only inside `MyProgress` (history list + `StatCard`) and a `StatusPill` on Home. That's a reasonable IA choice, not a defect, but the history list uses the ad-hoc card idiom (#1) with no loading state.
9. **MyRanking's own KPI cards don't use `StatCard`** despite being conceptually identical (points summary is hand-rolled JSX) — biggest single inconsistency given ranking is meant to be the flagship experience.

## Priority improvements
**Critical**
- Unify the two card idioms into one shared list-row/card component; migrate MyRanking, MyProgress, MyHomework, MyCertificates onto it.
- Fix MyHomework/MyCertificates having zero responsive classes — verify and fix mobile layout (touch targets, wrapping, overflow).
- Extract the duplicated error banner into a shared `ErrorBanner`/`Alert` component.

**High**
- Consolidate status-pill logic onto `StatusPill`/`Badge` everywhere; remove MyHomework's inline ternary duplicate.
- Bring MyRanking's points-summary cards onto `StatCard` (ranking is meant to be the flagship page — currently the least componentized).
- Add consistent loading states (reuse `AttentionCard`'s skeleton pattern) to MyProgress/MyHomework/MyCertificates.

**Medium**
- Unify achievements presentation (BadgeShelf vs. MyRanking's grid) — pick one pattern, likely BadgeShelf for compact + a dedicated expand for locked/earned detail.
- Add subtle micro-interactions to MyProgress/MyHomework/MyCertificates (progress bar fill, status change, submission success) matching PortalHomeV3/GameCard's existing motion language — no new animation system needed, same Tailwind transition utilities already in use.

**Low**
- Standardize card spacing (`p-3` vs `p-4`/`p-5` sm-bump) across list rows.

## Proposed design system (formalize what mostly already exists)
- **Colors**: keep existing `brand`/`ink`/`paper`/`active`/`inactive`/`levelA-C` tokens — no new palette needed. Reuse `tone.js` mapping for all semantic coloring (success/warning/danger/info/brand/neutral); stop introducing new inline color combos.
- **Typography**: `font-display` (Sora) for page titles/section headers/big numbers (points, rank); `font-body` (Inter) for everything else. Ranking numbers and point totals should get one standardized large/bold treatment (currently ad-hoc per page).
- **Spacing**: standardize card padding to `p-4` (`sm:p-5`) everywhere list rows currently use `p-3`; keep existing grid-gap conventions from PortalHomeV3.
- **Components to formalize**:
  - `ListRow` / `SimpleCard` — replaces the ad-hoc `rounded-xl bg-white p-3 shadow-card` idiom (adds the missing border + becomes the one card primitive alongside `StatCard`/`Panel`).
  - `ErrorBanner` — extracted from MyHomework/MyCertificates duplicate.
  - `Skeleton`/loading pattern — extracted from `AttentionCard` for reuse.
  - Unify `StatusPill`/`StatusBadge` usage (pick one, deprecate the other or make one wrap the other).
- **Interaction principles**: motion communicates state change only (points ticking up, rank moving, achievement unlock, submission success) — extend the existing `transition-transform`/`hover:-translate-y-1` vocabulary already proven on `GameCard`; nothing new to introduce.

## Page-by-page plan
1. **Student Home** (`PortalHomeV3`) — already strongest; minor: componentize the two ad-hoc gradient CTA banners.
2. **Rankings** (`MyRanking`) — highest-impact target: migrate points-summary to `StatCard`, awards/achievements cards to the new `ListRow`, add skeleton loading, keep leaderboard logic untouched.
3. **Progress** (`MyProgress`) — migrate attendance-history rows to `ListRow`, add loading skeleton, add subtle animation to progress bars.
4. **Homework** (`MyHomework`) — fix responsive gap (currently zero breakpoints), replace inline status-pill logic with `StatusPill`, extract `ErrorBanner`.
5. **Achievements** — reconcile `BadgeShelf` vs. MyRanking's achievement grid into one pattern.
6. **Attendance** — no dedicated page (by design); improve the existing history list inside MyProgress only.
7. **Certificates** (`MyCertificates`) — fix zero responsive classes, extract `ErrorBanner`, no loading state currently — add one.

## Explicit non-scope / dependencies
- No changes to ranking RPC math, `class_session` architecture, point calculations, or auth — confirmed nothing here requires backend changes.
- Note: admin `src/pages/Rankings.jsx` currently has unrelated uncommitted WIP (class_session leaderboard work) — left untouched, not part of this audit.
