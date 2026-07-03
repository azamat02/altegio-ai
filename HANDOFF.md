# Handoff — 2026-07-03 (после цикла v2c)

> Новая сессия: прочитай этот файл + `.superpowers/sdd/progress.md` (ledger последнего цикла).
> Рабочий процесс в проекте: brainstorming → spec → writing-plans → subagent-driven-development
> (свежий субагент на задачу + независимое ревью + финальное opus-ревью ветки) → finishing-branch
> (merge в main + push → CI сам деплоит). Перед мёржем контроллер гоняет ПОЛНЫЙ int-сьют локально
> (`cd apps/api && npx jest --config jest-int.config.js --runInBand`) — субагенты гоняют только
> per-task подмножества, на v2c это чуть не уехало красным в CI.

## Состояние: ВСЁ В ПРОДЕ И РАБОТАЕТ (v2c отгружен)

**Прод:** `https://altegio.167.99.250.107.nip.io` (VPS DigitalOcean 167.99.250.107, nip.io-домен,
Let's Encrypt до 2026-09-30, автопродление). Один nginx: `/` — TMA SPA (статика, собирается на
сервере из `apps/tma/Dockerfile`), `/tma/*` и `/health` — прокси на NestJS API. Стек в
`/opt/altegio-ai`: nginx + api (образ из GHCR, public) + postgres + redis, миграции гоняет
entrypoint при старте.

**CI/CD:** push в `main` → `.github/workflows/ci.yml`: lint+unit+int (бэкенд) ∥ frontend
(tma test+build) → publish-image (GHCR) → deploy (SSH на VPS, `deploy/deploy.sh`). Каждый мёрдж
в main авто-деплоится. CI-run искать по `headSha` через `gh run list --json headSha,...` + jq
(`--commit` может вернуть пусто).

**Бот:** `@altegio_aibot`, поллит на VPS (`BOT_ENABLED=true`). Меню команд, menu-button
«Дашборд», HTML-отчёты, клавиатура 2×2, листание по дням. НЕ запускать локально — 409-конфликт.

**TMA (4 таба, все данные живые):**
- Сводка: KPI, 30-дн график, чипы динамики, фуллскрин ios/android.
- Мастера: сравнение периодов, drill-down по мастеру.
- Потери: hero «~X ₸/год»; **простой считается от целевой загрузки** (`tenants.
  target_utilization_pct`, дефолт 80%, копирайт «до загрузки N%»), CLI `set-target-utilization
  --tenant <id> --pct <n>`.
- Клиенты: пороги 30/60/90, спящие с `tel:`, LTV-топ — **работает с v2c** (27 927 клиентов).
- Все 5 экранных фетчей со stale-response guard (jsdom-контейнерные тесты в
  `clients.container.test.tsx`).

**Клиентский синк (v2c, главный фикс):** `POST /company/{id}/clients/search` — деньги в поле
**`sold_amount`** (не `spent`!), `last_visit_date` = `"YYYY-MM-DD HH:MM:SS"` или `""`. Полный
свип всех страниц (~140 стр / ~50с на 3 rps) на КАЖДОМ синке — намеренно, у визит-счётчиков нет
дельта-сигнала; без транзакции, keyed upsert самолечится (комментарий в `sync.service.ts:86`).
Rate-safe: AltegioClient — DI-синглтон с общим лимитером 3 rps ⇒ ≤180 req/min при worker
concurrency 2. Прод после ресинка: 27 927 клиентов, все с visits/spent, 16 798 с last_visit_date.

**Тенант:** BrowUp Almaty (location 198823), tenant id `9b7615fb-f2e8-41d9-8ef4-11e27ca38c2e`,
owner-чат 637406749. ~2.4М ₸/день, 38 мастеров.

**Auth TMA:** initData HMAC (guard `tma-auth.guard.ts`) + фронтовый фоллбек из launch-hash —
нативный macOS-клиент initData не передаёт (диагностический экран), iOS/Android ок.

## АДЖЕНДА СЛЕДУЮЩЕЙ СЕССИИ (хвосты, ничего срочного)

1. **ANTHROPIC_API_KEY в проде пуст** — AI-инсайт в утреннем отчёте выключен; владелец обещал
   ключ. Следом — AI-консультант (Phase 4).
2. **Owner-проверки на телефоне:** экран «Клиенты» (спящие/LTV живые), «Потери» (простой от 80%,
   вменяемый hero), визуальный прогон 0.7rem таб-лейблов. Если 80% не нравится —
   `set-target-utilization`.
3. **Staff.tsx без error-стейта** — при ошибке фетча молча пустая таблица (пре-существующий
   паттерн, зафиксирован финальным ревью v2c как follow-up на решение владельца).
4. `from/to` не валидируются на `/tma/staff|losses|detail` (пре-существующий паттерн).
5. Зелёный `▲ +0%` в DeltaBadge — осознанно консистентный; GROUP BY title в топ-услуг — осознанный UX.

## Операционные факты

- Деплой руками (если надо): `ssh root@167.99.250.107`, `cd /opt/altegio-ai && ./deploy/deploy.sh`.
- Прод-БД: `docker compose --env-file .env -f docker/docker-compose.prod.yml exec -T postgres
  psql -U altegio -d altegio_ai` (читать осторожно, писать только с одобрения владельца).
- CLI-админка внутри api-контейнера: `docker exec docker-api-1 sh -c 'cd /app &&
  apps/cli/node_modules/.bin/ts-node -r tsconfig-paths/register --project apps/cli/tsconfig.json
  apps/cli/src/main.ts <add-salon|link-telegram|trigger-sync|trigger-report|set-monthly-goal|set-target-utilization>'`.
  (Advisory-lock warnings бота в CLI-бутстрапе — норма.)
- Тесты: `pnpm --filter @altegio/api test` (юнит), полный int — `cd apps/api && npx jest
  --config jest-int.config.js --runInBand` (testcontainers, НУЖЕН Docker; `pnpm ... test:int --
  --testPathPattern` глючит с `--`-сепаратором), `pnpm --filter @altegio/tma test` (vitest,
  контейнерные тесты через `// @vitest-environment jsdom`).
- Новые миграционные int-спеки: откаты писать через `undoMigrationsThrough(ds, 'Имя...')` из
  `apps/api/test/helpers/undo-migrations.ts`, НЕ фиксированным числом `undoLastMigration()`
  (сломалось на v2c при добавлении миграции 17).
- Секреты: локальный `.env` = боевые токены; серверный `/opt/altegio-ai/.env` дополнительно
  `TMA_URL`, `BOT_ENABLED=true`, Postgres-креды. Не коммитить.
- MALLI-демо (магазин одежды, МойСклад-мок) — отдельная история, файлы в .gitignore.

## Специфика процесса (выученное)

- Субагентам: явно запрещать `git add -A`, запрещать self-review/правку ledger, требовать
  честный DONE_WITH_CONCERNS если Docker недоступен.
- Ревью всегда независимое, финальное — opus по всей ветке.
- Полный int-сьют локально перед мёржем — обязанность контроллера (см. шапку).
- План живёт на main до среза ветки — ledger и брифы в git-игнорируемом `.superpowers/sdd/`.
