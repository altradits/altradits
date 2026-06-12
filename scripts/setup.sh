#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Force the module cache under $HOME — some shells export a GOPATH pointing
# at another user's home directory, which breaks `go` with a permission error.
export GOPATH="$HOME/go"
export GOMODCACHE="$GOPATH/pkg/mod"

echo "==> Altradits setup"

if [ ! -f .env ]; then
  echo "Creating .env from .env.example"
  cp .env.example .env
  echo "  Edit .env if you need custom database credentials or AI keys."
else
  echo ".env already exists — skipping"
fi

if [ ! -f apps/web/.env.local ]; then
  echo "Creating apps/web/.env.local"
  cp apps/web/.env.example apps/web/.env.local
fi

echo "==> Starting PostgreSQL and Redis (Docker)"
docker compose up -d db cache

echo "==> Waiting for database..."
for i in $(seq 1 30); do
  if docker compose exec -T db pg_isready -U postgres -d altradits >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "==> Installing Go dependencies"
go mod download

echo "==> Running database migrations"
go run server/cmd/migrate/main.go up

echo "==> Installing frontend dependencies"
(cd apps/web && npm install)

echo ""
echo "Setup complete."
echo ""
echo "Start the backend (terminal 1):"
echo "  make dev-backend"
echo ""
echo "Start the frontend (terminal 2):"
echo "  make dev-frontend"
echo ""
echo "Then open http://localhost:3000"
