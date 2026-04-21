# Phase 1.2 — Telegram Bot Commands & Multi-Chat Subscriptions

**Date:** 2026-04-21
**Status:** Design approved, ready for plan
**Previous:** Phase 1.1 (dual-message report) shipped as `v0.2.0-phase1-1`

## Goal

Дать владельцу салона инициировать анализ самостоятельно через команды бота и подключать дополнительные чаты (бухгалтер, сеть-менеджер) без CLI.

## Non-goals

- Free-form chat с Claude (Phase 4).
- Losses report / wow-письмо (Phase 2).
- TMA-дашборд (Phase 3).
- Self-service регистрация новых тенантов (остаётся CLI `add-salon`).

## Architecture

Новый Nest-модуль `apps/api/src/modules/telegram-bot/` (inbound, long polling) отдельно от существующего `telegram/` (outbound `sendMessage`).

### Lifecycle

- `TelegramBotService.onModuleInit`:
  - если `BOT_ENABLED !== 'true'` → warn-лог «bot disabled», skip;
  - иначе пытается взять postgres advisory lock по ключу `hashtext('telegram_bot_polling')`;
  - если lock получен → `bot.launch({ dropPendingUpdates: false })`;
  - если lock занят (вторая реплика) → warn, skip, периодический retry каждые 30с.
- `onModuleDestroy` → `bot.stop('SIGTERM')`, release advisory lock.

### Файловая структура

```
apps/api/src/modules/telegram-bot/
  telegram-bot.module.ts
  telegram-bot.service.ts           // lifecycle
  invite-code.service.ts            // generate/consume
  middleware/
    resolve-chat.middleware.ts      // prefetch tenant_chats for ctx
    require-linked.middleware.ts
    require-owner.middleware.ts
    rate-limit.middleware.ts        // consults telegram_bot_logs
  commands/
    start.handler.ts
    help.handler.ts
    link.handler.ts
    report.handler.ts
    status.handler.ts
    subscribe.handler.ts
    unsubscribe.handler.ts
    invite.handler.ts
    sync.handler.ts
  utils/
    tenant-picker.ts                // inline keyboard when chat has multiple tenants
```

### Конфиг

- `BOT_ENABLED` — default `false` в dev, `true` в prod.
- `BOT_TOKEN` — существующий.
- `BOT_USERNAME` — для deeplink `/start` (опционально).

## Database

### Миграция 1: `create_tenant_chats`

```sql
CREATE TYPE tenant_chat_role AS ENUM ('owner', 'member');

CREATE TABLE tenant_chats (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  chat_id bigint NOT NULL,
  role tenant_chat_role NOT NULL,
  subscribed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, chat_id)
);

CREATE INDEX idx_tenant_chats_chat_id ON tenant_chats (chat_id);

-- Backfill из tenants.telegram_chat_id (owner для каждого существующего тенанта)
INSERT INTO tenant_chats (tenant_id, chat_id, role, subscribed)
SELECT id, telegram_chat_id, 'owner', true
FROM tenants
WHERE telegram_chat_id IS NOT NULL
ON CONFLICT DO NOTHING;
```

**Multi-tenant per chat:** один `chat_id` МОЖЕТ быть привязан к нескольким тенантам (сеть-менеджер). Поэтому нет UNIQUE по `chat_id`.

**Down:** `DROP TABLE tenant_chats; DROP TYPE tenant_chat_role;` — backfill обратно в `tenants.telegram_chat_id` не нужен, он сохранён.

### Миграция 2: `create_telegram_invite_codes`

```sql
CREATE TABLE telegram_invite_codes (
  code varchar(6) PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by_chat_id bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_by_chat_id bigint NULL,
  used_at timestamptz NULL
);

CREATE INDEX idx_telegram_invite_codes_tenant_expires
  ON telegram_invite_codes (tenant_id, expires_at);
```

### Миграция 3: `create_telegram_bot_logs`

```sql
CREATE TABLE telegram_bot_logs (
  id bigserial PRIMARY KEY,
  chat_id bigint NOT NULL,
  tenant_id uuid NULL REFERENCES tenants(id) ON DELETE SET NULL,
  command varchar(32) NOT NULL,
  args jsonb NOT NULL DEFAULT '{}'::jsonb,
  responded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_telegram_bot_logs_chat_command_time
  ON telegram_bot_logs (chat_id, command, responded_at DESC);
```

### Миграция 4: `extend_report_deliveries_pk`

Текущее состояние (после Phase 1.1): PK = `(tenant_id, date, message_kind)`, колонки `message_id`, `sent_at`, `status`, `error`. `chat_id` колонки НЕТ.

```sql
-- up
ALTER TABLE report_deliveries ADD COLUMN chat_id bigint NULL;
-- backfill из tenants.telegram_chat_id
UPDATE report_deliveries rd
SET chat_id = t.telegram_chat_id
FROM tenants t
WHERE rd.tenant_id = t.id;
-- для тенантов без owner-чата — удаляем осиротевшие строки (их быть не должно, defensive)
DELETE FROM report_deliveries WHERE chat_id IS NULL;
ALTER TABLE report_deliveries ALTER COLUMN chat_id SET NOT NULL;
ALTER TABLE report_deliveries DROP CONSTRAINT report_deliveries_pkey;
ALTER TABLE report_deliveries
  ADD CONSTRAINT report_deliveries_pkey
  PRIMARY KEY (tenant_id, date, message_kind, chat_id);

-- down: оставляем только owner-chat строки (по tenants.telegram_chat_id)
DELETE FROM report_deliveries rd
USING tenants t
WHERE rd.tenant_id = t.id AND rd.chat_id != t.telegram_chat_id;
ALTER TABLE report_deliveries DROP CONSTRAINT report_deliveries_pkey;
ALTER TABLE report_deliveries
  ADD CONSTRAINT report_deliveries_pkey
  PRIMARY KEY (tenant_id, date, message_kind);
ALTER TABLE report_deliveries DROP COLUMN chat_id;
```

### CLI совместимость

`apps/cli/src/commands/link-telegram.ts` теперь пишет В ОБЕ структуры: `UPDATE tenants SET telegram_chat_id = ?` + `INSERT INTO tenant_chats (tenant_id, chat_id, 'owner', true) ON CONFLICT DO NOTHING`.

## Commands

| Команда | Доступ | Rate-limit | Поведение |
|---|---|---|---|
| `/start` | public | — | Приветствие + подсказка `/link <code>` |
| `/help` | public | — | Список команд по роли (resolveChat подставляет контекст: если чат не линкован — показываем только public; если linked — + user-команды; если owner — + owner-команды) |
| `/link <code>` | public | 5/час per chat | Находит код, проверяет `expires_at > now()` и `used_by_chat_id IS NULL`. Транзакция: UPDATE кода + INSERT `tenant_chats(role='member', subscribed=true)`. Ответ: «Подключён к салону X» |
| `/report [YYYY-MM-DD]` | linked | 1/10 мин per (chat, tenant) | Multi-tenant → inline-кнопки выбора салона. Валидация даты в `[tenant.created_at::date, today]`, иначе «нет данных на эту дату». Fan-out НЕ делаем — шлём только инициатору. Yesterday+today пара. AI-инсайт через кеш `ai_insight_logs.prompt_hash` |
| `/status` | linked | 1/мин | Список привязанных салонов + роль, `subscribed`, next scheduled (из cron + tenant.timezone), last delivery (max `responded_at` из `report_deliveries` для этого chat) |
| `/subscribe` / `/unsubscribe` | linked | 1/мин | UPDATE `tenant_chats.subscribed`. Multi-tenant → inline-кнопки выбора |
| `/invite` | owner | 3/час per tenant | Генерирует 6-цифровой numeric код (crypto-random), retry на коллизию с активным кодом. TTL 24ч. Ответ: «Код: `384027`. Перешли второму чату: `/link 384027`. Истекает через 24 часа.» |
| `/sync` | owner | 1/5 мин per tenant | Async: ack «⏳ Синк запущен» → enqueue → follow-up «✅ Готово, +N записей» или «❌ Ошибка: ...». Если уже идёт sync того же тенанта — «⏳ Уже синкается, подожди» |

**Неавторизованный chat** (нет строк в `tenant_chats`) на любой защищённой команде → «Чат не привязан. Попроси владельца салона команду `/invite` и пришли сюда `/link <код>`».

**Rate-limit implementation:** `rate-limit.middleware.ts` делает `SELECT max(responded_at) FROM telegram_bot_logs WHERE chat_id=? AND command=?` (опционально с AND tenant_id=? для per-tenant лимитов). Превышение → «Слишком часто. Подожди N секунд».

## Fan-out scheduled report

Изменения в `ReportsService.generateAndDeliver(tenantId, date)`:

1. Считает метрики **один раз** на тенант.
2. AI-инсайт **один раз**, кеш по `ai_insight_logs.prompt_hash`.
3. Рендерит сообщения yesterday + today **один раз**.
4. `SELECT chat_id FROM tenant_chats WHERE tenant_id=? AND subscribed=true`.
5. Для каждого `chat_id`:
   - `INSERT INTO report_deliveries(tenant_id, date, message_kind, chat_id, status='pending') ON CONFLICT DO NOTHING` — идемпотентность.
   - Если строка создана или текущий `status='failed'` → `TelegramService.sendMessage`, UPDATE `status='sent'`, `sent_at=now()`, `message_id`.
   - 403 Forbidden (bot blocked) или 400 chat not found → `status='failed'`, `error`, +auto-unsubscribe для **member** ролей: `UPDATE tenant_chats SET subscribed=false WHERE tenant_id=? AND chat_id=? AND role='member'`. Owner-чаты не отписываем.
   - Другие ошибки (network, 5xx) — `status='failed'`, `error`, scheduler retry на следующий прогон.

**Manual `/report`:** тот же pipeline, но fan-out только в один `chat_id` (инициатор). PK с `chat_id` обеспечивает идемпотентность даже при обходе rate-limit.

## Testing

### Unit (Jest)

- `InviteCodeService`: generate (формат 6 цифр, uniqueness retry при коллизии), consume (expired / used / valid), TTL проверка.
- Middleware: `resolveChat` (0/1/N tenants), `requireLinked`, `requireOwner`, rate-limit (в пределах / превышение).
- Command handlers: mock Telegraf context + services, проверка текста ответа и побочных эффектов (INSERT/UPDATE).
- `ReportsService` fan-out: 0 / 1 / N подписчиков, идемпотентность, blocked-chat → member auto-unsubscribed, owner не трогается.

### Integration (testcontainers postgres)

- `/link` happy path: `/invite` → `/link <code>` → строка в `tenant_chats`.
- `/report` идемпотентность через прямой вызов service (обход rate-limit).
- Миграция `extend_report_deliveries_pk` up+down на seeded данных.

## Edge cases

- Owner делает себе `/unsubscribe` — разрешаем, `/status` показывает warning «автоотчёты выключены для твоего чата».
- Последний owner-чат заблокировал бота — `tenants.telegram_chat_id` остаётся, членские инвайты запрещены (нужен owner для `/invite`). Escape hatch: CLI `link-telegram`.
- `/invite` при пустом `tenant_chats` (рассинхронизация) — фоллбек на `tenants.telegram_chat_id` для определения owner.
- Telegraf restart — `dropPendingUpdates: false`, накопленные апдейты обработаются, rate-limit и idempotency защищают от дублей.
- Rate-limit гонка (два одновременных сообщения): допустимо, в худшем случае оба ответят; следующий сработает корректно.

## Observability

- `telegram_bot_logs` — каждая обработанная команда (успех/отказ), включая неавторизованные попытки.
- Pino структурные логи: `chatId`, `tenantId`, `command`, `durationMs`, `outcome`.

## Rollout

1. Миграции применяются автоматически при старте API (существующий механизм).
2. `BOT_ENABLED=true` в `.env` на VPS.
3. Smoke: `/start` из owner-чата BrowUp → ответ. `/invite` → код. Из второго тестового чата `/link <code>` → «Подключено». `/report` из второго чата → получает оба сообщения.
4. Перезапуск compose, наблюдаем логи на предмет advisory lock.

## Acceptance

- Все 9 команд работают в owner-чате BrowUp.
- Второй чат подключается через `/invite` + `/link`, получает завтрашний scheduled report.
- `/unsubscribe` во втором чате — второй чат НЕ получает следующий scheduled report, owner-чат получает как обычно.
- Блокировка бота вторым чатом → auto-unsubscribe member, owner-чат продолжает получать.
- Rate-limits соблюдаются (проверка в `telegram_bot_logs`).
