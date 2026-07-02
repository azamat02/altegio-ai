# TMA v2a — mobile fullscreen, period compare, master drill-down — design spec

**Date:** 2026-07-03
**Status:** Approved (brainstorming)
**Scope note:** v2 was split into two cycles. This spec is **v2a**. The «Потери» screen and
client analytics are **v2b** — a separate spec/plan after this ships.

## Goal

Deepen the shipped TMA v1 (Summary + Staff on real data): fullscreen on mobile clients,
period-over-period deltas on both screens, and a per-master drill-down screen — with **no schema
or sync changes** (everything derives from existing tables and queries).

## Context (as shipped in v1)

- SPA `apps/tma` (Vite+React) served same-origin by nginx at `https://altegio.167.99.250.107.nip.io`;
  relative API calls to `/tma/*`; auth via `Authorization: tma <initData>` (guard resolves tenant
  from `tenant_chats`; initData read from `Telegram.WebApp.initData` with a launch-hash fallback).
- Endpoints: `GET /tma/summary?date=`, `GET /tma/staff?from&to`, `GET /tma/staff/:id/trend?days=`.
- Metrics: `staffTable(tenantId, from, to, tz)`, `staffRevenueTrend(...)`, `revenueSeries(...)`;
  `buildDailyReportData` already computes `dynamics` (week vs prev week, month vs prev MTD).
- `records.altegio_service_id` exists (migration `1700000009000-AddRecordServiceId`) and joins to
  `services` (see `todayCategoryFillRates`) — a per-master services breakdown needs no new sync.
- Frontend: `App.tsx` (tab shell, loading/NO_SALON/NO_INITDATA/error states), `Staff.tsx`
  (`PeriodSelector` 7д/30д/месяц, lazy sparkline per master), `telegram.ts`
  (`initTelegram` = `ready()` + `expand()`; `getInitData` with hash fallback).

## 1. Fullscreen on mobile (frontend only)

- In `initTelegram()`: if `Telegram.WebApp.platform` ∈ {`ios`, `android`} AND the client exposes
  `requestFullscreen` (Bot API 8.0+), call it inside try/catch (refusal non-fatal — falls back to
  the current expanded mode). Desktop platforms (`tdesktop`, `macos`, `web`, `weba`, unknown)
  keep today's behavior: `ready()` + `expand()` only.
- Safe area: subscribe to `fullscreenChanged` / `safeAreaChanged` / `contentSafeAreaChanged` via
  `Telegram.WebApp.onEvent`; write `safeAreaInset.top + contentSafeAreaInset.top` into a
  `--safe-top` CSS variable on `<html>`; the app header/top padding consumes
  `var(--safe-top, 0px)`. (Pattern proven in the MALLI demo.)
- Pure helper `shouldRequestFullscreen(platform: string | undefined, hasApi: boolean): boolean`
  — unit-tested; the wiring itself is thin.

## 2. Period compare

### Summary screen (zero new SQL)
- `TmaSummary` (shared type) gains `dynamics: { week: {...}, month: {...} } | null`, passed
  through from `buildDailyReportData`'s existing `yesterday.dynamics` value (reuse the exact
  shared type it already has in `DailyReportData` — do not redefine shapes).
- UI: two compact delta chips under the revenue hero («Неделя ▲ +12%», «Месяц ▼ −8%»), red/green
  by sign, hidden when null.

### Staff screen (service-layer merge, zero new SQL)
- `GET /tma/staff?from&to&compare=1`: when `compare=1`, `TmaService` calls `staffTable` twice —
  current window and the previous window of equal length ending the day before `from` — and merges:
  - each row gains `prevRevenue: number` and `deltaPct: number | null` (null when prevRevenue is 0);
  - response becomes `{ rows: StaffTableRow[], totals: { revenue, prevRevenue, deltaPct } }` when
    `compare=1`; WITHOUT the flag the response stays the bare `StaffTableRow[]` array
    (backward-compatible — the deployed SPA and the v1 contract keep working).
- Extended row shape: `StaffCompareRow = StaffTableRow & { prevRevenue: number; deltaPct: number | null }`
  in `@altegio/shared`.
- Previous-window math: `prevTo = from - 1 day`, `prevFrom = prevTo - (to - from)` (same length,
  inclusive). Pure helper `previousWindow(from, to): { from, to }` — unit-tested.
- Staff not present in the previous window ⇒ `prevRevenue = 0`, `deltaPct = null` (shown as «новый»
  rather than +∞). Staff present before but absent now are NOT listed (screen shows current roster).
- UI: delta badge on each master card (▲ green / ▼ red / «новый» neutral); totals line under the
  `PeriodSelector`. The SPA always requests `compare=1`.

## 3. Master drill-down

### API
- New endpoint `GET /tma/staff/:id/detail?from&to` → shared `StaffDetail`:

```ts
export interface StaffServiceRow { title: string; visits: number; revenue: number }
export interface StaffDetail {
  staffId: number;
  name: string;
  revenue: number;
  visits: number;
  avgCheck: number;
  utilizationPct: number | null;
  newClients: number;
  returningClients: number;
  cancelled: number;
  noShow: number;
  services: StaffServiceRow[];      // top by revenue, max 10
  trend: TrendPoint[];              // 30d, reuse staffRevenueTrend
}
```

- One new `MetricsService` method `staffDetail(tenantId, staffId, from, to, tz)` implementing the
  header numbers + services + client split + cancelled/noShow in SQL (patterns already exist:
  services join as in `todayCategoryFillRates`; new-vs-returning CTE as in `staffTable`, scoped to
  one staff; `attendance = 2` for no-show). `trend` is composed in `TmaService` from the existing
  `staffRevenueTrend`.
- Tenant-scoped, tz-aware day boundaries, `deleted = false`, money integers — same invariants as v1.

### UI
- Tap on a master card in Staff → `StaffDetailScreen` (replaces the current inline sparkline
  expansion as the tap action). Period inherited from the Staff screen's `PeriodSelector`.
- Back navigation via `Telegram.WebApp.BackButton` (`show()` on enter, `onClick` → return to list,
  `hide()` on leave), with an in-app fallback back control when the BackButton API is unavailable.
- Content: header numbers, delta-styled trend chart (reuse `RevenueChart`/`Sparkline`), services
  list with visits+revenue, clients split, cancelled/no-show row.

## Boundaries (explicit)

- No DB schema changes, no sync changes, no new tables.
- v1 endpoint contracts unchanged unless the new opt-in `compare=1` flag is passed.
- «Потери», client analytics, multi-salon switcher — v2b+.
- Bot (telegram-bot module) untouched.

## Testing

- **Unit:** `shouldRequestFullscreen` matrix; `previousWindow` math (month boundaries, 1-day
  windows); compare-merge logic (delta calc, new-staff null, totals) with `staffTable` mocked.
- **Integration (testcontainers):** `staffDetail` SQL — seeded fixture asserting services
  aggregation, new-vs-returning for one staff, cancelled/noShow counts, tz boundary; endpoint
  smoke for `/tma/staff/:id/detail` and `/tma/staff?compare=1` through the real guard.
- **Frontend:** vitest on pure helpers + `renderToString` checks for delta badges and the detail
  screen rendering `StaffDetail` fixture; live verification in Telegram (fullscreen on phone,
  normal on desktop).

## Success criteria

On a phone the TMA opens fullscreen with correct safe-area padding (desktop unchanged); Summary
shows week/month deltas; each master card shows a period-over-period badge with a salon totals
line; tapping a master opens a detail screen (trend, services, clients, cancels/no-show) with
native back navigation — all on real BrowUp data, with v1 API contracts intact.
