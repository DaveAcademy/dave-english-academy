#!/usr/bin/env bash
# Safe production deploy for dave-english-academy.
# Run via: npm run deploy:production  (from anywhere inside any clone/worktree)
#
# Prevents two failure modes that have repeatedly wiped out live features:
#
# 1. A session runs `vercel --prod` from a dirty/divergent local clone, and
#    Vercel uploads that clone's whole working tree, silently deleting any
#    feature that isn't present there but IS live in production.
# 2. Two sessions each start from the same base commit, one pushes, the
#    other later deploys its own (now stale) working directory without ever
#    having synced with what the first session shipped.
#
# The fix for (1) is the checks below (clean tree, branch, sync-with-origin).
# The fix for (2) is that this script NEVER deploys the working directory you
# ran it from. It always deploys a disposable worktree
# (C:/Dave-Academy-Deploy) that it resets to origin/release/dashboard-redesign
# immediately before every deploy. Your own working directory — with whatever
# in-progress edits it has — is never touched or uploaded.
set -euo pipefail

PROD_BRANCH="release/dashboard-redesign"
PROD_ALIAS="dave-english-academy.vercel.app"
DEPLOY_WORKTREE="C:/Dave-Academy-Deploy"

common_dir="$(git rev-parse --path-format=absolute --git-common-dir)"
MAIN_REPO="$(dirname "$common_dir")"
cd "$MAIN_REPO"

echo "== 1. Fetch origin =="
git fetch origin "$PROD_BRANCH" --quiet
origin_head="$(git rev-parse "origin/$PROD_BRANCH")"
echo "origin/$PROD_BRANCH is at $origin_head"

echo "== 2. Reset disposable deploy worktree to origin =="
if [[ -d "$DEPLOY_WORKTREE" ]] && git -C "$MAIN_REPO" worktree list --porcelain | grep -qF "worktree $DEPLOY_WORKTREE"; then
  echo "Reusing existing worktree at $DEPLOY_WORKTREE"
  git -C "$DEPLOY_WORKTREE" checkout --detach --force "$origin_head" --quiet
  git -C "$DEPLOY_WORKTREE" clean -fdx --quiet -e node_modules -e .vercel
else
  echo "Creating fresh worktree at $DEPLOY_WORKTREE"
  rm -rf "$DEPLOY_WORKTREE"
  git worktree add --detach "$DEPLOY_WORKTREE" "$origin_head"
fi
worktree_head="$(git -C "$DEPLOY_WORKTREE" rev-parse HEAD)"
echo "OK: deploy worktree is a clean checkout of $worktree_head — nothing from your working"
echo "directory ($MAIN_REPO) is part of this deploy."

echo "== 3. Link Vercel project =="
mkdir -p "$DEPLOY_WORKTREE/.vercel"
if [[ -f "$MAIN_REPO/.vercel/project.json" ]]; then
  cp "$MAIN_REPO/.vercel/project.json" "$DEPLOY_WORKTREE/.vercel/project.json"
else
  echo "REFUSING: $MAIN_REPO/.vercel/project.json not found — cannot confirm which Vercel"
  echo "project this would deploy to. Run 'vercel link' in $MAIN_REPO first."
  exit 1
fi

echo "== 4. Compare against what is actually live =="
live_commit="$(vercel inspect "$PROD_ALIAS" 2>/dev/null | grep -m1 -oE '[0-9a-f]{40}' || true)"
if [[ -n "$live_commit" ]]; then
  echo "Live production commit (from Vercel metadata): $live_commit"
  if [[ "$live_commit" == "$worktree_head" ]]; then
    echo "NOTE: production is already at this commit. Nothing to deploy."
  else
    echo "Commits that will go live ($live_commit..$worktree_head):"
    git -C "$MAIN_REPO" log --oneline "$live_commit..$worktree_head" 2>/dev/null || echo "  (live commit not in local history — cannot diff, inspect manually before proceeding)"
  fi
else
  echo "WARNING: could not read a git commit sha from the current live deployment"
  echo "(some past deploys were CLI uploads with no git metadata). Proceeding blind on this"
  echo "check — this deploy is still guaranteed to be exactly origin/$PROD_BRANCH, no more,"
  echo "no less."
fi

echo
echo "This will deploy the CLEAN, ORIGIN-SYNCED state of $PROD_BRANCH ($worktree_head)."
echo "It will NOT include anything from your current working directory ($MAIN_REPO),"
echo "committed or not — if you have local commits not yet pushed to origin, push them"
echo "first or they will not go live."
read -r -p "Deploy commit $worktree_head ($PROD_BRANCH) to production? [y/N] " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "Aborted. Deploy worktree left in place at $DEPLOY_WORKTREE for inspection."
  exit 1
fi

echo "== 5. Build (in deploy worktree) =="
( cd "$DEPLOY_WORKTREE" && npm install --no-audit --no-fund && npm run build )

echo "== 6. Deploy (from deploy worktree) =="
( cd "$DEPLOY_WORKTREE" && vercel --prod )

echo "== 7. Post-deploy cleanup =="
git -C "$DEPLOY_WORKTREE" clean -fdx --quiet -e node_modules -e .vercel
echo "Deploy worktree reset to a clean state (kept at $DEPLOY_WORKTREE, node_modules cached"
echo "for next deploy — nothing left behind for another session to accidentally build on)."
echo
echo "Verify the alias now serves this build:"
echo "  vercel inspect $PROD_ALIAS"
echo "Then spot-check the features listed in docs/DEPLOYMENT.md 'Live feature checklist'."
