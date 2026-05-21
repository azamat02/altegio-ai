# Handoff — 2026-05-22

## Состояние

**Phase 1, 1.1, 1.2 отгружены в прод. Phase 1.3 (metrics expansion) реализована локально, готова к деплою на `altegio.tolemflow.kz`.**

### Phase 1.3 — Metrics expansion (локально, не задеплоено)

Цель — закрыть чек-лист «9 метрик» (по референсу Rendite) в утреннем Telegram-отчёте и расширить бот командой `/staff`.

**Коммиты (свежие → старые), все на `main`:**
- `317d219` feat(telegram-bot): `/staff [YYYY-MM-DD]` — per-master breakdown
- `e4e76d9` feat(reports): рендер блока «📡 Откуда записи»
- `c1c2d01` feat(metrics): `sourceBreakdown` — visits/revenue/share by `record_from`
- `008a4d0` feat(sync): tracking `record_from` → `records.record_source`
- `591ad69` feat(reports): рендер блоков «Не пришли», «Клиенты», «📈 Динамика выручки»
- `ce28a09` feat(metrics): `noShowForDate`, `staffDailyBreakdown`, `retentionForDate`, `revenueDynamics`

**1 новая миграция** (`1700000016000-AddRecordSource`): `ALTER TABLE records ADD COLUMN record_source text` + бэкфилл из `altegio_raw_records.payload->>'record_from'` + partial index `(tenant_id, record_source, datetime) WHERE NOT NULL`. На VPS бэкфилл прогонится по 11K+ существующих записей.

**Новые методы в `MetricsService`:**
- `noShowForDate` — count + lostRevenue (`attendance=2`).
- `staffDailyBreakdown` — per-staff revenue/visits/avgCheck/bookedMinutes.
- `retentionForDate` — новые vs постоянные (новый = first attended visit = дата среза).
- `revenueDynamics` — day/week/month vs comparable prev period.
- `sourceBreakdown` — visits/revenue/share по `record_from`, NULL → «Прямая запись».

**Расширение `YesterdayBlock`** (в `@altegio/shared`): добавлены `noShow`, `retention`, `dynamics`, `sources`. Старые поля без изменений.

**Утренний отчёт теперь включает (все блоки conditional):**
- `• Не пришли:` (когда `attendance=2 > 0`)
- `• Клиенты: X новых · Y постоянных`
- `📈 Динамика выручки` (Неделя / Месяц vs prev, строки скрываются если prev=0)
- `📡 Откуда записи` (top-4 каналы)

**Новая команда бота** `/staff [YYYY-MM-DD]` — для linked-чатов, по умолчанию вчера в TZ салона. Помечена в `/help`.

**Тесты:** 92/92 unit, 44/44 int (включая регрессионные правки migration-rollback тестов и новый `metrics-v2.int.spec.ts` на 10 кейсов). `pnpm build` clean.

### Rollout Phase 1.3 на VPS

1. `cd /opt/altegio-ai && git pull origin main`
2. `./deploy/deploy.sh` — миграция №16 применится автоматически и сделает бэкфилл `record_source` из raw payload.
3. Проверить логи: «Migration AddRecordSource1700000016000 has been executed successfully».
4. Smoke в owner-чате BrowUp:
   - `/report` → должны появиться 3 новых блока (Динамика + Откуда записи + строка «Клиенты»).
   - `/staff` → нумерованный список мастеров за вчера.
   - `/help` → должна быть строка `/staff [YYYY-MM-DD]`.
5. Завтра 09:00 Almaty — scheduled report должен прийти в обновлённом формате.

### Покрытие чек-листа «9 метрик» после Phase 1.3

- ✅ #01 Ежедневная выручка + динамика (день/неделя/месяц)
- ⚠️ #02 Заполняемость мастеров — booked min per-master в `/staff`, но % требует staff capacity (отложено до пэйного запроса)
- ✅ #03 Заполняемость услуг
- ✅ #04 Средний чек per-master
- ✅ #05 Возвращаемость
- ✅ #06 Источники записей
- ✅ #07 No-show (отмены `attendance=-1` Altegio не отдаёт, отложено)
- ✅ #08 Динамика выручки WoW/MoM
- ✅ #09 AI-инсайты

---

## Ранее отгруженные фазы

**Phase 1, 1.1, 1.2 на `altegio.tolemflow.kz`.**

- Phase 1 (`v0.1.0-phase1`): один утренний Telegram-отчёт в 09:00 Asia/Almaty → owner-chat. Acceptance: [docs/superpowers/plans/2026-04-20-altegio-ai-phase-1-acceptance.md](docs/superpowers/plans/2026-04-20-altegio-ai-phase-1-acceptance.md) (блок «Phase 1»).
- Phase 1.1 (`v0.2.0-phase1-1`, коммит `0ec74fd`): два сообщения (yesterday + today), capacity-aware загрузка через `/company/{id}/staff/schedule`, per-category fill rates с настоящими именами категорий из `/service_categories`, план месяца (avg(3m)×1.1), TZ-aware запросы, retry-safe failed deliveries.
- Phase 1.2 (после коммита `728ce94`): N:M `tenant_chats`, inbound Telegraf-бот, команды `/start`, `/help`, `/link`, `/report`, `/status`, `/subscribe`, `/unsubscribe`, `/invite`, `/sync`. Bot polling под Postgres advisory lock `8823911`. `BOT_ENABLED` env-флаг.
- Pace-based monthly goal (`c719a43`, `ef13a62`): manual goal override + verbose месячный блок (target / daily norm / elapsed / expected / actual / pace / yesterday-vs-norm). Уже задеплоено вместе с 1.2? Проверь `git log` на VPS — если `ef13a62` не там, едут вместе с Phase 1.3.

## Открытые техдолги

1. **`tenants.altegio_token_encrypted` хранит partner-токен**, должен — per-tenant user-токен. Ломается при онбординге второго салона. Refactor ~1-2ч.
2. **Per-staff capacity** — `/staff/{id}/schedule` нужен отдельный синк для метрики «загрузка мастера в %». Текущий `resource_schedule` — по resource_altegio_id, не по staff.
3. **Реальные отмены** — Altegio `/records` не возвращает `attendance=-1`. Нужен прототип `/records/search` или `/book_dates` для получения истории изменений.

## Приоритет по времени

После rollout Phase 1.3 — **customer development** (см. ROADMAP). Phase 2 (losses report) гейтится 3-5 платящими салонами на Phase 1. Технически Phase 1 покрывает «9 метрик» уровня Rendite — есть что показывать на pitch.

## Ключевые файлы

- `ROADMAP.md` — общий продуктовый roadmap Phase 1-5.
- `HANDOFF.md` — этот файл.
- `SESSION_CONTEXT.md` — сводка по Altegio API.
- `DATA_MAP_AND_MVP.md` — карта данных и варианты MVP A-E.
- `docs/superpowers/specs/2026-04-21-phase-1-2-bot-commands-design.md` — spec Phase 1.2.
- `docs/superpowers/plans/2026-04-21-altegio-ai-phase-1-2.md` — план Phase 1.2.
