.PHONY: help setup verify dev dev-db dev-lightning lightning-status dev-backend dev-frontend build test migrate-up migrate-down db-reset build-backend

# Run all commands from the repo root (go.mod lives here).
ROOT := $(CURDIR)
# Force the module cache under $HOME regardless of any inherited GOPATH —
# some shells export a GOPATH pointing at another user's home directory,
# which breaks `go build`/`go run` with a permission error.
export GOPATH := $(HOME)/go
export GOMODCACHE := $(GOPATH)/pkg/mod

# Polar's regtest Lightning network (bitcoind + alice/bob LND), managed
# directly via its docker-compose file — no need to launch the Polar
# Electron GUI. Skipped if Polar hasn't been set up on this machine.
POLAR_COMPOSE := $(HOME)/.polar/networks/1/docker-compose.yml
POLAR_BOB_DIR := $(HOME)/.polar/networks/1/volumes/lnd/bob
POLAR_BOB_CERT := $(POLAR_BOB_DIR)/tls.cert
POLAR_BOB_MACAROON := $(POLAR_BOB_DIR)/data/chain/bitcoin/regtest/admin.macaroon

help:
	@echo "Altradits — common commands"
	@echo ""
	@echo "  make setup         First-time setup after clone"
	@echo "  make verify        Check db, redis, and running services"
	@echo "  make dev-db        Start Postgres + Redis only"
	@echo "  make dev-lightning Start Polar's regtest Lightning network (bitcoind + LND), if configured"
	@echo "  make lightning-status [NODE=bob] Show real getinfo/balances/channels for a Polar LND node"
	@echo "  make migrate-up    Apply database migrations"
	@echo "  make dev-backend   Run Go API (port 8080) — also starts db/cache/lightning + migrates"
	@echo "  make dev-frontend  Run Next.js dev server (port 3000)"
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

dev-lightning:
	@if [ -f "$(POLAR_COMPOSE)" ]; then \
		echo "Starting Polar Lightning regtest network..."; \
		docker compose -f "$(POLAR_COMPOSE)" -p polar-network-1 up -d; \
		echo "Waiting for bob's LND REST API to authenticate (this is what NewLightningProvider checks)..."; \
		for i in $$(seq 1 60); do \
			if [ -f "$(POLAR_BOB_MACAROON)" ] && [ -f "$(POLAR_BOB_CERT)" ]; then \
				MACAROON_HEX=$$(xxd -p -c 10000 "$(POLAR_BOB_MACAROON)" 2>/dev/null); \
				curl -sf --max-time 2 --cacert "$(POLAR_BOB_CERT)" -H "Grpc-Metadata-macaroon: $$MACAROON_HEX" https://127.0.0.1:8082/v1/getinfo 2>/dev/null | grep -q identity_pubkey && { echo "bob's LND REST API is up and authenticated"; break; }; \
			fi; \
			sleep 2; \
		done; \
	else \
		echo "Polar network not found at $(POLAR_COMPOSE) — skipping"; \
	fi

lightning-status:
	@chmod +x scripts/lightning-status.sh
	@./scripts/lightning-status.sh $(NODE)

dev-backend: dev-db dev-lightning migrate-up
	go run server/cmd/api/main.go

dev-frontend:
	cd apps/web && npm run dev

dev:
	docker compose --profile full up --build

build:
	docker compose --profile full build

build-backend:
	@mkdir -p server/bin
	go build -o server/bin/altradits ./server/cmd/api

test:
	go test ./server/...
