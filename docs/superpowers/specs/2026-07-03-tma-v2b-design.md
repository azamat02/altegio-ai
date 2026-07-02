# TMA v2b — «Потери» + клиентская аналитика — design spec

**Date:** 2026-07-03
**Status:** Approved (brainstorming)
**Scope note:** second half of the v2 split. v2a (fullscreen, period compare, master drill-down)
is shipped. This spec adds two new TMA tabs: «Потери» and «Клиенты».

## Goal

Give the owner the money story: a losses screen («Вы теряете ~X ₸/год» from cancellations,
no-shows, idle capacity, and sleeping-client churn) and a client-analytics screen (sleeping
clients with tap-to-call phones, LTV top) — with **no schema or sync changes** (the `clients`
table is already synced: `name`, `phone`, `visitsCount`, `lastVisitDate`, `spent`).

## Context (as shipped)

- TMA v1+v2a: tabs Сводка/Мастера, `TmaAuthGuard`, same-origin SPA, `PeriodSelector`
  (7д/30д/месяц) with `range(kind)`, `DeltaBadge`, pill UI pattern.
- Existing metrics: `noShowForDate` already computes count + lost revenue from `records.cost`
  (attendance = 2); utilization math (capacity from `resource_schedule`, booked seconds from
  `seance_length`) established in `staffTable`/`yesterdayUtilization`.
- Roadmap Phase 2 formulas are the basis; the four computable-today components are in scope,
  masters-problems/inefficient-hours/products/recommendations are NOT (later cycle).

## Decisions (locked)

| Decision | Choice |
|---|---|
| Losses composition | 4 blocks + annual total: отмены, no-show, простой, отток |
| Churn return-rate assumption | 30%, shown to the owner as an assumption |
| Sleeping threshold | user-switchable 30/60/90 days on the Клиенты screen, default 60; the losses «отток» block uses a fixed 60 |
| Phones | shown in the sleeping list, clickable `tel:` links |
| Tabs | TabBar grows to 4: Сводка · Мастера · Потери · Клиенты |
| Losses period basis | reuse `PeriodSelector`, default 30д; annual projection = period loss × (365 / period length in days) |

## 1. API — losses

### `MetricsService.lossesData(tenantId, from, to, tz)` (one new method)
Returns the raw ingredients over the inclusive range:

```ts
{
  revenue: number;        // Σ cost, attendance = 1
  visits: number;         // count, attendance = 1
  cancelled: number;      // count, attendance = -1
  noShowCount: number;    // count, attendance = 2
  noShowLost: number;     // Σ cost, attendance = 2
  bookedMin: number;      // Σ seance_length/60, attendance = 1
  capacityMin: number;    // Σ resource_schedule.working_minutes over range (all staff)
  sleepingCount: number;  // clients with last_visit_date < (today-in-tz − 60d), visits_count >= 1
  avgCheck: number;       // revenue / visits, 0-guarded
}
```

One SQL over `records` (FILTER aggregates, tz-aware, `deleted = false`, tenant-scoped) + one over
`resource_schedule` + one over `clients`. Money `Math.round`ed.

### `TmaService.losses(tenantId, from, to): Promise<TmaLosses>` (composition, pure math unit-tested)

```ts
export interface LossBlock { period: number; annual: number }   // tenge
export interface TmaLosses {
  periodDays: number;                    // inclusive length of [from, to]
  cancellations: LossBlock & { count: number };
  noShow: LossBlock & { count: number };
  idle: LossBlock & { idleHours: number };
  churn: LossBlock & { sleepingCount: number; returnRatePct: 30 };
  totalAnnual: number;
}
```

Formulas (all 0-guarded):
- `cancellations.period = cancelled × avgCheck`
- `noShow.period = noShowLost`
- `idle.period = max(0, capacityMin − bookedMin)/60 × revenuePerHour`, where
  `revenuePerHour = revenue / (bookedMin/60)`; when `bookedMin = 0` or `capacityMin = 0` the block
  is 0 (no fantasy numbers).
- `churn.period = sleepingCount × avgCheck × 0.30`
- `annual = round(period × 365 / periodDays)`; `totalAnnual` = sum of the four annuals.

### Endpoint
`GET /tma/losses?from&to` → `TmaLosses`, behind `TmaAuthGuard`.

## 2. API — clients

### `MetricsService.clientsAnalytics(tenantId, sleepingDays, tz)` (one new method)

All from the `clients` table (no join to records needed):

```ts
export interface SleepingClient {
  name: string | null; phone: string | null;
  daysSince: number; visits: number; spent: number;
}
export interface TopClient { name: string | null; phone: string | null; visits: number; spent: number }
export interface TmaClients {
  totalClients: number;       // clients with visits_count >= 1
  sleepingCount: number;      // last_visit_date < today − sleepingDays
  almostLostCount: number;    // last_visit_date < today − 90 (fixed)
  sleeping: SleepingClient[]; // sorted by spent desc, limit 30
  top: TopClient[];           // by spent desc, limit 10
}
```

`today` computed in tenant tz. `spent` is numeric-as-string in the entity — `Math.round(Number(...))`.
Clients with `last_visit_date IS NULL` are excluded from sleeping (no signal), included in totals
only when `visits_count >= 1`.

### Endpoint
`GET /tma/clients?sleepingDays=60` → `TmaClients`; `sleepingDays` validated to {30, 60, 90},
anything else falls back to 60.

## 3. Frontend — two new tabs (TabBar → 4)

- **Потери** (`screens/Losses.tsx`): `PeriodSelector` (default 30д); hero card «Вы теряете
  ~{totalAnnual} в год»; 4 cards, each: title, per-period value, «≈ X в год», context line
  (count / idle hours / sleeping count + «при возврате 30%»); disclaimer footer «Оценка по данным
  выбранного периода, не бухгалтерия». Pure `LossesView({ data })` + container (same pattern as
  StaffDetailScreen).
- **Клиенты** (`screens/Clients.tsx`): threshold pills 30/60/90 (default 60, refetch on switch);
  counters row (всего / спящих / 90+); sleeping list — name, `tel:` phone link, «N дней назад ·
  M визитов · Y ₸»; then «Топ клиентов» list. Pure `ClientsView` + container.
- `TabBar` gains two entries (Потери, Клиенты) — icons consistent with existing style.
- Visual execution via the frontend-designer skill; data contracts fixed here.

## Boundaries (explicit)

- No DB schema changes, no sync changes.
- v1/v2a endpoint contracts untouched; two new endpoints only.
- Masters-problems, inefficient hours, product losses, recommendations, PDF export — later cycles.
- Bot untouched.

## Testing

- **Unit:** losses composition math (each formula, 0-guards for bookedMin/capacity/visits,
  annual projection incl. 1-day and month windows, totalAnnual) with `lossesData` mocked;
  `sleepingDays` whitelist fallback.
- **Integration (testcontainers):** `lossesData` (fixture with completed/cancelled/no-show
  records + capacity; asserts every ingredient), `clientsAnalytics` (seeded clients: sleeping vs
  active vs null-last-visit vs 90+; ordering and limits); endpoint smokes for both routes through
  the real guard (200 shape + 401).
- **Frontend:** renderToString for `LossesView` (hero, 4 blocks, disclaimer) and `ClientsView`
  (counters, tel: link present); live smoke on BrowUp.

## Success criteria

The owner opens «Потери» and sees a defensible annual loss estimate decomposed into four
labeled blocks with the 30% assumption visible; opens «Клиенты», switches 30/60/90, and can
tap a sleeping client's phone to call — all on real BrowUp data, with existing contracts intact.
