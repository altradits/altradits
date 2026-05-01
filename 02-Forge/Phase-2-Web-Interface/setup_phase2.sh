#!/bin/bash

echo "🚀 Provisioning Phase 2 Environment..."

# Create project tree
mkdir -p cmd/server templates/partials templates/layouts static/css static/js

# Initialize Module
if [ ! -f "go.mod" ]; then
    go mod init altradits/web
fi

# Fetch Core Dependencies
echo "📦 Installing Chi Router and SQLite..."
go get github.com/go-chi/chi/v5
go get github.com/go-chi/chi/v5/middleware
go get modernc.org/sqlite

# Local Vendoring for HTMX (Reliability)
echo "🌐 Downloading HTMX..."
curl -L https://unpkg.com/htmx.org@1.9.10/dist/htmx.min.js -o static/js/htmx.min.js

# Setup Tailwind Input
echo "@tailwind base; @tailwind components; @tailwind utilities;" > static/css/input.css

go mod tidy

echo "✅ Environment Ready for Day 051."