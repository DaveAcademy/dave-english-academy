---
name: performance-watcher
description: >
  Runtime performance review for Dave English Academy — trigger when
  writing or editing React components/hooks, data-fetching code, or
  anything that runs in a loop over students/lessons/records. Watches for
  unnecessary re-renders, expensive hooks, repeated API calls, N+1 query
  patterns in application code, bundle size growth, duplicated
  computations, and unnecessary state. Only recommend a fix when the
  performance improvement is actually meaningful at this project's scale —
  don't flag micro-optimizations. Trigger on "why is this page slow",
  "this list is laggy", "add a hook for X", or after writing code that
  fetches data in a loop or map.
---

# Performance Watcher

## Purpose

This is the runtime-behavior counterpart to [[architecture-token-health-monitor]]
(which watches structural/token cost) and [[database-safety-auditor]]
(which watches schema-level query design). Performance Watcher owns what
actually happens when the app runs: React render behavior, network call
patterns, and bundle weight. The dashboard, rankings, and portal pages
aggregate a lot of per-student/per-lesson data — exactly where N+1 patterns
and re-render storms tend to hide.

## When it activates

- New or edited React components, especially ones rendering lists (student
  rosters, leaderboards, lesson lists) or receiving frequently-changing
  props.
- New or edited hooks, especially ones with `useEffect`/`useMemo`/
  `useCallback` dependencies.
- New or edited data-fetching code — anything calling Supabase from a
  component or hook.
- A user report that something feels slow or laggy.

Does not activate for changes with no runtime behavior (pure styling,
copy/text edits, migration-only changes already covered by
[[database-safety-auditor]]).

## What it checks

- **Unnecessary re-renders:** a component re-renders on prop/state changes
  it doesn't actually depend on, or a parent re-render cascades to children
  that could be memoized. Check with the actual render behavior (React
  DevTools or reasoning through dependency arrays), not a guess.
- **Expensive hooks:** a `useEffect` or `useMemo` recomputing something
  costly on every render because its dependency array is wrong or missing,
  or doing work that doesn't need to be in a hook at all.
- **Repeated API calls:** the same data fetched more than once for one page
  load — e.g. two sibling components each independently fetching the same
  student record instead of sharing one fetch/cache.
- **N+1 in application code:** a loop over students/lessons/records that
  issues one query per item instead of one batched query — this is the
  app-layer version of the N+1 risk [[database-safety-auditor]] checks for
  at the schema level; this skill catches it in the calling code even when
  the query itself is fine.
- **Bundle size:** a new dependency or a large import (e.g. importing an
  entire library for one function) that meaningfully grows the bundle.
- **Duplicated computations:** the same derived value calculated in
  multiple places instead of once and reused/memoized.
- **Unnecessary state:** state that could be derived from existing
  props/state instead of duplicated into its own `useState`, which then
  needs to be kept in sync.

## What actions it takes

Recommend a fix only when it would produce a noticeable improvement — a
component that re-renders an extra time on a page with 5 stat cards is not
worth interrupting for; a leaderboard re-fetching all students on every
keystroke of an unrelated filter is. If nothing meaningful turns up, say
nothing extra and continue — this skill should be silent far more often
than it reports.

## Report format

```
⚡ Performance Note — <component/hook/page>

Pattern: <what's happening>
Cost: <concrete effect — extra renders, N queries instead of 1, bundle +X — not vague "could be slow">
Recommendation: <fix, or "defer — not meaningful at current scale">
Priority: High / Medium / Low
```

## Examples

**Reports:** `Rankings.jsx` fetches each student's point history in a
`.map()` with one query per student instead of one batched query against
`get_leaderboard()` → N+1, High priority given this is a hot path in
[[dave-academy-regression-checklist]]'s grading chain.

**Doesn't report:** a settings page with three static fields re-renders an
extra time when an unrelated context value changes — real but has no
observable cost to a handful of static fields.

**Defers:** a dashboard chart recomputes a derived total on every render
instead of memoizing it — flag it, but mark Low/defer since the dataset is
small enough that the recompute cost is negligible today.

## Thresholds

Worth reporting: patterns affecting pages with real per-student or
per-record iteration (rosters, rankings, dashboards), or anything the user
already reported as feeling slow. Not worth reporting: single extra
re-renders on small, static, or rarely-visited pages, or bundle growth from
a dependency that's actually needed and reasonably sized.

## Token usage rules

- Reason about render/query behavior from the code you already have open
  rather than re-reading the whole component tree.
- When checking for repeated fetches across components, grep for the
  specific query/table name rather than reading every data-fetching file.
- Keep the report to the pattern and fix — skip general React performance
  explanations the user doesn't need repeated.
