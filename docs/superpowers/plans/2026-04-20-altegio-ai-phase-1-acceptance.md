# Phase 1 — Acceptance Log

**Date:** 2026-04-21
**Environment:** production VPS `altegio.tolemflow.kz` (178.128.202.65)
**Tenant under test:** BrowUp (Салон №1, Алматы), location_id `198823`

## Infra

- VPS: Ubuntu 22.04.5, Docker 29.4.0
- Prod compose: `docker-compose.prod.yml` (postgres:16 + redis:7 + api + nginx:alpine)
- API image: `ghcr.io/azamat02/altegio-ai-api:latest` (public, pulled from GHCR, built by GH Actions CI)
- TLS: Let's Encrypt, standalone certbot, domain `altegio.tolemflow.kz`, auto-renew wired via pre/post hooks (pre stops nginx container, post restarts it)
- Scheduler: `SCHEDULER_ENABLED=true`, cron `0 * * * * *` matches tenants where local time = `report_time` (09:00)

## Live run

- `curl https://altegio.tolemflow.kz/health` → `200 {"status":"ok","db":"up","uptime":28}`
- CLI `add-salon` created tenant `fe952c56-af0a-4f33-aa00-27b8dd293a8a`
- CLI `link-telegram --chat 637406749 --enable` attached owner chat, `report_enabled=true`
- CLI `trigger-sync --days 30` backfilled raw + facts + aggregates
- CLI `trigger-report --date 2026-04-20 --dry-run` rendered full Russian morning report from real BrowUp data:
  - Выручка 2 899 953 ₸ (+7% к 7d avg)
  - Визитов 93/0 (0% отмен), ср. чек 31 182 ₸
  - Топ-3: Оксана Гарифзянова, Гульнара, Насиба
  - Сегодня: 59 записей, загрузка 100%, пустые слоты 19:00
  - AI-инсайт (Claude haiku-4.5) объяснил рост среднего чека
- CLI `trigger-report --date 2026-04-20` (live send) — delivered to owner's TG (chat 637406749), confirmed by user
- Idempotency: re-run of same `--date` left `report_deliveries` at a single row

## DB state

```
SELECT tenant_id, date, status, sent_at FROM report_deliveries;
  fe952c56-af0a-4f33-aa00-27b8dd293a8a | 2026-04-19 | sent | 2026-04-21 08:23:20.826+00
```

## Known issues to watch in the first 48h

- Scheduler fires every minute — verify tomorrow at 09:00 Almaty (04:00 UTC) that the enqueue + send path works autonomously (the CLI path was exercised by hand; the scheduler path is only exercised by the clock). Log line to grep: `Enqueued report for Салон №1, Алматы`.
- Cert auto-renew will fire twice daily via systemd timer; hooks are verified via `certbot renew --dry-run`. First real renew due around 2026-06-20.
- BrowUp token / TG bot token / Anthropic key were exposed in a prior session — rotate after first 24h of stable running.
- UFW has docker daemon ports 2375/2376 allow-listed (inherited from provisioning). Docker is not listening on them so there is no live exposure, but the rules should be removed.
