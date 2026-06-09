#!/bin/sh
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL is not set"
  exit 1
fi

echo "Waiting for PostgreSQL..."
until /app/altradits-migrate up 2>/dev/null; do
  echo "  database not ready — retrying in 2s"
  sleep 2
done

echo "Starting API..."
exec /app/altradits-api
