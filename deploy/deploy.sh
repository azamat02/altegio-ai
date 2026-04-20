#!/bin/bash
set -e

cd "$(dirname "$0")/.."
git pull origin main
docker compose -f docker/docker-compose.prod.yml pull
docker compose -f docker/docker-compose.prod.yml up -d
docker image prune -f
echo "Deploy complete."
