# Handoff — 2026-07-03 (конец сессии)

> Новая сессия: прочитай этот файл + `.superpowers/sdd/progress.md` (ledger последнего цикла).
> Рабочий процесс в проекте: brainstorming → spec → writing-plans → subagent-driven-development
> (свежий субагент на задачу + независимое ревью + финальное opus-ревью ветки) → finishing-branch
> (merge в main + push → CI сам деплоит).

## Состояние: ВСЁ В ПРОДЕ И РАБОТАЕТ

**Прод:** `https://altegio.167.99.250.107.nip.io` (VPS DigitalOcean 167.99.250.107, nip.io-домен,
Let's Encrypt до 2026-09-30, автопродление). Один nginx: `/` — TMA SPA (статика, собирается на
сервере из `apps/tma/Dockerfile`), `/tma/*` и `/health` — прокси на NestJS API. Стек в
`/opt/altegio-ai`: nginx + api (образ из GHCR, public) + postgres + redis, миграции гоняет
entrypoint при старте.

**CI/CD:** push в `main` → `.github/workflows/ci.yml`: lint+unit+int (бэкенд) ∥ frontend
(tma test+build) → publish-image (GHCR) → deploy (SSH на VPS, `deploy/deploy.sh`: git pull,
compose pull, up -d, rebuild nginx/web, health-gate). Секреты/переменные настроены
(`DEPLOY_ENABLED=true`, `VPS_*`). Каждый мёрдж в main авто-деплоится.

**Бот:** `@altegio_aibot`, поллит на VPS (`BOT_ENABLED=true` в серверном `.env`). UX-оверхол
отгружен: меню команд, menu-button «Дашборд» (web_app), HTML-отчёты с blockquote, постоянная
клавиатура 2×2 (Отчёт/Мастера/Дашборд/Ещё), листание отчёта/мастеров по дням (editMessageText),
«⚙️ Ещё»-меню. НЕ запускать этого бота локально — 409-конфликт.

**TMA (4 таба, реальные данные):**
- Сводка: KPI, 30-дн график, чипы динамики (неделя/месяц), фуллскрин на ios/android
  (`--safe-top`), десктоп — обычный режим.
- Мастера: сравнение периодов (`compare=1`: бейджи ▲/▼/«новый» + итог салона), drill-down по
  мастеру (тренд, топ-услуг, новые/вернувшиеся, отмены/no-show, BackButton).
- Потери: hero «~X ₸/год» из 4 блоков (отмены/no-show/простой/отток×30%), дисклеймер.
- Клиенты: пороги 30/60/90, список спящих с `tel:`, LTV-топ — **СЕЙЧАС ПУСТОЙ, см. п.1 ниже**.

**Тенант:** BrowUp Almaty (location 198823) онбордан, 120-дн синк, owner-чат 637406749
(`TELEGRAM_OWNER_CHAT_ID`). Реальные цифры: ~2.4М ₸/день, 38 мастеров.

**Auth TMA:** initData HMAC (guard `tma-auth.guard.ts`) + фронтовый фоллбек из launch-hash
(`#tgWebAppData=`) — нативный macOS-клиент Telegram initData не передаёт (показываем
диагностический экран), iOS/Android ок.

## АДЖЕНДА СЛЕДУЮЩЕЙ СЕССИИ (решено с владельцем)

### 1. Фикс клиентского синка (вариант B — главное)
Прод-диагноз: в `clients` 200 строк (page 1), у ВСЕХ `visits_count = NULL`,
`last_visit_date = NULL` (spent есть у 83) — списочный `GET /clients/{location}` Altegio не
отдаёт эти поля. Экран «Клиенты» и блок «отток» из-за этого пустые/нулевые.
**Фикс:** перейти на клиентский search-эндпоинт Altegio (отдаёт visits/last_visit/spent;
см. SESSION_CONTEXT.md по API) + синкать ВСЕ страницы (генератор `ClientsEndpoint.fetchAll`
уже написан, не используется). Точка входа: `sync.service.ts` строка ~86
(«Clients delta (page 1 only for Phase 1)»). После фикса — resync BrowUp через CLI
`trigger-sync`.

### 2. Follow-up пакет (из финального ревью v2b, всё в один цикл с п.1)
- **Fetch-race guard** во всех 4 экранах TMA (Summary/Staff/Losses/Clients): stale-response
  guard/AbortController в useEffect-фетчах + по контейнерному тесту loading→error→data.
- Косметика: убрать «Task N (TMA vXx)»-комменты из metrics.service.ts; явный
  `Promise<TmaClients>` на clientsAnalytics; de-shadow `top` в тесте; design-note или динамика
  для лейбла «90+ дней»; визуальный прогон 0.7rem таб-лейблов на устройстве.

### 3. Калибровка «Простоя» (продуктовое решение владельца — спросить)
Сейчас простой = каждый свободный час × выручка/час → 728М/год из 730М общих потерь BrowUp
(загрузка ~50-65%). Опция: считать от целевой загрузки (напр. 80%) вместо 100%, возможно
настраиваемо. Владелец пока не решил.

### 4. Хвосты (не срочно)
- `ANTHROPIC_API_KEY` в проде пуст — AI-инсайт в утреннем отчёте выключен; владелец обещал ключ.
- `from/to` не валидируются на `/tma/staff|losses|detail` (пре-существующий паттерн).
- Зелёный `▲ +0%` в DeltaBadge — оставлен консистентным, можно сделать нейтральным.
- GROUP BY title в топ-услуг drill-down — осознанный UX (склейка одноимённых), оставлено.
- AI-консультант (Phase 4) — отдельный проект, ждёт Anthropic-ключ.
- v2b спящие ограничены полями clients-таблицы — после п.1 всё оживёт без правок экрана.

## Операционные факты

- Деплой руками (если надо): `ssh root@167.99.250.107`, `cd /opt/altegio-ai && ./deploy/deploy.sh`.
- Прод-БД: `docker compose --env-file .env -f docker/docker-compose.prod.yml exec -T postgres
  psql -U altegio -d altegio_ai` (читать осторожно, писать только с одобрения владельца).
- CLI-админка внутри api-контейнера: `docker exec docker-api-1 sh -c 'cd /app &&
  apps/cli/node_modules/.bin/ts-node -r tsconfig-paths/register --project apps/cli/tsconfig.json
  apps/cli/src/main.ts <add-salon|link-telegram|trigger-sync|trigger-report|set-monthly-goal>'`.
- Тесты: `pnpm --filter @altegio/api test` (юнит), `... test:int --testPathPattern <f>`
  (testcontainers, НУЖЕН Docker; в песочницах субагентов Docker бывает недоступен — контроллер
  перегоняет гейт сам), `pnpm --filter @altegio/tma test` (vitest).
- Секреты: локальный `.env` = боевые Altegio/Telegram-токены; серверный `/opt/altegio-ai/.env`
  дополнительно `TMA_URL`, `BOT_ENABLED=true`, Postgres-креды. Не коммитить.
- MALLI-демо (магазин одежды, МойСклад-мок): `demo-site/malli.html` + `/app` на
  `demo-site-kappa-mauve.vercel.app`, бот-демо `demo-bot/` (локальный, выключен) — отдельная
  ветка истории, к салонному продукту не относится, файлы в .gitignore.

## Специфика процесса (выученное)

- Субагентам: явно запрещать `git add -A` (был инцидент со сметённым мусором), запрещать
  self-review/правку ledger (двое пытались), требовать честный DONE_WITH_CONCERNS если Docker
  недоступен. Ревью всегда независимое, финальное — opus по всей ветке.
- План живёт на main до среза ветки — ledger и брифы в git-игнорируемом `.superpowers/sdd/`.
- CI-run искать по `headSha`, не «последний» (был промах).
