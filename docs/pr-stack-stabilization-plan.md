# PR Stack Stabilization Plan

Analysis only - no application code, migrations, or branches are touched by
this document. Written before continuing to merge PRs #10-#17, per request,
so the remaining work can be reviewed before it happens rather than after.

Status at time of writing: **#8 and #9 are merged into `main`. #10-#17 are
still open.**

## 1. The chains

| Chain | PRs | Adds migrations |
|---|---|---|
| A - dashboards/chat/files | ~~#9~~ -> #10 -> #11 -> #12 -> #13 -> #14 | 0008 (merged), 0009, 0010 |
| B - financial UI lockdown | #15 -> #16 | 0011 |
| Standalone | #17 | 0012 |
| Standalone, merged | ~~#8~~ | 0007 |

Each arrow is a real git dependency (branch B was created from branch A's
tip), not just a suggested order - GitHub will not let a later PR in a
chain merge cleanly before the earlier ones land.

## 2. Finding: squash-merges break stacked PR chains, and this recurs

Squash-merging #9 created a new commit on `main` with different SHAs than
the commits PR #10's branch was built on, even though the resulting file
content is identical. GitHub's mergeability check compares commit
ancestry, not just final content, so it now reports PR #10 as
`CONFLICTING` - confirmed false by direct comparison:

```
git diff origin/main origin/feature/chat-exams-homework-uploads --stat
```

produces exactly PR #10's original diff (16 files, 1935 insertions(+), 176
deletions(-)), with no drift. Three different `gh pr merge` invocations
(squash, merge, waiting for the async mergeability recheck) all failed
identically, confirming this isn't a stale-cache issue.

**The fix, verified locally:** rebase the PR's branch directly onto the
updated `main`.

```
git checkout <branch>
git reset --hard <original PR commit>   # discard any prior merge-commit attempt
git rebase origin/main
```

Git's rebase engine recognizes #9's content as already applied (via
patch-id matching) and skips replaying it, leaving one clean commit
containing only the PR's actual new changes, sitting directly on top of
the current `main` tip. This was verified end-to-end for PR #10: the
rebase completed with zero conflicts, and `npm run build` succeeded
against the result.

**This will recur identically for #11, #12, #13, and #14** - each is
stacked on the previous one the same way. Applying this same rebase step
before merging each one is expected, routine work, not a sign anything is
wrong with those PRs.

Pushing the rebased branch requires a force-push (`--force-with-lease`) to
that feature branch specifically - never to `main`. This is the normal,
expected way to update a PR after resolving this kind of conflict.

## 3. Finding: the Dashboard.jsx conflict is real, with a known resolution

Confirmed by diffing the actual pushed branches
(`git diff origin/main origin/fix/hide-financial-fields-from-teachers --
src/pages/Dashboard.jsx`): PR #16 wraps the *existing* single-dashboard
"This month" financial block in `{isAdmin && ...}`.

PR #11 (chain A) does not patch that structure - it replaces
`Dashboard.jsx` entirely with role-branched `AdminDashboard` /
`TeacherDashboard` components. `TeacherDashboard` never renders a
financial block at all (it shows Attendance / Homework / Exam statistics /
Student performance instead, by original design in that PR).

**Resolution when this conflict surfaces:** discard PR #16's
`Dashboard.jsx` hunk entirely and keep chain A's version - chain A already
achieves the same protective outcome for teachers, just via a different
code structure, so #16's patch is targeting code that will no longer
exist in that shape. PR #16's other file, `Students.jsx`, has zero overlap
with chain A and applies cleanly regardless of merge order.

`Nav.jsx` is touched by both chains too (chain A adds Chat/Files entries;
chain B adds `adminOnly: true` to the Payments entry) - different array
entries, expected to merge automatically without manual intervention, but
worth a quick visual check when it comes up.

## 4. Finding: Vercel is not auto-deploying on merge

Checked directly rather than assumed:

- `list_deployments` and `get_project` both show the latest production
  deployment is still the one for PR #7's commit, from six days before
  this session.
- Merging #8 and #9 today triggered nothing.
- Every deployment on record carries `"actor": "claude-code_...agent"` in
  its metadata rather than a webhook-originated marker, suggesting past
  deployments were triggered explicitly (by a prior agent session or
  manually) rather than by an automatic GitHub-push integration.

**Practical effect:** merging this stack will not put it in front of real
users until a deployment is explicitly triggered afterward. This lowers
the urgency of "merged code degrades a feature until its migration is
applied" scenarios flagged in earlier PRs (nothing reaches production
instantly), but it also means "merged" and "deployed" need to be treated
as two separate, explicit steps for this project - not one.

This is worth a decision: investigate/repair the GitHub-Vercel
integration so future merges auto-deploy as originally assumed, or accept
manual deployment triggers as the ongoing workflow. Either is workable;
this document doesn't assume which you'd prefer.

## 5. Migration state

None of migrations 0007-0012 have been applied to the live database yet -
confirmed multiple times across this session. Supabase MCP tooling is
currently disconnected, so none of them can be applied or verified from
here right now.

The one cross-chain dependency identified earlier (migration 0012, PR
#17, references the `points` column added by migration 0008, PR #9) is
now satisfied at the *PR* level since #9 is merged - but the *migration*
itself still isn't applied. Practically: migration 0008 must be applied
to the database before migration 0012 is, regardless of what order the
remaining PRs merge in.

## 6. Recommended sequence from here

1. **#10 through #14, one at a time:** rebase onto the then-current
   `main` (per section 2), verify the diff matches the original PR's
   diff exactly, force-push the feature branch, merge.
2. **At #15/#16:** rebase; resolve the `Dashboard.jsx` conflict per
   section 3 (keep chain A's version, discard #16's hunk); keep
   `Students.jsx` as `#16` has it; merge #15, then #16.
3. **#17 last**, following the same rebase-if-needed check - its
   migration dependency on #9 is already satisfied now that #9 is
   merged.
4. **Migrations:** apply 0007 through 0012 in that numeric order once
   Supabase tooling is available again (or via manual SQL editor
   execution in the interim, if preferred).
5. **Deployment:** explicitly trigger and verify a Vercel deployment
   after the stack lands - do not assume it happens automatically (see
   section 4).
6. **Post-deploy smoke test** against production before considering this
   stack stabilized.

## 7. Decisions needed before continuing

- Confirm it's acceptable to force-push feature branches (not `main`)
  repeatedly through step 1 above - this is routine for resolving the
  squash-stacking issue, but is a history-rewrite each time and wasn't
  covered by the original PR-number list.
- Decide how to handle the Vercel auto-deploy gap (section 4): investigate
  the integration, or proceed with manual deployment triggers.
- Decide how to handle migration application while Supabase tooling is
  disconnected: wait for it to reconnect, or have this plan's author
  hand over exact SQL for manual execution in the Supabase dashboard.

## 8. Finding: duplicate exam/certificate storage-RLS work, resolved

Two branches independently hardened `attachments` storage RLS for the
same three folders (`exams/`, `certificate-template/`, `exam-answers/`),
written without visibility into each other - multiple concurrent sessions
were active on this repo at once. Compared directly (diffed the raw SQL
of each branch's migration file against the other, not just commit
messages): the policy logic is byte-for-byte identical between them. The
only differences were incidental:

- `fix/harden-exam-certificate-storage-rls` (**PR #24 - canonical**) -
  based on current `main`, correctly numbered `0014_harden_exam_
  certificate_storage.sql` (the next free slot; `0011` stays reserved for
  the still-open #15).
- `fix/exam-certificate-storage-rls` (retired) - based on the
  now-superseded `feature/chat-exams-homework-uploads`, numbered
  `0010_harden_exam_certificate_storage.sql`, which collides with
  `0010_file_manager.sql` already merged into `main`. No PR was ever
  opened for it; the branch has been removed.

**Storage-RLS hardening for exams/certificates has exactly one remaining
task: merge PR #24.** No reconciliation needed - there was nothing unique
to carry forward. If similar duplication turns up elsewhere in this
stack, diff the actual changed content directly before assuming either
branch needs work - independent sessions solving the same documented gap
(see migration 0009's own comments) can converge on identical output.
