#!/bin/sh
# Deploys main to altradits.com. Triggered two ways: instantly by the GitHub
# Action in .github/workflows/deploy.yml (via POST /api/deploy), and as a
# backup by DirectAdmin cron every 5 minutes:
#   */5 * * * * cd /home/altradit/domains/altradits.com/public_html && { [ -f deploy/cron.sh ] || { git fetch -q origin main && git reset -q --hard origin/main; }; } && sh deploy/cron.sh >> /home/altradit/deploy.log 2>&1
# It hard-resets to origin/main (so hand edits on the server can never block a
# deploy), installs dependencies when they change, and restarts the Node app.
set -e
cd "$(dirname "$0")/.."
APP_DIR=$(pwd)

# One deploy at a time (cron and webhook can fire together). A lock older than
# 10 minutes is from a run that died, so it is cleared.
find . -maxdepth 1 -name .deploy.lock -mmin +10 -exec rmdir {} \; 2>/dev/null || true
mkdir .deploy.lock 2>/dev/null || exit 0
trap 'rmdir .deploy.lock 2>/dev/null' EXIT

# The Deadman's Switch file check defers while a deploy runs: judging a
# half-written tree froze money-out on 6 Nov 2026. The marker records the
# window (start/end); a run that dies leaves "in-progress", which the check
# treats as stale after 15 minutes. Timestamps and commit hashes only.
MARKER="$APP_DIR/.deploy-marker.json"
marker() { printf '{"state":"%s","startedAt":"%s","endedAt":"%s","oldHead":"%s","newHead":"%s","changed":%s}\n' "$1" "$2" "$3" "$4" "$5" "$6" > "$MARKER" 2>/dev/null || true; }

# A failed fetch (GitHub down, or the deploy key missing) must not stop the
# rest: the keep-warm ping below runs the daily backup and follow-ups. It is
# logged once an hour, not every 5 minutes. Never prompt for a password.
export GIT_TERMINAL_PROMPT=0
OLD=$(git rev-parse HEAD)
STARTED=$(date -u +%FT%TZ)
marker "in-progress" "$STARTED" "" "$OLD" "" "false"
if git fetch -q origin main 2>/dev/null; then
  NEW=$(git rev-parse origin/main)
else
  NEW=$OLD
  [ "$(date +%M | sed 's/^0//')" -lt 5 ] && echo "$(date -u +%FT%TZ) git fetch failed: the site keeps running $(git log -1 --format=%h). Check the server's deploy key." || true
fi
# Signed code only (Bitcoin Core's verify-commits model). Once the server has
# its own copy of the trusted keys, outside the repository, a main that isn't
# signed by them is never deployed: the site keeps running the last good code.
# The check runs from the code already deployed, never from what was fetched.
SIGNERS="$HOME/.altradits-allowed-signers"
if [ "$OLD" != "$NEW" ] && [ -f "$SIGNERS" ]; then
  if ! { [ -f deploy/verify-commits.sh ] && sh deploy/verify-commits.sh origin/main "$SIGNERS" > /dev/null 2>&1; }; then
    echo "$(date -u +%FT%TZ) REFUSED $(git log -1 --format='%h %s' origin/main): main has commits not signed by a trusted key. Still running $(git log -1 --format=%h)."
    NEW=$OLD
  fi
fi
CHANGED=""
if [ "$OLD" != "$NEW" ]; then
  CHANGED=$(git diff --name-only "$OLD" "$NEW")
  git reset -q --hard origin/main
  echo "$(date -u +%FT%TZ) deployed $(git log -1 --format='%h %s')"
fi

# Dependencies live in the Node.js App's virtualenv (~/nodevenv/...).
VENV=$(ls -d "$HOME/nodevenv/${APP_DIR#$HOME/}"/*/bin 2>/dev/null | sort -V | tail -1 || true)
if [ -n "$VENV" ]; then
  if [ ! -e node_modules/nodemailer ] || echo "$CHANGED" | grep -qE '^package(-lock)?\.json$'; then
    . "$VENV/activate"
    # No package install scripts run on the server (versions are pinned in package.json
    # and package-lock.json). Not "npm ci": it deletes node_modules, which on this host
    # is a link into the Node.js App's environment.
    npm install --omit=dev --ignore-scripts --no-audit --no-fund --loglevel=error
    CHANGED="${CHANGED} deps"
    deactivate 2>/dev/null || true
  fi
fi

# Dependencies are code too: Apache must never serve them as files.
[ -d node_modules ] && ! cmp -s deploy/deny.htaccess node_modules/.htaccess && cp deploy/deny.htaccess node_modules/.htaccess || true

# Restart Passenger only when something changed.
if [ -n "$CHANGED" ]; then
  mkdir -p tmp && touch tmp/restart.txt
fi

# The deploy window ends here: the tree is final, so the file check may judge it again.
if [ -n "$CHANGED" ]; then marker "done" "$STARTED" "$(date -u +%FT%TZ)" "$OLD" "$(git rev-parse HEAD)" "true";
else marker "done" "$STARTED" "$(date -u +%FT%TZ)" "$OLD" "$OLD" "false"; fi

# Keep the app warm. Each ping also runs any daily or hourly job that is due
# (backup, follow-ups, held payments), even if the app was just restarted.
curl -fsS -o /dev/null --max-time 20 "${SITE_URL:-https://altradits.com}/healthz" || true
