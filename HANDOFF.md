# Handoff — 2026-04-20

## Где мы

**Altegio AI Phase 1 полностью реализована локально** (41 коммит на main, ветка не запушена на GitHub). Инфра работает end-to-end:
- BrowUp (location 198823) подключён как tenant `c2547c02-4c57-4159-a995-9d034ddaa8a1`
- Sync пулит реальные данные из Altegio API
- Отчёт рендерится и реально доставляется в Telegram боту `@altegio_aibot`
- Первое живое сообщение отправлено в chat 637406749 (владельцу = Саидулы)

## Что дальше — Task 40: VPS deploy

**Ресурсы приготовлены пользователем:**
- VPS: `178.128.202.65` (Docker предустановлен, root access)
- Домен: `altegio.tolemflow.kz` → указывает на IP
- Telegram bot: `@altegio_aibot` (токен в `.env`)
- Anthropic API: ключ в `.env`
- Личный chat_id для тестов: `637406749`

**⚠ Важно: секреты засвечены в предыдущей сессии — после deploy рекомендовать ротацию:**
1. Bot token — `/revoke` в @BotFather + новый токен
2. Claude key — revoke на console.anthropic.com + новый
3. Пароль root на VPS

## Стратегия deploy

Обсуждали два варианта:
- (a) GitHub repo + CI/CD через ghcr.io — правильный long-term
- (b) Прямой build Docker на VPS из git — быстрее для первого раза

**Рекомендация:** пойти (a) — так код в публичном безопасном месте, CI упакован, стандартный путь.

## Что вне Phase 1 (намеренно отрезано)

- Phase 2: Losses report (wow "вы теряете 44M ₸")
- Phase 3: TMA dashboard
- Self-service signup
- Billing
- Рефакторинг user_token per-tenant (сейчас зашит в env, работает только для BrowUp — надо чинить для второго салона, час работы)

## Ключевые файлы для чтения в новой сессии

**Ориентация (читать первыми):**
1. `HANDOFF.md` — этот файл, состояние текущей сессии и следующие шаги
2. `ROADMAP.md` — Phase 1-5 развитие продукта, правила гейтинга, что может убить проект

**Контекст по Altegio:**
3. `SESSION_CONTEXT.md` — все протестированные endpoints V1 (~40), что работает/что нет, нюансы API, реальные цифры BrowUp
4. `DATA_MAP_AND_MVP.md` — полная карта данных + оригинальные 5 вариантов MVP (A-E) с анализом

**Phase 1 (реализованная):**
5. `docs/superpowers/specs/2026-04-20-altegio-ai-phase-1-design.md` — дизайн-спек
6. `docs/superpowers/plans/2026-04-20-altegio-ai-phase-1.md` — план на 40 задач (39 сделано)

**Визуальные:**
7. `mockups/` — 5 HTML-мокапов, по ним строили Phase 1 и концепции Phase 2-3
8. `demo-site/` — те же мокапы, деплойнуты на `altegio-ai-demo.vercel.app` (отдельный git repo)

**Операционные:**
9. `.env` — локальные креды (gitignored)
10. Git history: `git log --oneline` — история 41 коммита с внятными сообщениями

## Быстрая проверка что всё живо

```bash
cd /Users/saiduly/Developer/altegio-ai
docker compose -f docker/docker-compose.yml ps           # pg + redis должны быть healthy
pnpm -F @altegio/api test                                 # 44/44
pnpm cli trigger-report --tenant c2547c02-4c57-4159-a995-9d034ddaa8a1 --dry-run
```

## Стек (для быстрого ориентирования)

NestJS 10 + TypeScript + Postgres 16 + Redis 7 + BullMQ + Telegraf + @anthropic-ai/sdk + TypeORM.
Монорепо pnpm: `apps/api`, `apps/cli`, `packages/shared`.
Docker compose локально (pg:5434, redis:6382) и прод-compose в `docker/docker-compose.prod.yml`.

## Следующие шаги в новой сессии

1. `/clear` → старт новой сессии
2. Первое сообщение: "читай `HANDOFF.md` и поехали с Task 40 (VPS deploy)"
3. План на сессию:
   - Создать GitHub repo + `gh auth` + push
   - Дождаться CI (build + ghcr push, ~5-10 мин)
   - SSH на VPS, поднять compose.prod.yml с `SCHEDULER_ENABLED=true`
   - Certbot для `altegio.tolemflow.kz`
   - Смоук: `curl https://altegio.tolemflow.kz/health`
   - Завтра в 09:00 Almaty — проверка автономной отправки

## Продуктовый контекст

- Solo founder, Саидулы, рынок KZ/UA/CIS
- Следующий гейт — получить 3-5 платящих клиентов ($15-25/мес)
- Customer development — THE bottleneck, не техника
- Демо можно делать уже сейчас на живых данных BrowUp
