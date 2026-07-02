#!/bin/bash
set -e

cd "$(dirname "$0")/.."
git pull origin main

COMPOSE=(docker compose --env-file .env -f docker/docker-compose.prod.yml)
"${COMPOSE[@]}" pull
"${COMPOSE[@]}" up -d
# nginx.conf is bind-mounted; `up -d` does not recreate on a file change,
# so force-recreate nginx to pick up config edits (e.g. cert paths, server_name).
"${COMPOSE[@]}" up -d --force-recreate --no-deps nginx
docker image prune -f

# --- health check: fail the deploy if the stack didn't come up ---
echo "Waiting for API health..."
ok=false
for _ in $(seq 1 20); do
  if "${COMPOSE[@]}" exec -T api wget -qO- http://127.0.0.1:3000/health 2>/dev/null | grep -q '"status":"ok"'; then
    ok=true
    break
  fi
  sleep 3
done

if [ "$ok" != true ]; then
  echo "DEPLOY FAILED: API did not become healthy in time." >&2
  "${COMPOSE[@]}" ps
  "${COMPOSE[@]}" logs --tail 30 api >&2 || true
  exit 1
fi

if ! "${COMPOSE[@]}" ps nginx | grep -q "Up"; then
  echo "DEPLOY FAILED: nginx is not running." >&2
  "${COMPOSE[@]}" logs --tail 20 nginx >&2 || true
  exit 1
fi

echo "Deploy complete. API healthy, nginx up."
