# Altradits Phase 2: Web Architecture Manifest

## 1. Backend: Go 1.21+
- **Router:** `chi` (Lightweight, idiomatic, middleware-optimized).
- **Templating:** `html/template` (Standard library, auto-escaping for security).
- **SQL Driver:** `modernc.org/sqlite` (Pure Go SQLite driver, no CGO required).

## 2. Frontend: The "Thin-Client" Stack
- **HTMX:** v1.9.10+ (AJAX-driven UI).
- **Tailwind CSS:** v3.4+ (Utility-first styling).

## 3. Tooling
- **Air:** For live-reloading Go code.
- **SQLite3 CLI:** For manual ledger inspection.