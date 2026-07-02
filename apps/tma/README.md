# TMA dashboard — runbook

1. `pnpm --filter @altegio/api start` (API on :3000; ensure DB + TELEGRAM_BOT_TOKEN set).
2. `cloudflared tunnel --url http://localhost:3000` → copy the https URL.
3. In API env set `TMA_ORIGINS=https://<vercel-app>` (and the tunnel origin for local dev); restart API.
4. Deploy `apps/tma` to Vercel; set `VITE_API_URL=<tunnel https url>`.
5. In @BotFather set the bot Menu Button / Web App URL to the Vercel URL, or use the bot's inline WebApp button.
6. Open the bot → dashboard button → verify Summary + Мастера show real data.

## v2a smoke (in Telegram, BrowUp data)
- Phone (iOS/Android): TMA opens fullscreen, header not under the status bar; desktop clients open in the normal expanded sheet.
- Summary: week/month delta chips under revenue.
- Мастера: each card has ▲/▼/«новый» badge; salon totals line under the period selector; switching period refetches both.
- Tap a master → detail screen (trend, услуги, клиенты, отмены/no-show); native Back button returns to the list; period is inherited.
- `/tma/staff` WITHOUT compare=1 still returns the v1 array (curl check).
