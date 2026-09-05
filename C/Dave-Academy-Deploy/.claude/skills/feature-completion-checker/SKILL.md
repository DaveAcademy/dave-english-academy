---
name: feature-completion-checker
description: >
  Verifies a Dave English Academy feature is actually finished before it's
  reported as done. Trigger whenever a feature or task is about to be
  described as complete, or when the user asks "is this actually done" or
  "what's left on this". Scans the changed code for TODOs, placeholders,
  temporary/debug code, hidden or commented-out routes, incomplete
  implementations, forgotten edge cases, and unfinished UI states (empty,
  loading, error) — the gaps that don't show up in a happy-path demo but
  surface later as bugs.
---

# Feature Completion Checker

## Purpose

"It works" after a happy-path click-through and "it's done" are different
claims. This skill is the check between them — specifically for the code
touched in the current task, not a general repo sweep. It complements
[[code-cleanup-assistant]] (which finds debt in code nobody's actively
working on) by focusing on debt just introduced in the feature being
finished right now, while it's still cheap to close the gap.

## When it activates

Right before a feature, fix, or task is described to the user as complete
— this should run as part of wrapping up, not as a separate ask. Also
activates on direct questions like "is this really finished" or "what edge
cases am I missing."

## What it checks

Scoped to the files actually changed for this feature:

- **TODOs/FIXMEs:** any left in the new/changed code, even ones added
  intentionally as a note-to-self.
- **Placeholders:** hardcoded sample data, lorem-ipsum-style text, or a
  stubbed function that returns a fixed value instead of doing the real
  work.
- **Temporary code:** anything added to make testing easier that shouldn't
  ship — a bypassed check, a hardcoded test student ID, a `console.log`
  left in from debugging.
- **Hidden or commented-out routes:** a route registered but not linked
  anywhere, or commented out "for now" — either ship it properly or remove
  it, don't leave it half-wired.
- **Debug code:** dev-only toggles, verbose logging, or test-only UI
  (`PaymentEngineTest.jsx`-style scaffolding) that leaked into
  production-facing code paths.
- **Incomplete implementations:** a function that handles the primary case
  but not the branches the UI can actually reach (e.g. handles "student has
  points" but not "student has zero points" or "student was just created").
- **Forgotten edge cases:** empty states (no data yet), loading states,
  error states (request failed) — all three, not just the happy path with
  data present.
- **Unfinished UI:** a button that doesn't do anything yet, a form field
  with no validation, a page reachable but missing a piece the design
  implies (e.g. a list with no way to get back to it).

## What actions it takes

Report anything found as a concrete blocker to calling the feature done —
this is about accuracy of the "done" claim, not a debatable style
preference. If the scan is clean, say so plainly and let the "done" claim
stand. Don't silently fix things found here without flagging them first —
some may be intentional (e.g. a deliberately deferred edge case the user
already agreed to punt on); confirm before removing.

## Report format

```
✅ Feature Completion Check — <feature>

Found: <list of TODOs/placeholders/debug code/gaps, or "None">
Missing states: <which of empty/loading/error aren't handled, or "All handled">
Truly complete: Yes / No (with the specific gap)
```

## Examples

**Blocks the "done" claim:** a new homework submission flow handles
successful submission but has no error state if the upload fails — flag as
incomplete, not just a nice-to-have.

**Clean:** a settings toggle feature has all three states handled, no
leftover debug code, no TODOs → confirm truly complete.

**Intentional, not a blocker:** a `// TODO: add bulk import later` comment
that the user already explicitly deferred to a future session — note it
exists but don't block on it, since it was a conscious decision, not an
oversight.

## Thresholds

Report anything that would surface as a real bug or a jarring UX gap in
actual use — missing error/empty states on a page students or teachers
touch regularly, debug code shipped to production. Don't block on
cosmetic-only gaps (e.g. a loading state that just shows nothing briefly
versus a spinner) unless the user cares about that polish level for this
specific feature.

## Token usage rules

- Scope the scan to the diff for the current feature — grep the changed
  files for `TODO`, `FIXME`, `console.log`, and known test-data patterns
  rather than scanning the whole repo.
- Don't re-run this check multiple times for the same feature in one
  session; run it once at the point of claiming completion.
- Report gaps as a short list, not a narrated walkthrough of every file
  checked.
