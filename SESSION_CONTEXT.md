# Altegio AI — Контекст для продолжения сессии

## Что это
Analytics SaaS поверх Altegio API для салонов красоты, клиник, барбершопов. Рынок: Казахстан, Украина, СНГ.

## Стек (планируемый)
- Backend: NestJS + TypeScript
- Database: PostgreSQL + TypeORM
- Cache: Redis
- Frontend: Next.js + Recharts/Tremor
- AI: Claude API
- Notifications: Telegram Bot (Telegraf)
- Infra: Docker, VPS

## Altegio API

### Авторизация
```
Base V1: https://api.alteg.io/api/v1
Base V2: https://api.alteg.io/api/v2
Header: Authorization: Bearer <partner_token>, User <user_token>
Accept: application/vnd.api.v2+json
```

### Тестовые credentials
```
Partner token: 3nhhg28zsrc6wx84e8xk
Login: dariuwa@gmail.com
Password: Aisha16112021
User token: 7f50f9f5cd6754e12fe9a3c62be30d48
User ID: 12732895
User name: Дария
```

### Рабочая локация: 198823 (BrowUp Almaty)
- Chain ID: 179269 (Сеть Browup almaty)
- Тариф: Unlimited, до 03.12.2027
- 134 мастера, 353 услуги, 27,406 клиентов
- 5 касс, 6 складов, 4 ресурса
- 8 loyalty программ, 23 типа абонементов, 25 типов сертификатов

### Что работает (V1, location 198823)
| Endpoint | Результат |
|----------|-----------|
| POST /auth | OK — user_token получен |
| GET /companies | OK — ~25 локаций |
| GET /company/{id} | OK — 83 поля |
| GET /staff/{id} | OK — 134 сотрудника |
| GET /services/{id} | OK — 353 услуги |
| GET /records/{id} | OK — 9,751 записей (3.5 мес) |
| GET /clients/{id} | OK — 27,406 клиентов |
| POST /company/{id}/clients/search | OK — поиск с полями |
| POST /company/{id}/clients/visits/search | OK — история визитов |
| GET /company/{id}/analytics/overall | OK — все метрики |
| GET /company/{id}/analytics/overall/charts/* | OK — income_daily, fullness_daily, records_daily, record_source, record_status |
| GET /accounts/{id} | OK — 5 касс |
| GET /transactions/{id} | OK — финансовые транзакции |
| GET /reports/z_report/{id} | OK — дневной Z-отчёт |
| GET /company/{id}/staff/schedule | OK — 69 расписаний |
| GET /timetable/dates/{id}/{date} | OK — 49 дат |
| GET /resources/{id} | OK — 4 ресурса |
| GET /storages/{id} | OK — 6 складов |
| GET /storages/transactions/{id} | OK — расходники |
| GET /goods/{id} | OK — товары |
| GET /license/{id} | OK �� тариф |
| GET /company/{id}/users | OK — 79 пользователей |
| GET /company/{id}/users/roles | OK — 8 ролей |
| GET /user/permissions/{id} | OK — 11 групп прав |
| GET /company/{id}/loyalty/programs/search | OK — 8 программ |
| GET /loyalty/card_types/salon/{id} | OK — 2 типа карт |
| GET /company/{id}/loyalty/abonement_types/search | OK — 23 типа |
| GET /company/{id}/loyalty/certificate_types/search | OK — 25 типов |
| GET /notification_settings/{id}/notification_types | OK — 11 типов |
| GET /company/{id}/settings/timetable | OK |
| GET /company/{id}/settings/timeslots | OK |
| GET /custom_fields/{category}/{id} | OK |
| GET /activity/{id}/search | OK (0 events) |
| GET /activity/{id}/filters | OK — 4 фильтра |
| GET /groups | OK — 1 сеть |
| GET /group/{chain_id}/clients | OK — клиент найден |
| GET /chain/{id}/loyalty/card_types | OK — 3 типа |
| GET /chain/{id}/loyalty/abonement_types | OK — 21 тип |
| GET /chain/{id}/loyalty/certificate_types | OK — 26 типов |
| GET /validation/validate_phone/{phone} | OK |

### Что НЕ работает
| Endpoint | Причина |
|----------|---------|
| Salary endpoints (все) | "An error has occurred" |
| GET /company/{id}/booking_forms | "Not enough rights" |
| GET /company/{id}/settings/online | "Not enough rights" |
| GET /tips/{id}/settings | "Access is not activated" |
| V2 API (все endpoints) | "An error has occurred" — partner token не подключен к V2 |

### Ключевые метрики BrowUp (реальные данные)
```
Выручка (1.5 мес): 108.9M ₸ (+9%), услуги 93.6M (86%), товары 11.4M (14%, -15%!)
Ср. чек: 33,755 ₸
Загрузка: 53.5%
Записи: 5,988 (пришли 75%, отменили 22%, ожидают 3%)
Клиенты: 27,406 total, 1,628 active (6%!), 299 new, 1,329 return, 554 lost
Источники: ресепшн 79%, онлайн 17%, app 2%
Пиковые часы: 10, 12, 16, 18
```

### Важные нюансы API
1. `location_id` = `company_id` — одно и то же
2. Даты: YYYY-MM-DD ��ля аналитики
3. `include_finance_transactions=1` — обязательно для /records чтобы получить суммы
4. `attendance`: -1=отменён, 0=ожидается, 1=подтверждён, 2=пришёл
5. Charts endpoints (income_daily, fullness_daily...) возвращают массив НАПРЯМУЮ, не {success, data}
6. `/staff/{id}` работает, `/company/{id}/staff` — "Not enough rights" (разные endpoints)
7. `meta` иногда list[], иногда dict{} — нужно проверять тип
8. Goods имеют ключ `good_id` вместо `id`
9. Rate limit: 200 req/min, 5 req/sec
10. V2 API не работает с текущим partner token

## Файлы проекта
```
/Users/saiduly/Developer/altegio-ai/
├── altegio-api-tester.html    — API тестер v6 (V1+V2, 100+ endpoints, body editor, localStorage)
├── DATA_MAP_AND_MVP.md        — Полная карта данных + варианты MVP
├── SESSION_CONTEXT.md         — ЭТОТ ФАЙЛ
│
/Users/saiduly/Downloads/
├── ALTEGIO_DEV_CONTEXT.md     — Исходный dev context (архитектура, endpoints, схема БД)
├── altegio-api-tester (5).html — Старый тестер v5
```

## Решения по MVP (обсуждение)
Рассмотрели 5 вариантов (A-E), рекомендация — комбо B+C+Telegram:
- **Telegram-бот** — утренний отчёт (daily hook)
- **Отчёт по мастерам** — таблица/рейтинг с ключевыми метриками
- **Потери выручки** — wow-отчёт "где теряете деньги" с суммами в тенге

Подробнее: см. DATA_MAP_AND_MVP.md

## Следующие шаги
1. Обсудить финальный выбор MVP
2. (Опционально) Сгенерировать пробный отчёт по BrowUp данным для показа владельцу
3. Customer development — поговорить с 5-10 владельцами
4. Начать реализацию MVP
