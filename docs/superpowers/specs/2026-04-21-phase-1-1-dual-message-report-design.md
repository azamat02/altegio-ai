# Phase 1.1 — Dual-message morning report + capacity-aware fill rates

**Date:** 2026-04-21
**Status:** Design, awaiting owner approval
**Supersedes pieces of:** `2026-04-20-altegio-ai-phase-1-design.md` (report rendering + today's-slots section only)

---

## 1. Зачем

Phase 1 вывел отчёт в прод, но он врёт в двух местах:

- **«Загрузка 100%»** считается по расписанию мастеров. У BrowUp 2 мастера делят один кабинет; Altegio отдаёт им независимые слоты, мы множим их — получаем фантомную ёмкость.
- **«Пустые слоты: 19:00»** — строится по тем же фантомным слотам. Владелец не понимает, о чьих слотах речь.

Параллельно отсутствуют два сигнала, которые владелец уже просит:

- **Загрузка за вчера** — сейчас показываем % только «на сегодня по расписанию», без факта за вчера.
- **План месяца** — нет таргета и трекинга MTD.
- **«Какая категория простаивает»** — нет ни одной строки, по которой можно решить «куда пустить рекламу».

Цель Phase 1.1 — починить ёмкость (стала честной, по ресурсам/кабинетам), добавить три недостающих метрики, и разнести вчера/сегодня в два Telegram-сообщения.

## 2. Источники данных

| Данные | Откуда |
| --- | --- |
| records (визиты, выручка, длительность, resource_instance_ids) | Altegio `/records/{id}`, хранится в `records` |
| services + категории | Altegio `/services/{id}` → `records.service_id → services.category_id` |
| staff | Altegio `/book_staff/{id}` → `records.staff_id` |
| resources (кабинеты, места) | Altegio `/resources/{id}` — **новое**, сейчас не пулим |
| working hours ресурса | Altegio `/timetable/resources/{id}/{date}` — **новое** |
| 3-месячная история для плана и affinity | те же `records`, но sync-окно расширяется до 120 дней при первом онбординге |

**Новые таблицы / колонки:**

- `resources(tenant_id, altegio_id, title)` — справочник кабинетов
- `records.resource_instance_id int[]` — массив (одна запись может занимать несколько ресурсов)
- `resource_category_affinity(tenant_id, resource_id, category_id, share numeric(5,4), computed_at)` — ночная агрегация, кто на каком ресурсе что делает
- `resource_schedule(tenant_id, resource_id, date, working_minutes int)` — расписание ресурса в минутах на день

Причина: без `resource_id` на записи мы не можем честно разложить booked-минуты по кабинетам, а без `resource_schedule` не знаем capacity.

## 3. Структура отчёта

Один cron-тик в 09:00 TZ салона отправляет **два сообщения** с задержкой 1 с.

### Message 1 — Вчера

```
☀ Доброе утро! Салон №1, Алматы
📊 Вчера · Вс, 19 апр

• Выручка:      2 899 953 ₸ (+7% к 7d avg)
• Визитов:      93
• Отменили:     4 (4%)             ← строка только если cancelled > 0
• Средний чек:  31 182 ₸
• Загрузка:     64%
• План месяца:  71% (19.5М из 27.5М)  ← строка только если goal доступен

🏆 Топ-3 мастера
1. Оксана Гарифзянова — 450 000 ₸ (2 визита)
2. Гульнара — 293 880 ₸ (11 визитов)
3. Насиба — 226 799 ₸ (5 визитов)

💡 Главный инсайт
Выручка вчера на 7% выше обычного при средней загрузке 64% — растёт
средний чек, видимо на дорогих окрашиваниях (у Оксаны 2 визита на 450К).
```

### Message 2 — Сегодня

```
📅 Сегодня · Пн, 20 апр

• Записей:  59
• Загрузка: 82%

📊 Заполненность по категориям
• Маникюр:      68% (12 зап.)
• Аппараты:     45% (8 зап.)
• Макияж:       30% (4 зап.)
• Депиляция:    20% (3 зап.)
• Окрашивание:  15% (2 зап.)
```

Категории — топ-5 по capacity на сегодня. Категория с capacity < 30 мин/день не печатается (шум).

## 4. Формулы (что и из чего считается)

Примеры — реальные BrowUp-цифры за 19/20 апреля 2026.

### 4.1 Выручка за вчера
```
revenue(D-1) = Σ record.cost  где records(tenant, date=D-1, attendance=1)
```
`attendance`: `1` = пришёл, `0` = ещё впереди (для сегодня), `-1` = отменил. Источник: `records.attendance` (int, из Altegio). Выручка — только пришедшие. Пример: `2 899 953 ₸`.

### 4.2 Δ к среднему за 7 дней
```
avg7 = Σ revenue(D-8..D-2) / 7
delta = (revenue(D-1) - avg7) / avg7 × 100
```
Нужно ≥ 7 полных дней истории, иначе строка убирается. Пример: `avg7 = 2 710К ₸`, `delta = +7%`.

### 4.3 Визиты и отмены
```
came      = count(records, attendance=1)
cancelled = count(records, attendance=-1)
cancel_rate = cancelled / (came + cancelled) × 100
```
Строка `• Отменили: N (X%)` печатается **только если `cancelled > 0`**. Пример: `93 / 0` → строку скипаем, `93 / 4 (4%)` → печатаем.

### 4.4 Средний чек
```
avg_check = revenue(D-1) / came
```
Если `came = 0` — строку скипаем.

### 4.5 Загрузка вчера (capacity-aware)

Ключевое изменение по сравнению с Phase 1. Ёмкость считаем **по ресурсам**, не по мастерам.

```
booked_min(D-1) = Σ record.length_minutes
                  где records(tenant, D-1, attendance=1)
                  fallback: record.length пустой → service.seance_length

capacity_min(D-1) = Σ resource_schedule.working_minutes
                    где resource_schedule(tenant, D-1)

utilization(D-1) = booked_min / capacity_min × 100
```

`record.length` → фактическая длительность (мастер мог увеличить/сократить). `service.seance_length` → дефолт услуги. Берём первое если есть, иначе второе. Если нет ни того ни другого — запись пропускаем (данные кривые).

`resource_schedule.working_minutes` → часы работы каждого кабинета в D-1, пулим из `/timetable/resources`. Кабинет с отсутствующим расписанием в этот день (выходной, не внесён в Altegio) — не учитывается в capacity. Лучше занизить ёмкость, чем раздуть (раздутая → фейково низкая загрузка).

Пример: 4 кабинета, 3 из них работали 10 часов, 1 кабинет 6 часов → `capacity = 3 × 600 + 1 × 360 = 2160 мин`. `booked = 1382 мин` (93 записи средним по ~15 мин) → `utilization = 64%`. Совпадает с мок-примером в §3.

### 4.6 План месяца
```
для месяцев M-1, M-2, M-3 (предыдущие три полных):
  monthly_revenue(m) = Σ revenue(D) для всех D в m
goal = avg(monthly_revenue(M-1..M-3)) × 1.1

mtd(now) = Σ revenue(D) для D в [первое число текущего месяца .. D-1]
progress = mtd / goal × 100
```

Если у tenant-а < 60 дней истории — строку скипаем вообще (не хватает для стабильной средней). `× 1.1` — «плановый рост 10%», мягкая планка. Позже можно перекрыть ручным `monthly_revenue_goal_override`, но Phase 1.1 этого не делает — auto only.

Пример: прошлые 3 месяца `25М, 23М, 27М → avg = 25М, × 1.1 = 27.5М`. MTD на 19 апреля = `19.5М → 71%`. Выводим `План месяца: 71% (19.5М из 27.5М)`.

### 4.7 Топ-3 мастера
```
для каждого staff_id в records(D-1, attendance=1):
  staff_revenue = Σ record.cost
  staff_visits  = count
сортируем по staff_revenue ↓, берём 3
```
Пример: Оксана 450К (2), Гульнара 294К (11), Насиба 227К (5).

### 4.8 Количество записей на сегодня
```
scheduled(D) = count(records, date=D, attendance IN (0, 1))
```
Отменённые не считаем. Пример: 59.

### 4.9 Загрузка сегодня (прогноз)

Та же формула, что 4.5, но `booked_min` включает не только пришедших:
```
booked_min(D)   = Σ record.length_minutes для records(D, attendance IN (0,1))
capacity_min(D) = Σ resource_schedule.working_minutes для D
utilization(D)  = booked_min / capacity_min × 100
```
Это **прогноз на день при текущих записях**, не «уже отработано к 09:00».

### 4.10 Resource ↔ category affinity

Пересчёт раз в сутки (cron 02:00 TZ салона):
```
для каждого resource r:
  total_r = count(records за 90 дней где r ∈ record.resource_instance_ids)
  для каждой category c среди тех records:
    n = count(records c этим r и service.category = c)
    affinity(r, c) = n / total_r
    (только если n >= 3 — отсекаем случайные бронирования)
```

Смысл: «кабинет Маникюр №1 — 95% маникюр, 5% педикюр». Для multi-category кабинета ёмкость делится пропорционально доле.

**Fallback:**
- Если у tenant-а < 30 дней истории: `affinity(r, самая_частая_категория) = 1.0` (моноресурс).
- Если у записи пустой `resource_instance_ids`: не участвует ни в numerator, ни в denominator affinity. В `booked(c)` попадает по staff-based сопоставлению (fallback, см. ниже).

**Записи без resource_id** — расширение. Пулим расписание staff вместо resource:
```
если record.resource_instance_ids = []:
  staff-based affinity: какая категория доминирует у этого мастера
  записи падают в эту категорию целиком
```
Это fallback для салонов без cabinet-level bookings в Altegio.

### 4.11 Заполненность категории (сегодня)
```
capacity(c, D) = Σ resource_schedule.working_minutes(r, D) × affinity(r, c)
booked(c, D)   = Σ record.length_minutes для records(D, attendance IN (0,1))
                 где service.category = c
visits(c, D)   = count тех records
fill_rate(c, D) = booked(c, D) / capacity(c, D) × 100
```

Сортируем по `capacity(c, D)` ↓, берём top-5. Категории с `capacity(c, D) < 30` скипаем.

Пример:
| Категория | booked | capacity | fill | visits |
|---|---|---|---|---|
| Маникюр | 420 | 620 | 68% | 12 |
| Аппараты | 180 | 400 | 45% | 8 |
| Макияж | 90 | 300 | 30% | 4 |
| Депиляция | 45 | 225 | 20% | 3 |
| Окрашивание | 60 | 400 | 15% | 2 |

## 5. AI-инсайт

Остаётся в Message 1 (вчера), после топ-3. В `DailyReportData`, который отдаётся Claude, расширяется новыми полями: `utilization(D-1)`, `goal_progress`, `top_categories_today`.

Prompt (уже есть в Phase 1, расширяем):

> Ты анализируешь вчерашние цифры салона. Напиши 1-2 предложения: что самое важное. Только интерпретация цифр, никаких советов на будущее, никаких прогнозов. Опирайся только на переданные числа, ничего не выдумывай.

Ожидаемый стиль: `Выручка вчера на 7% выше обычного при загрузке 64% — растёт средний чек, видимо на дорогих окрашиваниях (у Оксаны 2 визита на 450К).`

## 6. Архитектура

**Новые/изменённые модули:**

1. `modules/altegio/endpoints/resources.ts` — новый, пулим `/resources/{id}`.
2. `modules/altegio/endpoints/timetable.ts` — новый, пулим `/timetable/resources/{id}/{date}`.
3. `modules/altegio/dto/record.dto.ts` — добавляем `resource_instance_ids?: number[]`.
4. `modules/sync/parsers/records.parser.ts` — маппинг `seance_length` → берём `record.length ?? service.seance_length`; пробрасываем `resource_instance_ids`.
5. `modules/sync/aggregator.service.ts` — ночной джоб, пересчитывает `resource_category_affinity`.
6. `modules/sync/sync.service.ts` — новые шаги: pull resources + timetable; extend backfill до 120 дней при onboarding.
7. `modules/metrics/metrics.service.ts` — новые методы `yesterdayUtilization`, `monthlyGoal`, `todayCategoryFillRates`.
8. `modules/reports/template.renderer.ts` — расщепляем `renderYesterday()` и `renderToday()`; убираем `пустые слоты`, добавляем секции из §3.
9. `modules/reports/reports.service.ts` — `generateAndDeliver` посылает две подряд `sendMessage` с задержкой ≈ 1 с.
10. `modules/reports/ai-insight.service.ts` — расширяем промпт и shape данных.

**Миграции (добавляются к имеющимся 6):**

- `1700000006000-CreateResources.ts` — таблицы `resources`, `resource_schedule`, `resource_category_affinity`.
- `1700000007000-AddRecordResourceIds.ts` — `records.resource_instance_ids int[]`.

**DailyReportData (`packages/shared`):**
```ts
type DailyReportData = {
  salonName: string;
  yesterday: {
    date: string;
    revenue: number;
    avg7: number | null;
    deltaPct: number | null;
    came: number;
    cancelled: number;
    avgCheck: number | null;
    utilizationPct: number | null;      // NEW
    monthlyGoalPct: number | null;      // NEW
    monthlyGoalTarget: number | null;   // NEW for render
    monthlyGoalMtd: number | null;      // NEW for render
    topStaff: Array<{ name: string; revenue: number; visits: number }>;
    aiInsight: string | null;
  };
  today: {
    date: string;
    scheduled: number;
    utilizationPct: number | null;
    categories: Array<{ name: string; fillPct: number; visits: number }>; // NEW
  };
};
```

## 7. Edge cases и что как валим

- `capacity = 0` на день (все кабинеты без расписания, выходной) → `utilization = null`, строка скипается. Message 2 становится короче, но отправляется.
- `came = 0` → `avg_check` строку скипаем; в топ-3 мастерах 0 строк → «Вчера никто не пришёл» вместо списка (edge), показываем только выручку (0 ₸) и отмены если были.
- `resources = []` у tenant-а → affinity не считается, fill-rate секция в Message 2 не печатается (показываем только «Записей + загрузка»). Сообщение деградирует gracefully.
- Altegio вернул `resource_instance_ids: []` у всех записей → срабатывает staff-based fallback (§4.10).
- < 60 дней истории → нет плана месяца, строка скипается.
- < 30 дней истории → affinity моно-категорийная (fallback), fill-rate всё равно считается.

## 8. Sync window

При онбординге нового tenant-а — backfill 120 дней (чтобы было 3 полных месяца для плана + 90 для affinity). Дельта-sync остаётся как сейчас (3 дня окна каждые 6 часов). Для существующего BrowUp — разовый `trigger-sync --days 120`.

## 9. Что вне Phase 1.1

- Ручной override monthly goal (колонка есть в схеме, CLI-команда — Phase 1.2 если попросят).
- Дашборд (Phase 3).
- Losses-отчёт (Phase 2).
- Per-tenant выбор top-N категорий (жёстко 5).
- Кастомизация времени отправки (остаётся 09:00 TZ).

## 10. Критерии приёмки

1. `trigger-report --dry-run` рендерит две секции (Message 1 + Message 2) под разделителем `---8<---`.
2. Live send отправляет два Telegram-сообщения подряд; второе приходит в пределах 3 с после первого.
3. `utilization(D-1)` на BrowUp-данных попадает в диапазон 40-80% (sanity check — не 100% как сейчас, не 0).
4. Топ-5 категорий на сегодня отсортированы по ёмкости, суммы `fill(c)` не равны 100% (раздельные знаменатели).
5. `report_deliveries` хранит две записи per-день (по одной на сообщение) с общим `run_id`, для идемпотентности — уникальный ключ `(tenant_id, date, message_kind)` где `message_kind ∈ ('yesterday','today')`.
6. Старые тесты `template.renderer.spec` проходят после переписывания; добавляются snapshot-тесты для обоих сообщений.
7. Backward compat: `--dry-run` со старым флагом `--format=legacy` — не нужно. Старая Phase 1 форма уходит насовсем.
