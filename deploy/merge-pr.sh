#!/bin/sh
# Merge a pull request the way Bitcoin Core maintainers do with
# contrib/devtools/github-merge.py: fetch exactly the reviewed commit, refuse
# if anything changed, the checks didn't pass, a commit names an AI
# co-author, or this machine can't sign, make a signed merge commit with a
# one-line message, run the tests and the signature check on the merged
# result, and only push when told to.
#
#   sh deploy/merge-pr.sh 177          prepare and check the merge locally
#   sh deploy/merge-pr.sh 177 --push   ... and push it (this deploys)
set -eu
PR="${1:?usage: sh deploy/merge-pr.sh <pr-number> [--push]}"
PUSH="${2:-}"
ID="-c user.name=altradits -c user.email=altradits@gmail.com"
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
die() { echo "merge-pr: $*" >&2; exit 1; }

[ -z "$(git status --porcelain)" ] || die "the working tree has changes; commit or stash them first."
[ -d node_modules ] || die "node_modules is missing; run npm ci first (the merge runs the tests)."
git checkout -q main
git fetch -q origin main
git merge -q --ff-only origin/main || die "local main has diverged from origin/main."

STATE=$(gh pr view "$PR" --json state --jq .state)
[ "$STATE" = "OPEN" ] || die "PR #$PR is $STATE, not open."
BASE=$(gh pr view "$PR" --json baseRefName --jq .baseRefName)
[ "$BASE" = "main" ] || die "PR #$PR targets $BASE, not main."
TITLE=$(gh pr view "$PR" --json title --jq .title | tr -d '\n')
HEAD=$(gh pr view "$PR" --json headRefOid --jq .headRefOid)
gh pr checks "$PR" >/dev/null 2>&1 || die "PR #$PR's checks haven't all passed (gh pr checks $PR)."

# Exactly the commit that was reviewed: if the branch moved since, stop.
git fetch -q origin "pull/$PR/head"
[ "$(git rev-parse FETCH_HEAD)" = "$HEAD" ] || die "the PR branch changed while preparing the merge; review again."

# No AI co-authors reach main: GitHub lists every Co-Authored-By as a contributor.
sh deploy/no-ai-coauthor.sh "main..$HEAD" || die "the PR branch names an AI co-author; strip the trailer and review again."

echo "== Merging #$PR: $TITLE"
git log --oneline "main..$HEAD"
git diff --stat "main...$HEAD" | tail -1

# Signed merges only: unsigned code fails the signed-commits check on main,
# so refusing here saves a wasted merge. Signing runs through
# deploy/ssh-sign.sh when present: plain ssh-keygen needs a login user,
# which sandboxed shells don't have.
KEY=$(git config --get user.signingkey || true)
[ -n "$KEY" ] && [ -f "$KEY" ] || die "no signing key found (set user.signingkey); merges to main must be signed."
SIGNC=""
if command -v node >/dev/null 2>&1 && [ -x "$HERE/ssh-sign.sh" ]; then SIGNC="-c gpg.ssh.program=$HERE/ssh-sign.sh"; fi
# shellcheck disable=SC2086
git $ID $SIGNC merge -q --no-ff -S "$HEAD" -m "Merge #$PR: $TITLE" || { git merge --abort 2>/dev/null; die "the merge didn't apply cleanly; rebase the PR and review again."; }
echo "== Tests on the merged result"
if ! npm test --silent >/tmp/merge-pr-$PR.log 2>&1; then
  git reset -q --merge ORIG_HEAD
  die "tests failed on the merged result (log: /tmp/merge-pr-$PR.log). Nothing was merged."
fi
grep -E "^ℹ (pass|fail)" "/tmp/merge-pr-$PR.log" || true
echo "== Verifying signatures on the merged result"
sh "$HERE/verify-commits.sh" HEAD || die "the merged result fails the signature check. Nothing was pushed."

if [ "$PUSH" = "--push" ]; then
  git push origin main
  echo "== Pushed. The deploy runs now (GitHub Action, then the 5-minute cron as backup)."
else
  echo "== Ready: the signed merge is on your local main. Push it with:  git push origin main"
  echo "   (or undo it with:  git reset --merge ORIG_HEAD)"
fi
