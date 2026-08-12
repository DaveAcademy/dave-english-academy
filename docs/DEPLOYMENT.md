# Production Deployment (Dave English Academy)

## Root cause of past incidents (2026-08)

Production has repeatedly lost live features (Homework Admin Aggregation,
Final Exams student UI, ranking/exam UI, etc.) because:

1. The Vercel project (`dave-english-academy`, `prj_FLDdh0LHWW2J1YRfhNFOPtLDOeaY`,
   team `student-management-system2`) is **not building from Git**. Recent
   production deployments carry `gitCommitRef: "HEAD"` and `gitDirty: "1"` in
   their metadata — they were `vercel --prod` CLI uploads of whatever was on
   disk in whichever local clone ran the command, not Git-triggered builds.
2. Multiple Claude sessions worked from **different local clones/branches**
   of the same repo. One clone had 9 commits (Achievements, Dictionary,
   Games, Lesson Practice, Attendance fix, i18n) that the other didn't have
   pushed/pulled; the other had 6 different commits (Exams status fixes,
   Rankings panel removal, points-confirmation UI) the first didn't have.
   Both ran `vercel --prod` within minutes of each other on 2026-08-12,
   alternately overwriting production with whichever tree happened to be on
   disk — each upload silently deleted whatever the *other* tree didn't
   contain.
3. `vercel --prod` uploads the **working tree**, including uncommitted and
   untracked files (`gitDirty: "1")`, so even a single well-intentioned
   session could ship half-finished local edits.

There was no check anywhere that the tree being uploaded was clean, in sync
with the shared branch, or consistent with what was already live.

## Model going forward: release branch + gated script + disposable deploy worktree

- **`release/dashboard-redesign`** is the one production branch, pushed to
  `origin`. It is the only branch that is ever deployed.
- All deploys go through `npm run deploy:production`
  ([scripts/deploy-production.sh](../scripts/deploy-production.sh)), never a
  bare `vercel --prod`.
- **The script never deploys the working directory you ran it from.** It
  resets a disposable worktree at `C:/Dave-Academy-Deploy` to
  `origin/release/dashboard-redesign` immediately before every deploy, and
  builds/deploys from there. This closes the gap the clean/synced checks
  alone don't cover: two sessions can both start from commit A, one pushes,
  and the other — even with a perfectly clean tree — could still deploy a
  stale local HEAD if it forgot to `git pull` before checking. Because the
  deploy worktree is always force-reset to whatever is actually on `origin`
  right before deploying, a session's own possibly-stale checkout is
  irrelevant; only what's actually pushed can go live. Any local commits
  not yet pushed are simply not deployed (the script warns about this).
- The script still refuses/warns when: `.vercel/project.json` is missing in
  the main repo (can't confirm target project), or the live deployment's
  git commit can't be read (informational only, doesn't block).
- It prints the commit and the diff about to go live and asks for explicit
  `y` confirmation before building.

Why this combination: Vercel Git-integration (auto-deploy on push) was
rejected — it would deploy on every push with no review step, and this is a
single-operator project where an explicit "yes, ship this" moment is worth
more than automation. A worktree-per-feature model for all *development*
work (not just deploys) was considered but is more process than a
single-operator project needs day-to-day; the disposable deploy-only
worktree gets the same collision protection with far less overhead — it
only exists to guarantee "production always equals what's on origin",
which no amount of local dirty/branch/sync checking on the main repo can
fully guarantee by itself.

## Permanent rules for every future session

> 1. **One deploying session at a time.** If another session might be
>    deploying, don't run `deploy:production` concurrently — the disposable
>    worktree is shared and a race would just waste a build, but avoid it.
> 2. **Never run `vercel --prod` directly, ever, from any directory.**
>    Always run `npm run deploy:production`. If it refuses or warns, fix the
>    reason — do not bypass it.
> 3. **Push before you deploy.** The deploy worktree only ever deploys
>    `origin/release/dashboard-redesign` — local commits that aren't pushed
>    will not go live, silently. Push first, then deploy.
> 4. Before starting feature work in a new session, `git fetch && git
>    checkout release/dashboard-redesign && git pull` so you're building on
>    top of whatever the last session shipped, not a stale clone.
> 5. Don't build or leave state inside `C:/Dave-Academy-Deploy` yourself —
>    it's managed entirely by the deploy script and is reset/wiped on every
>    run.

## Live feature checklist (spot-check after every deploy)

- Homework Admin Aggregation page loads and shows submissions
- Final Exams student UI renders and accepts submissions
- Rankings / leaderboard page loads
- Student Dashboard loads
