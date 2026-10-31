#!/bin/sh
# Verify that main contains only commits signed by a trusted key, the way
# Bitcoin Core's contrib/verify-commits does. Every commit on the first-parent
# line after TRUST_ROOT (each merge, and anything committed directly) must carry
# a good SSH signature from a key in the trusted-signers file. Contributors'
# own commits (reached through a merge's second parent) may be unsigned: the
# signed merge is the maintainer vouching for them after review.
#
#   sh deploy/verify-commits.sh [ref] [allowed-signers-file]
#     ref                    default: HEAD
#     allowed-signers-file   default: .github/allowed_signers
#
# The live server runs it before every deploy with its OWN copy of the trusted
# keys (~/.altradits-allowed-signers, outside the repository), so a stolen
# GitHub login can push code but can never get unsigned code deployed.
# Exit 0: all good. Exit 1: something is unsigned, signed by an unknown key, or
# the trust root isn't an ancestor (rewritten history).
set -u
# Everything up to here predates signing (30 Oct 2026). Never move this backwards.
# (Same commit as 2ef931f, renumbered on 31 Oct 2026 when an AI co-author line
# was removed from an older commit message.)
TRUST_ROOT=3c9ca96542d750fc51b62df42cb93be251920c09
REF="${1:-HEAD}"
SIGNERS="${2:-.github/allowed_signers}"

[ -f "$SIGNERS" ] || { echo "verify-commits: trusted signers file not found: $SIGNERS"; exit 1; }
if ! git merge-base --is-ancestor "$TRUST_ROOT" "$REF" 2>/dev/null; then
  echo "verify-commits: the trust root $TRUST_ROOT is not an ancestor of $REF (history rewritten, or not fetched)."
  exit 1
fi
bad=0; n=0
for c in $(git rev-list --first-parent "$TRUST_ROOT..$REF"); do
  n=$((n + 1))
  if ! git -c gpg.format=ssh -c gpg.ssh.allowedSignersFile="$SIGNERS" verify-commit "$c" >/dev/null 2>&1; then
    echo "verify-commits: NOT trusted: $(git log -1 --format='%h %an: %s' "$c")"
    bad=$((bad + 1))
  fi
done
if [ "$bad" -gt 0 ]; then echo "verify-commits: $bad of $n commit(s) after the trust root are not signed by a trusted key."; exit 1; fi
echo "verify-commits: $n commit(s) after the trust root, all signed by trusted keys."
