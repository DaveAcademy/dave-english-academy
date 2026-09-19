---
name: dave-academy-development-standards
description: >
  Master development philosophy for the Dave English Academy codebase —
  always keep these standards in mind for every non-trivial task in this
  repo (new features, refactors, bug fixes, migrations, deploys). It is not
  a checklist to run once; it's how work should be approached throughout a
  session. Load this early in any Dave English Academy session that involves
  writing or changing code, and use it to decide which of the more specific
  skills in .claude/skills/ apply to the current step.
---

# Dave Academy Development Standards

This is the master skill for Dave English Academy development. It doesn't
duplicate the detailed checks the other 11 skills perform — it sets the
philosophy those skills enforce, and tells you when to reach for which one.

## Why this exists

Dave English Academy is a real, live, single-operator academy product with
production users, real payments, and a small team maintaining it. Every
session here compounds: code you write today is code a future session
(possibly you, possibly not) has to load into context, understand, and
trust before building further. The standards below exist because violating
them quietly makes every future session slower, more expensive, and riskier
— not because they're abstract best practice.

## Core rules

1. **Investigate before implementing.** Read the relevant existing code —
   the actual current state, not what a memory or prior summary claims it
   is — before writing new code. Assumptions about "how this probably
   works" are how duplicate systems and broken business rules happen.

2. **Reuse before creating.** Search for existing functionality that
   already does what you're about to build. This is [[project-memory-guardian]]'s
   job specifically — invoke it before adding a new
   component, hook, utility, or table.

3. **Prefer extending existing systems over building parallel ones.** If a
   pattern already exists (e.g. the points/ranking pipeline, the payment
   status functions, the lesson-owned vocabulary model), extend it rather
   than starting a second implementation of the same concept.

4. **Keep architecture simple.** Don't add abstraction, config, or
   generality for hypothetical future needs. Three similar lines beat a
   premature shared abstraction; a real second use case beats a speculative
   one.

5. **Minimize token usage.** Don't re-read files you just edited, don't
   scan the whole repo when the task touches one feature, don't restate
   context that's already established. This is [[architecture-token-health-monitor]]'s
   job to watch for and flag.

6. **Preserve security.** Never weaken RLS, auth checks, `SECURITY DEFINER`
   scoping, or permission boundaries to make a feature easier to build.
   [[security-auditor]] and [[database-safety-auditor]] are hard gates on
   this, not advisory.

7. **Keep migrations reversible.** Every schema change should have a clear
   rollback path, and should be checked against existing production data
   shape before being written, not after. [[database-safety-auditor]] owns
   the detailed checklist.

8. **Build before claiming completion.** Don't report a feature or fix as
   done without actually running the build and confirming it succeeds.

9. **Verify in the browser.** For anything UI-visible, actually open it and
   look — golden path and at least one edge case — rather than inferring
   correctness from reading the code. [[ui-consistency-auditor]] and
   [[performance-watcher]] give this verification pass structure.

10. **Verify production after deployment.** A successful build and local
    check is not proof of a successful deploy. Per [[dave-academy-deploy-topology]]
    (memory), production is deployed by CLI from a specific branch and does
    not track `main`, so "it's on `main`" is never evidence it's live.
    [[release-checklist]] owns the pre- and post-deploy verification steps.

11. **Report architectural risks immediately, don't sit on them.** If
    something you notice is a High-priority risk to future development
    time or cost, surface it right away per [[architecture-token-health-monitor]]'s
    alert rules — don't wait for a natural pause in the conversation to
    mention it.

12. **Never hide technical debt.** If a shortcut was taken, say so plainly
    — in the code (only if the *why* is non-obvious) and in your response
    to the user. Silence about debt is what turns a small shortcut into an
    unpleasant surprise later.

13. **Distinguish facts from assumptions.** State what you've verified by
    reading code or running a query versus what you're inferring or
    recalling from memory. Memory files are point-in-time notes, not live
    state — treat their claims as needing verification, not as ground
    truth, especially for anything schema- or deploy-related.

14. **Be transparent about limitations.** If you can't verify something —
    can't read RLS policy bodies, can't reach production, can't run the
    browser — say so explicitly rather than reporting confidence you don't
    have. Per [[dave-academy-supabase-prod-access]] (memory), several checks
    in this project genuinely require an operator in the Supabase Dashboard;
    that's a real limitation, not something to paper over.

## How the suite fits together

Twelve skills live in `.claude/skills/` here. Each owns one concern, so
they don't all fire on every change — expect two or three to be relevant
to any given task, not all twelve:

| Skill | Fires on | Owns |
|---|---|---|
| [[architecture-token-health-monitor]] | large/oversized files, repeated reads, structural smells noticed in passing | Token/context economy, general architecture health, session summary |
| [[project-memory-guardian]] | before creating new code | Duplicate-before-you-build prevention |
| [[database-safety-auditor]] | migration files, schema changes | RLS, indexes, FKs, constraints, `SECURITY DEFINER`, rollback |
| [[ui-consistency-auditor]] | component/style changes | Visual consistency, responsiveness, dark mode, console errors |
| [[performance-watcher]] | component/hook/API code changes | Runtime perf — re-renders, N+1, bundle size |
| [[security-auditor]] | auth/permission/storage/secrets/SQL/XSS-surface changes | App-layer security, hard gate |
| [[release-checklist]] | before any deploy | Pre-flight + post-deploy verification |
| [[feature-completion-checker]] | a feature is claimed "done" | TODOs, placeholders, debug code, unfinished UI |
| [[translation-auditor]] | UI string / locale changes | EN/UZ parity, hardcoded strings, locale formatting |
| [[business-rules-guardian]] | ranking/payment/progression/attendance/certificate/dashboard changes | Protecting established academy behavior |
| [[code-cleanup-assistant]] | opportunistically, when dead code is spotted | Safe removal of unused code |
| this skill | start of any non-trivial session | Philosophy + routing to the above |

When two skills could plausibly both fire on the same change (e.g. a
migration that also touches ranking logic triggers both
[[database-safety-auditor]] and [[business-rules-guardian]]), that's
expected — they check different things about the same change. What
shouldn't happen is one skill restating another's checklist; if you notice
that happening, it's a sign the skill boundaries need tightening, which is
itself worth a quick [[architecture-token-health-monitor]] note.
