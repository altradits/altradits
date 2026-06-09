.PHONY: help setup verify dev dev-db dev-backend dev-frontend dev-all build test migrate-up migrate-down db-reset build-backend

# Run all commands from the repo root (go.mod lives here).
ROOT := $(CURDIR)
export GOPATH ?= $(HOME)/go
export GOMODCACHE ?= $(GOPATH)/pkg/mod

help:
	@echo "Altradits — common commands"
	@echo ""
	@echo "  make setup         First-time setup after clone"
	@echo "  make verify        Check db, redis, and running services"
	@echo "  make dev-db        Start Postgres + Redis only"
	@echo "  make migrate-up    Apply database migrations"
	@echo "  make dev-backend   Run Go API (port 8080)"
	@echo "  make dev-frontend  Run Next.js dev server (port 3000)"
	@echo "  make dev-all       Start db/cache, migrate, then print next steps"
	@echo "  make dev           Docker full stack (db + cache + api + web)"
	@echo "  make db-reset      Wipe database volume and re-migrate"
	@echo "  make test          Run backend tests"
	@echo "  make build-backend Build API binary to server/bin/altradits"

setup:
	@chmod +x scripts/setup.sh scripts/verify.sh scripts/docker-api-entrypoint.sh
	@./scripts/setup.sh

verify:
	@chmod +x scripts/verify.sh
	@./scripts/verify.sh

dev-db:
	docker compose up -d db cache
	@echo "Waiting for services..."
	@sleep 3
	@docker compose ps db cache

migrate-up:
	@test -f .env || (echo "Missing .env — run: cp .env.example .env" && exit 1)
	go run server/cmd/migrate/main.go up

migrate-down:
	go run server/cmd/migrate/main.go down

db-reset:
	docker compose down -v
	docker compose up -d db cache
	@echo "Waiting for database..."
	@sleep 5
	$(MAKE) migrate-up

dev-backend:
	@test -f .env || (echo "Missing .env — run: cp .env.example .env" && exit 1)
	@command -v air >/dev/null 2>&1 && air -c server/.air.toml || go run server/cmd/api/main.go

dev-frontend:
	cd apps/web && npm run dev

dev-all: dev-db migrate-up
	@echo ""
	@echo "Infrastructure ready. In separate terminals run:"
	@echo "  make dev-backend"
	@echo "  make dev-frontend"
	@echo ""
	@echo "Open http://localhost:3000"

dev:
	docker compose --profile full up --build

build:
	docker compose --profile full build

build-backend:
	@mkdir -p server/bin
	go build -o server/bin/altradits ./server/cmd/api

test:
	go test ./server/...
