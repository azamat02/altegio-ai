# Handoff — 2026-04-21

## Состояние

**Phase 1 и Phase 1.1 отгружены в прод на `altegio.tolemflow.kz`.**

- Phase 1 (`v0.1.0-phase1`): один утренний Telegram-отчёт в 09:00 Asia/Almaty → owner-chat. Acceptance: [docs/superpowers/plans/2026-04-20-altegio-ai-phase-1-acceptance.md](docs/superpowers/plans/2026-04-20-altegio-ai-phase-1-acceptance.md) (блок «Phase 1»).
- Phase 1.1 (`v0.2.0-phase1-1`, коммит `0ec74fd`): два сообщения (yesterday + today), capacity-aware загрузка через `/company/{id}/staff/schedule`, per-category fill rates с настоящими именами категорий из `/service_categories`, план месяца (avg(3m)×1.1), TZ-aware запросы, retry-safe failed deliveries. Acceptance: тот же файл, второй блок. Первая живая пара сообщений доставлена пользователю 2026-04-21 17:12 UTC.
- BrowUp tenant `fe952c56-af0a-4f33-aa00-27b8dd293a8a` на VPS, 11 546 записей, 10 миграций применены, скедулер армирован на 09:00 Almaty.

## Что строим дальше — Phase 1.2: команды бота + мульти-чат подписки

**Цель:** дать владельцу инициировать анализ самому и подключать вторых пользователей (бухгалтер, сеть-менеджер) без CLI.

### Уже согласовано в брейнсторме (эта сессия)

**Схема:**
- `tenant_chats(tenant_id, chat_id, role enum('owner','member'), subscribed bool, created_at)` — N:M, заменяет логику «один chat на tenant».
- `telegram_invite_codes(code, tenant_id, created_by_chat_id, expires_at, used_by_chat_id, used_at)` — 6-значные одноразовые коды, 24ч TTL.
- `telegram_bot_logs(chat_id, command, args, responded_at)` — аудит + основа rate-limit.
- `tenants.telegram_chat_id` НЕ удаляем, сохраняем как owner-chat для обратной совместимости; при `add-salon + link-telegram` CLI одновременно сидим строку в `tenant_chats`.
- `report_deliveries` PK расширяется до `(tenant_id, date, message_kind, chat_id)` — чтобы fan-out по подписчикам имел per-chat идемпотентность.

**Команды:**
- `/start`, `/help` — публичные.
- `/link <code>` — публичный; добавляет этот чат как `member`.
- `/report [YYYY-MM-DD]` — для linked chats. Шлёт yesterday+today пару. Rate-limit 1/10 мин per chat. AI-инсайт кешируем по `ai_insight_logs.prompt_hash` — повторный `/report` той же даты не жжёт Claude.
- `/status` — салон, роль, подписка, next scheduled time, last delivery.
- `/subscribe` / `/unsubscribe` — тогглит автоотчёт для этого чата.
- `/invite` — owner only; возвращает одноразовый код.
- `/sync` — owner only; энкьюивает sync, rate-limit 1/5 мин per tenant. По завершению бот отвечает «готово, N новых записей».
- Неавторизованный chat → подсказка пройти /link.

**Архитектура:**
- Новый модуль `apps/api/src/modules/telegram-bot/` отдельно от outbound `telegram/`. Инбаунд поднимается через Telegraf `bot.launch()` в `onModuleInit`, когда `BOT_ENABLED=true`.
- Файлы: `telegram-bot.service.ts` (lifecycle), `commands/*.handler.ts` (по файлу на команду), `middleware/resolve-chat.middleware.ts` и `middleware/require-linked.middleware.ts` / `require-owner.middleware.ts`, `invite-code.service.ts`.
- `ReportsService.generateAndDeliver` делает fan-out по `tenant_chats WHERE subscribed = true`, пишет `report_deliveries` с `chat_id` в PK.
- Один API-процесс владеет polling-ом; защита от двойного старта — postgres advisory lock на ключе `telegram_bot_polling` (пока 1 реплика — не критично, но заложить).

### Открытые вопросы для новой сессии

1. **`/sync` UX:** отвечать сразу («enqueued, ждите») и потом вторым сообщением при завершении, или ждать до завершения (blocking, может зависнуть на 30-60 сек)? Сейчас склоняюсь к async + follow-up, но решим в новой сессии.
2. **PK `report_deliveries` во второй раз за неделю** — на Phase 1.1 уже расширяли до `(tenant_id, date, message_kind)`. Новая миграция добавит `chat_id`. Нормально. Down-миграция должна удалять повторные chat-строки. Надо прописать в спеке.
3. **Формат invite-кода** — 6-цифровой числовой («384027») или буквенно-числовой («7F3KQ2»)? Числовой легче ввести на мобилке, буквенно-цифровой короче при одинаковой энтропии. Думаю ЦИФРЫ, но подтверди.
4. **`/report` за будущие даты** — должно валидироваться? `--date 2027-01-01 --dry-run` в текущем CLI не падает (просто покажет нули). В боте, наверное, отвергать: «нет данных на эту дату».

### Что НЕ в Phase 1.2 (явно отрезано)

- Chat с Claude (Phase 4 из ROADMAP) — свободные вопросы бизнесу. Отдельный спринт.
- Losses report / wow-письмо (Phase 2) — отдельный трек.
- TMA-дашборд (Phase 3).

## Как начать новую сессию

1. `/clear` → старт новой сессии
2. Первое сообщение: «читай `HANDOFF.md` и `ROADMAP.md`, продолжаем брейнсторм Phase 1.2 — мы остановились на архитектуре, остались 4 вопроса в «Открытые вопросы»». 
3. После ответа на вопросы — Claude добивает spec, коммитит в `docs/superpowers/specs/2026-04-??-phase-1-2-bot-commands-design.md`, затем `writing-plans` → `subagent-driven-development` → VPS rollout тем же паттерном что Phase 1.1.

## Ключевые файлы

**Контекст проекта:**
- `ROADMAP.md` — общий продуктовый roadmap Phase 1-5.
- `HANDOFF.md` — этот файл.
- `SESSION_CONTEXT.md` — сводка по Altegio API (какие endpoints тестированы, что работает).
- `DATA_MAP_AND_MVP.md` — оригинальная карта данных и 5 вариантов MVP A-E.

**Phase 1.1 (недавно):**
- `docs/superpowers/specs/2026-04-21-phase-1-1-dual-message-report-design.md` — спек.
- `docs/superpowers/plans/2026-04-21-altegio-ai-phase-1-1.md` — 25-таск план.
- `docs/superpowers/plans/2026-04-20-altegio-ai-phase-1-acceptance.md` — acceptance log обоих фаз.

**Где бот сейчас живёт:**
- `apps/api/src/modules/telegram/telegram.service.ts` — outbound (Telegraf.sendMessage).
- `apps/api/src/modules/telegram/telegram.module.ts` — минимальный Nest-модуль.
- Тенант-чат линк: `apps/api/src/modules/tenants/tenant.entity.ts` → `telegram_chat_id` bigint nullable.
- CLI линковки: `apps/cli/src/commands/link-telegram.ts`.

## Деплой-инфа (не менялась)

- VPS: `root@178.128.202.65`, домен `altegio.tolemflow.kz`.
- Образ: `ghcr.io/azamat02/altegio-ai-api:latest` (public).
- Деплой: `cd /opt/altegio-ai && ./deploy/deploy.sh` (pull + compose up).
- Бот токен, Claude key, BrowUp token — в `/opt/altegio-ai/.env` на VPS, НЕ закоммичены. Ротация секретов — в долгу с Phase 1 ещё.

## Приоритет по времени

Phase 1.2 — не блокер. Основной бутылочный горлышко — customer development (3-5 платящих клиентов, $15-25/мес). Продукт уже готов демонстрировать владельцу любого салона. Команды бота повышают удобство, но не необходимы для первой продажи.
