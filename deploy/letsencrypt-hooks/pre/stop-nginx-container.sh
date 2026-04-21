#!/bin/bash
# certbot pre-renew hook: free port 80 by stopping the nginx container so
# standalone challenge can bind it. Paired with post/start-nginx-container.sh.
cd /opt/altegio-ai && docker compose --env-file .env -f docker/docker-compose.prod.yml stop nginx
