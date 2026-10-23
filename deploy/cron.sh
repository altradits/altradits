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

git fetch -q origin main
OLD=$(git rev-parse HEAD)
NEW=$(git rev-parse origin/main)
CHANGED=""
if [ "$OLD" != "$NEW" ]; then
  CHANGED=$(git diff --name-only "$OLD" "$NEW")
  git reset -q --hard origin/main
  echo "$(date -u +%FT%TZ) deployed $(git log -1 --format='%h %s')"
fi

# Dependencies live in the Node.js App's virtualenv (~/nodevenv/...).
VENV=$(ls -d "$HOME/nodevenv/${APP_DIR#$HOME/}"/*/bin 2>/dev/null | sort -V | tail -1 || true)
if [ -n "$VENV" ]; then
  if [ ! -e node_modules/@anthropic-ai/sdk ] || echo "$CHANGED" | grep -qE '^package(-lock)?\.json$'; then
    . "$VENV/activate"
    npm install --omit=dev --no-audit --no-fund --loglevel=error
    CHANGED="${CHANGED} deps"
    deactivate 2>/dev/null || true
  fi
fi

# Restart Passenger only when something changed.
if [ -n "$CHANGED" ]; then
  mkdir -p tmp && touch tmp/restart.txt
fi

# Keep the app warm (fast first chat reply, daily follow-up timer alive).
curl -fsS -o /dev/null --max-time 20 "${SITE_URL:-https://altradits.com}/healthz" || true
