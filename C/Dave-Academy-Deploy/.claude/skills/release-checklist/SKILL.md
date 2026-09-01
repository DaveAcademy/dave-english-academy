---
name: release-checklist
description: >
  Pre-deployment and post-deployment verification gate for Dave English
  Academy. Trigger before any production deployment — when the user says
  "deploy", "ship this", "push to prod", "let's release", or asks to run
  `vercel --prod`. Runs the build, checks the console, checks responsive
  layouts, checks localization, checks pending migrations, checks security,
  and — critically for this project — verifies what's actually live in
  production afterward, since production here does not deploy from `main`.
  Produces a deployment summary before and after the deploy.
---

# Release Checklist

## Purpose

This is the final gate that pulls together findings from the other skills
right before code goes live, plus the deploy-specific steps unique to this
project. Per [[dave-academy-deploy-topology]] (memory), Dave English
Academy production deploys via `npx vercel --prod --yes` from
`release/dashboard-redesign`, not from `main`, and there's no working
GitHub auto-deploy — so "the code is pushed" is never sufficient evidence
the deploy happened, and this checklist's post-deploy step is not optional.

## When it activates

Any request to deploy or release to production. Also worth a lighter pass
before opening a PR or merging to the release branch, even if the actual
`vercel --prod` isn't happening yet — catching issues here is cheaper than
catching them after deploy.

## What it checks

**Pre-deploy:**
- **Build succeeds:** run the actual build command, don't infer success
  from the code looking fine.
- **Console is clean:** no new errors/warnings introduced, verified via the
  browser preview per [[ui-consistency-auditor]].
- **Responsive layouts hold:** mobile/tablet/desktop checked per
  [[ui-consistency-auditor]] for anything touched this release.
- **Localization complete:** no missing keys or hardcoded strings per
  [[translation-auditor]] for anything touched this release.
- **Migrations are ready:** any new migration has passed
  [[database-safety-auditor]] and, given production writes are blocked
  from this environment, is confirmed ready for the operator to apply.
- **Security holds:** no open findings from [[security-auditor]] or
  [[database-safety-auditor]].
- **Rollback capability exists:** for both the code deploy (a known-good
  prior Vercel deployment to re-promote) and any migration in this release
  (a stated rollback path per [[database-safety-auditor]]).

**Post-deploy (do not skip):**
- **Confirm what's actually live**, not just that the deploy command
  succeeded. Use the content-hash trick from [[dave-academy-deploy-topology]]
  — fetch a built asset by its hashed filename from the live origin and
  compare byte length against the local build output — or check the
  deployment list for the `READY` / `target: production` entry holding the
  alias.
- **Spot-check the live site** for the specific feature just shipped, not
  just that the homepage loads.

## What actions it takes

Walk the pre-deploy list and report status for each item; anything failing
blocks the deploy the same way [[security-auditor]] blocks on a regression
— don't proceed to `vercel --prod` with a known-failing item unless the
user explicitly accepts the risk. After deploying, always complete the
post-deploy verification before declaring the release done — a deploy
command returning success is the start of verification, not the end of it.

## Report format

Pre-deploy:
```
🚀 Release Checklist — <release description>

Build: Pass / Fail
Console: Clean / Issues
Responsive: Pass / Issues
Localization: Pass / Issues
Migrations: Ready / Blocked (why)
Security: Clear / Open findings
Rollback plan: <code — prior deployment ID> / <migration — rollback path>

Ready to deploy: Yes / No
```

Post-deploy:
```
✅ Deployment Summary — <release description>

Deployed: <what shipped, branch, timestamp>
Live verification: <what was checked and confirmed live>
Known issues: <any deferred item from pre-deploy, or "None">
```

## Examples

**Blocks:** a migration in this release has no verified rollback path and
touches the payments table → Ready to deploy: No, until resolved or
explicitly accepted by the user.

**Passes, deploys, verifies:** a UI-only change to `Rankings.jsx` — build
passes, console clean, responsive/localization confirmed, no migration in
this release → deploy, then confirm the new asset hash is live at the
production origin before reporting done.

## Thresholds

No threshold on the hard-gate items (build, security, migration readiness)
— these are binary pass/fail. For "known issues" carried into the deploy
summary, only list items that were consciously deferred with the user's
sign-off, not every Low-priority note ever raised.

## Token usage rules

- Reuse findings the other skills already produced earlier in the session
  instead of re-running their full checks from scratch at deploy time —
  this skill aggregates, it doesn't duplicate.
- For post-deploy verification, use the lightweight asset-hash check before
  reaching for a full browser walkthrough of the live site.
- Keep the deployment summary short — it's a record, not a retrospective.
