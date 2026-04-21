#!/bin/bash
set -e

cd "$(dirname "$0")/.."
git pull origin main

COMPOSE=(docker compose --env-file .env -f docker/docker-compose.prod.yml)
"${COMPOSE[@]}" pull
"${COMPOSE[@]}" up -d
docker image prune -f
echo "Deploy complete."
