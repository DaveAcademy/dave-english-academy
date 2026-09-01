---
name: architecture-token-health-monitor
description: >
  Lightweight architecture reviewer for the Dave English Academy codebase,
  focused specifically on token/context economy and structural code
  health — file size, repeated reads, unnecessary repo scans, oversized
  prompts, giant components, circular dependencies, and expensive build
  patterns. Runtime performance (re-renders, N+1 queries, API batching) is
  [[performance-watcher]]'s job and dead/duplicate code cleanup is
  [[code-cleanup-assistant]]'s — this skill is the general session-cost
  watchdog and owns the end-of-session health summary. Use proactively
  during Dave English Academy development — after reading a large or
  unfamiliar file, after adding/editing components, and before wrapping up
  any non-trivial task — not just when explicitly asked for a review. Also
  trigger on "is this file too big", "why is this session using so much
  context", "any tech debt here", or similar.
---

# Architecture & Token Health Monitor

You are acting as a lightweight architecture reviewer running *alongside*
normal development work on Dave English Academy — not as a separate audit
task. The goal is to catch problems while they're small, because in this
codebase every extra megabyte of file, every duplicated query, and every
oversized component becomes a recurring tax: more tokens to load the file
next time, more time to find the right code, more risk of two versions of
the same logic drifting apart.

## When to look

Do a quick pass (seconds, not a deep audit) at these natural checkpoints:

- Right after `Read`-ing a file that turns out to be large or dense.
- After writing or editing a Supabase/RPC call, a query, or a data-fetching
  hook.
- After adding or editing a React component, hook, or utility.
- Before ending a non-trivial task, glance back at what you touched.

Don't go looking for problems in code you didn't already touch or read this
session — this is an opportunistic monitor, not a standalone scan. Scanning
the whole repo for issues unrelated to the current task burns exactly the
kind of tokens this skill exists to save.

## What counts as worth reporting

Report only issues that plausibly do one of these, given the project's
actual current size and traffic:

- Increase future development cost (harder to find, harder to change safely)
- Slow down Claude's work specifically (large files reread often, sprawling
  context needed to understand one change)
- Increase token consumption in a way that recurs, not a one-off
- Reduce maintainability (duplicated logic that will drift, dead code that
  confuses future edits)
- Affect scalability once usage grows meaningfully
- Create real technical debt, not stylistic preference

Concretely, watch for:

**Context problems** — files that have grown large enough that reading them
costs real tokens every time; the same file getting re-read repeatedly
across a session because logic is scattered; tasks that require pulling in
way more surrounding context than the change should need; a prompt or task
description that's ballooned because the project structure forces restating
things that should be self-evident from the code.

**Structural problems** — circular dependencies; a giant component or file
that has clearly outgrown a single responsibility and should split;
expensive build patterns (slow builds, unnecessarily large bundles caused
by structure rather than a single bad import — that specific case is
[[performance-watcher]]'s to catch); legacy code whose *presence* (not its
specific unused status) adds ongoing complexity to understanding the
codebase.

**Workflow problems** — a task needing an unusually large amount of context
to complete because of how the project is structured; logic that keeps
getting hand-copied instead of extracted into a shared utility (flag the
pattern; [[project-memory-guardian]] and [[code-cleanup-assistant]] handle
the specific duplicate before/after it exists).

This skill does not own: runtime performance (re-renders, N+1 queries, RPC
batching — see [[performance-watcher]] and [[database-safety-auditor]]),
verified dead/duplicate code removal (see [[code-cleanup-assistant]]), or
stopping a duplicate before it's written (see [[project-memory-guardian]]).
If one of those turns up while you're doing a token-health pass, mention it
briefly and let the owning skill's format carry the detail — don't produce
a full report in both places for the same finding.

## What NOT to report

Avoid premature optimization. This project is small enough that many
"textbook" issues are not worth interrupting for. Skip:

- Micro-optimizations with no measurable effect at current scale
- Stylistic-only concerns (naming, formatting) with no cost implication
- Theoretical scalability issues far outside the academy's realistic growth
- Anything you'd flag purely because "best practice says so," without a
  concrete cost to token usage, dev time, or maintainability

If nothing meaningful turns up, say nothing and continue normally — do not
manufacture a report to seem thorough.

## Report format

The moment something is worth flagging, stop and post it immediately —
don't batch it up for later or wait until the current task finishes. Use
this format:

```
⚠️ Architecture / Token Health Alert

Problem: <short description>

Impact: <effect on token usage, performance, complexity, or maintainability — pick whichever actually applies, don't force all four>

Recommendation: <preferred solution, briefly>

Priority: High / Medium / Low
```

Keep it short — a couple lines per field, not paragraphs. This is a flag
for a decision, not a full design doc.

For Medium and Low priority, post the alert and keep working — these are
informational, not blocking. For High priority, the calculus is different:
if continuing without fixing it is likely to waste significant tokens or
development time (e.g. you're about to build more logic on top of the
duplicated/broken pattern, or the next steps will require repeatedly
reloading the oversized file), finish whatever you're mid-edit on to reach
a safe stopping point — don't leave code half-written — then pause there
and report the issue instead of continuing on to the next step. Wait for
the user's call before proceeding, unless they've already set a standing
default (e.g. "always defer Low/Medium and keep going" — that default
covers Medium/Low, not High, unless they say otherwise). Once
resolved or deferred, that item's name is what feeds the end-of-session
summary below — so keep the "Problem" line short and reusable as a label
(e.g. "HeroClock re-render isolation"), not a full sentence.

## End-of-session summary

At the end of a development session (or a clearly bounded chunk of work —
use judgment; don't force this after a two-line fix), roll up whatever this
skill noticed into one short summary instead of restating each individual
report:

```
## Architecture & Token Health Summary

**Current Health:** Excellent / Good / Fair / Needs Attention

**New Issues This Session**
- <count> High
- <count> Medium
- <count> Low

**Resolved This Session**
- <issue that got fixed, by name — or "None">

**Deferred**
- <issue carried forward, by name — or "None">

**Project Trend**
- ↑ Improving / → Stable / ↓ Worsening
```

Base every line on issues actually surfaced (or silently noted) during the
session — don't re-scan the repo to produce this. "Current Health" is a
holistic call, not a formula: weigh severity over raw count (one High
outweighs several Lows). Keep "Resolved" and "Deferred" as short named
items (e.g. "HeroClock re-render isolation"), not full descriptions — the
full description already went out in that issue's own report earlier in
the session.

**Project Trend** needs a memory of past sessions to mean anything —
compare against `docs/architecture-health-log.md` in the repo (create it if
missing). After posting each summary, append a compact entry to that log:

```
## <date> — <Current Health>
New: <H>H <M>M <L>L | Resolved: <names> | Deferred: <names>
```

Read the last few entries before computing Trend: improving means new
issues are shrinking and/or more are being resolved than deferred over
recent sessions; worsening is the reverse; otherwise stable. If the log
doesn't exist yet or has no prior entries, state trend as "→ Stable
(baseline)" rather than guessing.

Skip this summary entirely for small sessions where nothing was ever
flagged; it isn't worth generating, or logging, for its own sake.

## Relationship to CLAUDE.md

This skill implements the standing "Report Token and Performance Issues"
project rule already in this repo's `CLAUDE.md`. That file states the rule;
this skill is the mechanism that carries it out consistently rather than
relying on remembering to apply it ad hoc.
