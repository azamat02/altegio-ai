#!/bin/bash
# Idempotent VPS bootstrap. Safe to re-run.
set -euo pipefail

REPO_SSH="git@github.com:azamat02/altegio-ai.git"
APP_DIR="/opt/altegio-ai"

echo "==> Ensuring Docker is installed..."
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi

echo "==> Installing certbot (standalone mode; nginx runs in container)..."
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq certbot git

echo "==> Ensuring SSH deploy key exists for github.com..."
if [ ! -f /root/.ssh/id_ed25519 ]; then
  mkdir -p /root/.ssh && chmod 700 /root/.ssh
  ssh-keygen -t ed25519 -N "" -C "altegio-vps-$(hostname)" -f /root/.ssh/id_ed25519
fi

if ! grep -q "github.com" /root/.ssh/known_hosts 2>/dev/null; then
  ssh-keyscan -t ed25519 github.com >> /root/.ssh/known_hosts
fi

echo "==> Public deploy key (add to GitHub → repo Settings → Deploy keys):"
cat /root/.ssh/id_ed25519.pub
echo

echo "==> Cloning repository (requires deploy key to be added on GitHub)..."
if [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPO_SSH" "$APP_DIR"
else
  git -C "$APP_DIR" fetch --prune && git -C "$APP_DIR" reset --hard origin/main
fi

if [ ! -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  echo "==> Copied .env.example -> .env. Fill real secrets next."
fi

echo "==> Wiring certbot renewal hooks (symlinks to repo)..."
mkdir -p /etc/letsencrypt/renewal-hooks/pre /etc/letsencrypt/renewal-hooks/post
ln -sf "$APP_DIR/deploy/letsencrypt-hooks/pre/stop-nginx-container.sh" \
  /etc/letsencrypt/renewal-hooks/pre/stop-nginx-container.sh
ln -sf "$APP_DIR/deploy/letsencrypt-hooks/post/start-nginx-container.sh" \
  /etc/letsencrypt/renewal-hooks/post/start-nginx-container.sh

echo "==> Done. Next steps:"
echo "  1. Add the deploy key above to GitHub repo Deploy keys (read-only is enough)."
echo "  2. nano $APP_DIR/.env  # fill tokens, encryption key, GHCR_OWNER, etc."
echo "  3. ufw allow 80/tcp && ufw allow 443/tcp   # open HTTP/HTTPS"
echo "  4. Issue TLS cert (one-time):"
echo "       certbot certonly --standalone -d altegio.tolemflow.kz -m ${CERT_EMAIL:-azamattolegenov1@gmail.com} --agree-tos --non-interactive"
echo "  5. cd $APP_DIR && ./deploy/deploy.sh"
