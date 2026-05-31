.PHONY: dev build test migrate seed

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
