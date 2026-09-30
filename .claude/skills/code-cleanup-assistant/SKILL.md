---
name: code-cleanup-assistant
description: >
  Identifies safe-to-remove dead code in Dave English Academy — unused
  components, hooks, imports, duplicate helpers, legacy routes (e.g. old
  V1/V2 versions of a page), and stale translation keys. Trigger
  opportunistically when dead code is noticed while working nearby (not as
  a standalone full-repo sweep), or when the user asks to clean up, remove
  unused code, or find legacy cruft. Only recommend removal once actually
  verified unused, never on a guess.
---

# Code Cleanup Assistant

## Purpose

This is the post-hoc counterpart to [[project-memory-guardian]]: that
skill stops duplication from being created; this one finds duplication and
dead weight that already exists and got left behind — often from a
superseded implementation (this codebase has already removed legacy
V1/V2 routing once). Every unused file or duplicate helper that stays in
the repo is something a future session might read, get confused by, or
even build on by mistake.

## When it activates

Opportunistically, when dead code is noticed while already working in an
area — not as a standing full-repo scan run on every session. Also
activates directly when the user asks for a cleanup pass, or after a
feature is superseded (a rewrite, a migration to a new pattern) and the old
version is likely still sitting in the tree.

## What it checks

- **Dead code:** functions, branches, or files with no remaining callers.
- **Obsolete components:** components superseded by a newer version but
  still present (check for naming clues like `V1`/`Old`/`Legacy`, and
  check actual usage, not just the name).
- **Unused hooks:** custom hooks in `src/hooks/` with no import sites left.
- **Unused imports:** imports left behind after refactoring that no longer
  reference anything used in the file.
- **Duplicate helpers:** two utilities in `src/utils/`/`src/lib/` doing the
  same thing, usually from a past miss by [[project-memory-guardian]] or
  from before this skill suite existed.
- **Legacy routes:** routes registered in `App.jsx` (or nested routers)
  that no longer correspond to a linked, reachable page.
- **Stale translations:** keys in `src/locales/en` or `src/locales/uz`
  with no remaining reference in the code — the inverse problem from
  [[translation-auditor]], which checks for missing keys; this checks for
  orphaned ones.

## What actions it takes

**Verify before recommending** — grep for actual usage/import sites, don't
infer "probably unused" from a file just looking old or oddly named. Only
recommend removal when genuinely confirmed safe:
- Zero import/usage sites found anywhere in `src/`.
- Not referenced by a route, even an unlinked one that might still be
  intentionally reachable (check with the user if unsure — some "hidden"
  routes are debug tools kept on purpose, like `PaymentEngineTest.jsx`
  appears to be).
- Not part of the business logic chain in
  [[dave-academy-regression-checklist]] without being sure it's truly
  superseded, not just less commonly hit.

If verification is inconclusive (e.g. dynamic imports, string-built route
names) don't recommend removal — flag the uncertainty instead of guessing.

## Report format

```
🧹 Cleanup Candidate — <file/symbol>

Type: Dead code / Duplicate / Unused import / Legacy route / Stale translation
Verified unused: Yes (checked <how>) / Uncertain (why)
Safe to remove: Yes / No — needs confirmation
```

## Examples

**Recommends removal:** `src/utils/formatDateOld.js` has zero remaining
import sites after a refactor to a new date utility → verified via grep,
safe to remove.

**Flags but doesn't remove:** `PaymentEngineTest.jsx` isn't linked from any
nav, but its name and content suggest it's an intentional debug/testing
tool, not abandoned code → note it, don't recommend deletion without
confirming with the user.

**Doesn't trigger:** browsing `Dashboard.jsx` to fix a display bug with no
dead code noticed along the way — this skill doesn't force a sweep just
because a file was opened.

## Thresholds

Recommend removal only when usage is verifiably zero. For "duplicate
helper," only flag when the two implementations are actually redundant
(same input/output contract), not merely similar-looking. Skip
cosmetic-only redundancy (e.g. two components that happen to render
similar-looking cards but for different, unrelated data) — that's not the
kind of duplication this skill exists to catch.

## Token usage rules

- Use targeted grep for usage verification, not a full-repo read.
- Don't run a proactive full-repo dead-code sweep unless the user asked for
  one — this skill's default mode is opportunistic, triggered by proximity
  to code already being touched.
- Batch multiple small, verified-safe cleanups (e.g. several unused
  imports in files already being edited) into one note rather than one
  report per import.
