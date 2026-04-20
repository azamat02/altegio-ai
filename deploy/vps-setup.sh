#!/bin/bash
set -e

echo "Installing Docker..."
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

echo "Installing certbot..."
apt-get update && apt-get install -y certbot python3-certbot-nginx

echo "Creating app user..."
useradd -m -s /bin/bash altegio || true
usermod -aG docker altegio

echo "Cloning repo..."
sudo -u altegio git clone https://github.com/azamat02/altegio-ai.git /home/altegio/altegio-ai || true

echo "Copy .env from template; fill secrets manually."
if [ ! -f /home/altegio/altegio-ai/.env ]; then
  sudo -u altegio cp /home/altegio/altegio-ai/.env.example /home/altegio/altegio-ai/.env
fi

echo "Done. Next: edit /home/altegio/altegio-ai/.env and run deploy/deploy.sh"
