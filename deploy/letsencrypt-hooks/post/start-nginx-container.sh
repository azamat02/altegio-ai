#!/bin/bash
# certbot post-renew hook: restart the nginx container after certbot finishes
# (runs on both success and failure, so service is restored either way).
cd /opt/altegio-ai && docker compose --env-file .env -f docker/docker-compose.prod.yml up -d nginx
