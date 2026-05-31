.PHONY: dev build test migrate seed dev-db dev-backend dev-frontend migrate-up migrate-down db-reset build-backend

dev:
	docker compose up --build

build:
	docker compose build

test:
	go test ./server/... -v

migrate:
	# Placeholder for migration command
	@echo "Run migrations"

seed:
	# Placeholder for seed command
	@echo "Run seeds"

# ── Altradits dev targets ──────────────────────────────────────────────────

## Start infrastructure only (Postgres + Redis via docker-compose)
dev-db:
	docker compose up -d db cache
	@echo "Waiting for services to be ready..."
	@sleep 3
	@docker compose ps

## Run the Go backend with Air live reload
dev-backend:
	cd server && air

## Run the Next.js frontend dev server
dev-frontend:
	cd apps/web && npm run dev

## Apply all pending migrations
migrate-up:
	cd server && go run ./cmd/migrate/main.go up

## Roll back the last migration
migrate-down:
	cd server && go run ./cmd/migrate/main.go down

## Wipe and recreate the database from scratch
db-reset:
	docker compose down -v
	docker compose up -d db cache
	@sleep 4
	$(MAKE) migrate-up

## Build the backend binary
build-backend:
	cd server && go build -o ./bin/altradits ./cmd/api

## Run all backend tests
test:
	cd server && go test ./...
