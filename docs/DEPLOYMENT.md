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

---

## Addendum (2026-08-17 documentation consolidation pass)

The sections above remain the authoritative deploy process description; this addendum adds confirmed details found during a full docs consolidation and does not change any rule stated above.

### Confirmed current state

- Production branch: `release/dashboard-redesign`, HEAD `15e17ae` at doc time.
- Deploy command: `npm run deploy:production` → `scripts/deploy-production.sh` (confirmed present in `package.json` scripts). The script previously showed as locally modified in `git status`; investigated 2026-08-17 and confirmed it was a `core.autocrlf`-driven line-ending artifact only (`git diff` empty, content byte-identical to HEAD once staged) — no actual behavior change, nothing to commit.
- Hosting: Vercel project `dave-english-academy` (`prj_FLDdh0LHWW2J1YRfhNFOPtLDOeaY`), team `student-management-system2`, confirmed via `vercel.json` (SPA rewrite) plus the root-cause section above.
- Migration deploys go through the Supabase CLI/MCP separately from the Vercel frontend deploy — **not** part of `deploy-production.sh`. Always confirm migration-ledger/production parity (`supabase migration list --linked`) before any `supabase db push`; see `DATABASE.md` §1 and §5 for why this has bitten the project more than once historically.

### PWA stale-cache consideration

`vite-plugin-pwa` is present (confirmed in `package.json`/`ARCHITECTURE.md`). No dedicated stale-cache incident writeup was found among the existing `docs/*.md` files searched this pass — treat "students may see a stale cached build after a deploy until the service worker updates" as a **standing PWA risk to consider when verifying a deploy**, not a documented past incident with a specific fix. If a future session finds a specific stale-cache bug report, record it here.

### Windows considerations

This repo is developed on Windows (confirmed: environment is `win32`, PowerShell/Bash both available per session tooling). `scripts/deploy-production.sh` is a Bash script — run it via Git Bash or WSL-equivalent, not native PowerShell, consistent with how the working sessions that produced this doc set operated (Bash tool used throughout for git/repo commands in this project).

### Runtime verification, restated

Per the standing rule already established in `PROJECT-HANDOFF.md`/`DATABASE.md`/`GAMING-SYSTEM.md`: a deploy is not "verified" from a clean build + static code review alone. At least two production bugs in the gaming system (an adaptive-difficulty tier-scale issue and an unlocked-lesson join issue) were caught only by an actual logged-in runtime session, not by reading migrations or diffs. Apply the same standard to any future deploy-verification claim across every system in this doc set, not just gaming.
