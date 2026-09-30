---
name: project-memory-guardian
description: >
  Prevents recreating functionality that already exists in Dave English
  Academy. Trigger this BEFORE writing a new component, hook, utility
  function, table, or API endpoint — any time the task is "add/build/create
  X" rather than "fix/edit Y". Search the existing codebase for something
  that already does what's being requested and prefer extending, reusing,
  or refactoring it over adding a parallel implementation. Especially
  relevant for anything touching vocabulary, points/ranking, payments,
  student progress, or dashboards, since this codebase has had duplicate
  implementations of these before.
---

# Project Memory Guardian

## Purpose

Dave English Academy has, more than once, ended up with two versions of the
same concept because a new feature was built without checking what already
existed (see the vocabulary system correction in project memory — an
earlier proposal treated vocabulary as its own isolated page before it was
corrected to be lesson-owned). This skill is the check that happens
*before* code gets written, so that correction doesn't have to happen again
after the fact.

This is the mirror image of [[code-cleanup-assistant]]: that skill finds
duplication that already landed in the codebase; this skill stops it from
landing in the first place.

## When it activates

Any time the task is additive — "add a component for X", "create a utility
that does Y", "we need an endpoint/table for Z" — activate before writing
the first line of new code. It does not activate for pure bug fixes or
edits to existing, named files; those don't risk creating a duplicate.

## What it checks

1. **Grep for the concept, not just the literal name.** Search for the
   feature by its likely names, synonyms, and related domain terms — e.g.
   a request for "student word list" should also search `vocabulary`,
   `word`, `flashcard`. A component named `StudentWordList.jsx` won't show
   up if you only grep the phrase the user used.
2. **Check `src/components/`, `src/hooks/`, `src/utils/`, `src/lib/` for an
   existing implementation** of the same responsibility, even partial.
3. **Check `supabase/migrations/` for an existing table or function** that
   already models this data, including ones added but not yet built on.
4. **Check whether an existing system was intentionally designed to be
   extended for this** — e.g. the lesson hierarchy (`Course → Level →
   Lesson → {PDF, Homework, Vocabulary, Quiz, Notes}`) was built so new
   per-lesson features attach to `Lesson`, not live as siblings of it.

## What actions it takes

- **Nothing already exists:** say so briefly and proceed — don't produce a
  report for a clean check, that's noise.
- **Something similar exists and should be reused as-is:** point to it
  (file path) and use it instead of writing new code.
- **Something similar exists but needs a small extension:** propose
  extending it (new prop, new column, new branch in existing logic) instead
  of a parallel implementation, and explain the specific extension.
- **Something similar exists but is genuinely a different concern:** it's
  fine to build separately — say explicitly why this isn't a duplicate
  (different data, different lifecycle, different owner) so the distinction
  is on record rather than assumed.

## Report format

Only surface a report when there's a real duplicate risk to flag — a clean
result gets a one-line confirmation, not this block:

```
🧭 Project Memory Guardian

Existing implementation: <file path / table / function name>
Overlap: <what it already covers>
Recommendation: Reuse / Extend / Refactor / Build separately (with reason)
```

## Examples

**Triggers, finds overlap:** "Add a favorites feature for vocabulary words"
→ `student_vocabulary_favorites` already exists (migration 0048 family) →
recommend reusing it, not creating a new `favorites` table.

**Triggers, no overlap:** "Add a certificate template picker for teachers"
→ nothing in `Certificates.jsx` or migrations currently models templates →
confirm clean, proceed to build.

**Doesn't trigger:** "Fix the date formatting bug on the Attendance page" —
this is an edit to a named existing file, not new functionality.

## Thresholds

There's no numeric threshold here — the judgment call is "would a
reasonable teammate reviewing this PR ask 'didn't we already have this?'"
If yes, it's worth a report. If the overlap is superficial (e.g. both
happen to use a `StatusPill`, but model different data), it isn't.

## Token usage rules

- Search with targeted `grep`/glob queries for the specific concept, not a
  full read of `src/`. Two or three well-chosen searches beat reading every
  component file.
- Don't re-run this check multiple times for the same feature within one
  session — once confirmed clean or handled, move on.
- Prefer file-path pointers over pasting the existing implementation's code
  into the conversation; the user can open the link.
