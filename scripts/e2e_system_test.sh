#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Building and starting stack"
docker compose -f "${ROOT_DIR}/infra/docker-compose.yml" up -d --build

echo "==> Waiting for backend health"
for _ in {1..30}; do
  if curl -fsS "http://localhost:8080/health" >/dev/null; then
    break
  fi
  sleep 1
done
curl -fsS "http://localhost:8080/health" >/dev/null

echo "==> Running strict backend E2E check (HTTP + CORS + WS)"
docker compose -f "${ROOT_DIR}/infra/docker-compose.yml" exec -T backend-api python -m app.e2e_check

echo "==> E2E system test passed"
