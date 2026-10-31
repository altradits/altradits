#!/bin/sh
# Every commit is Altradits' own: no AI co-author or session lines in messages,
# and no AI author or committer address. GitHub lists anyone named in a
# "Co-Authored-By:" line as a contributor, so one such line is enough.
#
#   sh deploy/no-ai-coauthor.sh [rev-range]   default: HEAD (all of history)
#   sh deploy/no-ai-coauthor.sh --message FILE (used by .githooks/commit-msg)
set -u
LINES='^(co-authored-by:.*(claude|anthropic)|claude-session:)|noreply@anthropic\.com|generated with \[?claude'
EMAILS='@anthropic\.com$'

if [ "${1:-}" = "--message" ]; then
  if grep -i -E -q "$LINES" "$2"; then
    echo "commit-msg: remove the AI co-author or session line from the message. Refused:"
    grep -i -E "$LINES" "$2" | sed 's/^/  /'
    exit 1
  fi
  exit 0
fi

bad=$(for c in $(git rev-list "${1:-HEAD}"); do
  if git log -1 --format=%B "$c" | grep -i -E -q "$LINES" || git log -1 --format='%ae%n%ce' "$c" | grep -i -E -q "$EMAILS"; then
    git log -1 --format='  %h %s' "$c"
  fi
done)
if [ -n "$bad" ]; then
  echo "no-ai-coauthor: these commits name an AI co-author or author (GitHub would list it as a contributor):"
  echo "$bad"
  exit 1
fi
echo "no-ai-coauthor: no AI co-authors."
