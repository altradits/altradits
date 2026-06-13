#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

fail() { echo "FAIL: $1"; exit 1; }
ok()   { echo "OK:   $1"; }

echo "==> Verifying Altradits stack"

# Load env if present
if [ -f .env ]; then set -a; source .env; set +a; fi

# Docker services
docker compose ps db cache | grep -q "Up" || fail "db/cache containers are not running (run: make dev-db)"
ok "Docker db + cache running"

# Database reachable
docker compose exec -T db pg_isready -U postgres -d altradits >/dev/null || fail "PostgreSQL not accepting connections"
ok "PostgreSQL accepting connections"

# Redis reachable
docker compose exec -T cache redis-cli ping | grep -q PONG || fail "Redis not responding"
ok "Redis responding"

# API health (optional — only if API is running)
if curl -sf http://localhost:8080/health >/dev/null 2>&1; then
  HEALTH=$(curl -s http://localhost:8080/health)
  STATUS=$(echo "$HEALTH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null || echo "")
  [ "$STATUS" = "ok" ] || [ "$STATUS" = "degraded" ] || fail "API health check returned unexpected status"
  ok "API health endpoint ($STATUS)"

  # Lightning provider — "lnd" means a real node (e.g. Polar's bob) answered
  # getinfo at startup; "mock" means LND_REST_HOST is unset/unreachable.
  LND_MODE=$(echo "$HEALTH" | python3 -c "import sys,json; l=json.load(sys.stdin).get('lightning',{}); print(l.get('mode',''), l.get('connected', False), l.get('alias',''))" 2>/dev/null || echo "")
  set -- $LND_MODE
  LND_MODE_NAME=${1:-} LND_CONNECTED=${2:-} LND_ALIAS=${3:-}
  if [ "$LND_MODE_NAME" = "lnd" ]; then
    [ "$LND_CONNECTED" = "True" ] || fail "Lightning provider is 'lnd' but not connected — restart with: make dev-lightning"
    ok "Lightning node connected (lnd: $LND_ALIAS)"
  else
    echo "SKIP: Lightning provider is 'mock' (set LND_REST_HOST in .env and run: make dev-lightning)"
  fi
else
  echo "SKIP: API not running on :8080 (start with: make dev-backend)"
fi

# Frontend (optional)
if curl -sf http://localhost:3000 >/dev/null 2>&1; then
  ok "Frontend reachable on :3000"
else
  echo "SKIP: Frontend not running on :3000 (start with: make dev-frontend)"
fi

echo ""
echo "Verification complete."
