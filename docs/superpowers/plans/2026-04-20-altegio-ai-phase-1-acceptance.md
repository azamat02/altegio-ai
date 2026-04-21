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

---

# Phase 1.1 — Acceptance Log (dual-message morning report)

**Date:** 2026-04-21 (same day as Phase 1 first live run — Phase 1 report fired once this morning, Phase 1.1 replaces it starting tomorrow)
**Tag:** `v0.2.0-phase1-1` → commit `0ec74fd`
**Spec:** [`docs/superpowers/specs/2026-04-21-phase-1-1-dual-message-report-design.md`](../specs/2026-04-21-phase-1-1-dual-message-report-design.md)
**Plan:** [`docs/superpowers/plans/2026-04-21-altegio-ai-phase-1-1.md`](2026-04-21-altegio-ai-phase-1-1.md)

## What changed on the VPS

- Migrations 1700000006 → 1700000010 applied cleanly on the live Postgres (10 migrations total, per `SELECT name FROM migrations`).
- Prod compose still pulls `ghcr.io/azamat02/altegio-ai-api:latest` — Dockerfile unchanged, CI publishes on every push to main.
- `SCHEDULER_ENABLED=true` — tomorrow's 09:00 Almaty tick now fires **two** messages instead of one.

## Deviations from the spec, captured in flight

1. Altegio does not expose `/timetable/resources/{loc}/{res}` for this location tier. Swapped to `/company/{id}/staff/schedule` — capacity is now staff-based, not resource-based. Slightly inflated when two staff share a cabinet, but the **relative** category signal (which is the owner's ask — "where to push ads") is preserved.
2. `records.seance_length` is in seconds (Altegio convention). All capacity math divides by 60 on the read side. Column type untouched.
3. Added an unplanned migration `1700000009000-AddRecordServiceId` — `records.altegio_service_id` was missing but required for category joins.
4. Added an unplanned migration `1700000010000-CreateServiceCategories` — Altegio returns category titles from `/service_categories/{id}` separate from `/services/{id}`. Pulled into its own table; `todayCategoryFillRates` joins to get proper titles instead of the `MIN(service.title)` placeholder.
5. `report_deliveries` PK was rebuilt from `(tenant_id, date)` to `(tenant_id, date, message_kind)`. Existing Phase 1 row for `2026-04-19` coexists with the new Phase 1.1 rows.

## First live run on prod data (BrowUp)

```
---8<--- [yesterday] ---8<---
☀ Доброе утро! Салон №1, Алматы
📊 Вчера · Пн, 20 апр

• Выручка:      1 460 761 ₸ (−48% к 7d avg)
• Визитов:      58
• Средний чек:  25 186 ₸
• Загрузка:     32%
• План месяца:  74% (45.2М из 61.3М)

🏆 Топ-3 мастера
1. Дина — 225 000 ₸ (1 визит)
2. Евгения — 209 333 ₸ (4 визита)
3. Гульнара — 180 000 ₸ (4 визита)
---8<--- [today] ---8<---
📅 Сегодня · Вт, 21 апр

• Записей:  70
• Загрузка: 51%

📊 Заполненность по категориям
• Услуги nail стилистов         42% (23 зап.)
• Услуги бровистов-визажистов   39% (18 зап.)
• Наращивание ресниц            68% (11 зап.)
• Услуги hair стилистов         73% (10 зап.)
• Процедуры по телу             20%  (2 зап.)
---8<---
```

Both messages delivered to Telegram chat `637406749`, spacing ≈1 s. User confirmed receipt.

## DB state after first Phase 1.1 delivery

```
SELECT tenant_id, date, message_kind, status, sent_at
FROM report_deliveries ORDER BY sent_at DESC LIMIT 5;

 fe952c56-af0a-4f33-aa00-27b8dd293a8a | 2026-04-20 | today     | sent | 2026-04-21 17:12:04.72+00
 fe952c56-af0a-4f33-aa00-27b8dd293a8a | 2026-04-20 | yesterday | sent | 2026-04-21 17:12:03.619+00
 fe952c56-af0a-4f33-aa00-27b8dd293a8a | 2026-04-19 | yesterday | sent | 2026-04-21 08:23:20.826+00   ← Phase 1 original
```

Idempotency: a second `trigger-report --date 2026-04-21` produced no new rows and no new TG messages (rejected silently at the `sent`-row check).

## Data freshness

- `resource_schedule`: 2 746 rows, 39 staff, window `2025-12-22 .. 2026-04-22`.
- `resource_category_affinity`: 56 rows across 10 categories (single tenant).
- `service_categories`: 12 titles (Altegio's full category list for BrowUp).
- `records`: 11 546 total, 11 148 attended — 120-day backfill via `trigger-sync --onboard`.

## Known follow-ups after Phase 1.1

- Capacity is still inflated when two staff share one physical cabinet. Fix needs a per-salon "effective seat count" config. Deferred — current relative signal is already useful for the owner's ad-spend decision.
- `resources` and `ResourcesEndpoint` are now unused dead code. Clean up in a later PR; migration 1700000006 keeps the `resources` table as an empty catalog for now.
- Node 20 deprecation warning from GitHub Actions runners (`actions/checkout@v4` etc.) — bump action versions by June 2026.
- Secret rotation from Phase 1 still pending (BrowUp/TG/Anthropic).
