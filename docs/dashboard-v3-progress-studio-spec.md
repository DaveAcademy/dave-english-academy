# Student Dashboard V3 — "Progress Studio" — Implementation Spec

Status: **spec only, no code changes**. Direction approved: V3-B from the V3 concept review.

## 1. Final layout structure (top to bottom)

1. **Hero card** — gradient `brand-50 → white` panel: avatar with level ring + level tag, name, group/level/status line, XP bar + "N XP to next level", rank, streak flame.
2. **KPI row** (4 cards) — Attendance, Homework, Exam average, Lessons completed. Each gets a status pill (`On track` / `Watch`) alongside the number, not color alone.
3. **Quick actions** — kept from the current dashboard (completeness requirement); not shown in the V3-B mockup but dropping it would be a regression, not a redesign choice.
4. **Achievements** — badge shelf, unlocked (gold) vs locked (dim), same 7 real badges from `utils/badges.js`.
5. **Insights + Leaderboard** (2-col ≥ lg, stacked below) — 2-3 real insight sentences next to a top-4 mini leaderboard with "you" pinned.
6. **Certificates + Upcoming lessons** (2-col ≥ lg, stacked below) — reuses existing certificate-badge and lesson-timeline patterns from the current dashboard.

## 2. Component list

| Component | New/Reused | Notes |
|---|---|---|
| `ProfileHeroCard` | **New** | Avatar + level ring + XP bar + streak + status. Replaces `DashboardHero` for this page. |
| `StatusPill` | **New** | Small `<span>`: `On track` (green) / `Watch` (gold) / `Needs attention` (red). Text + color, never color alone. |
| `BadgeShelf` | **New** | Extracted from the inline badge-row markup already written twice (PortalHome, PortalHomeV2) — third use is the point where it earns its own file. |
| `StatCard` | Reused | Add optional `pill` prop (renders `StatusPill` under the value) — additive, doesn't break Admin/Teacher usage. |
| `Panel` | Reused | Achievements/Certificates/Lessons/Leaderboard containers. |
| `SectionLabel` | Reused | Section headers. |
| `QuickActions` | Reused | Unchanged. |
| `AttentionCard` | Not used | Admin/Teacher-only pattern, not part of this page. |

## 3. Data required per component

All already loaded via `useAcademy()` + the existing `getLeaderboard()` call — **no new data source**.

| Component | Data |
|---|---|
| ProfileHeroCard | `students[0]` (name, level, group, status), `points`/`rank` from leaderboard, `stats.attendanceStreak` |
| KPI row | `stats.attendanceRate`, `stats.homeworkDoneRate`, `stats.examAvg`, `stats.lessonsCompleted` (+ trend where already computed) |
| Achievements | `computeBadges()` output (unchanged from Phase 2.1) |
| Insights | Same rule-based insights from `PortalHomeV2` (attendance trend, homework pending, exam average) — no new rules |
| Leaderboard | `getLeaderboard()`, top 4, "you" row highlighted |
| Certificates | `certificates` (existing, unchanged from current dashboard) |
| Upcoming lessons | `lessons` filtered to future + group/level match (existing logic, unchanged) |

## 4. Mobile responsiveness plan

- Hero card: avatar+level ring shrinks to the existing 56px size (matches current `StatCard` icon scale); XP bar and streak wrap under the name instead of sitting beside it.
- KPI row: `grid-cols-2` on mobile, `lg:grid-cols-4` — same breakpoint already used everywhere else in this codebase.
- Badge shelf: horizontal scroll on mobile (same pattern as `QuickActions`), wraps to a grid ≥ sm.
- Insights/Leaderboard and Certificates/Lessons: `grid gap-4 lg:grid-cols-2`, stacking below `lg` — identical to every existing 2-column section in `PortalHome.jsx`/`Dashboard.jsx`.
- No new breakpoints introduced; reuses the app's existing responsive vocabulary throughout.

## 5. Existing components/utils reused as-is

`StatCard` (extended, not replaced), `Panel`, `SectionLabel`, `QuickActions`, `utils/attendance.js`, `utils/date.js`, `utils/tone.js`, `utils/badges.js`.

## 6. New components to create

`src/components/ProfileHeroCard.jsx`, `src/components/StatusPill.jsx`, `src/components/BadgeShelf.jsx`.

## 7. Database/API changes needed

**None.** Every data point in this spec is already loaded by `useAcademy()` or the existing `getLeaderboard()` RPC. This is a presentation-layer rebuild of `PortalHome.jsx`, not a data-layer change.

Two known, unchanged limitations carried over from earlier work (not fixed by this spec, not blocking it either):
- "Rank" is all-time, not monthly — no monthly-reset ranking exists.
- Student of the Week/Month and Rising Star badges stay "coming soon" — they need the `student_points_snapshots` table from the Achievement Engine design doc, which is Core Development New's work, not this page's.

## Open implementation question

This spec assumes V3-B **replaces** the current `/` student dashboard (matching "final implementation," not another side-by-side route). If you actually want to keep comparing live a while longer, say so before I start — otherwise implementation will edit `PortalHome.jsx` directly and retire `PortalHomeV2.jsx`/`/dashboard-v2`.
