# TMA dashboard — runbook

1. `pnpm --filter @altegio/api start` (API on :3000; ensure DB + TELEGRAM_BOT_TOKEN set).
2. `cloudflared tunnel --url http://localhost:3000` → copy the https URL.
3. In API env set `TMA_ORIGINS=https://<vercel-app>` (and the tunnel origin for local dev); restart API.
4. Deploy `apps/tma` to Vercel; set `VITE_API_URL=<tunnel https url>`.
5. In @BotFather set the bot Menu Button / Web App URL to the Vercel URL, or use the bot's inline WebApp button.
6. Open the bot → dashboard button → verify Summary + Мастера show real data.
