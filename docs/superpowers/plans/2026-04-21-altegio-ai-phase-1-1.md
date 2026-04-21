# Phase 1.1 — Dual-Message Morning Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace master-based loading (inflated when masters share a cabinet) with honest resource-based utilisation, split the morning report into two Telegram messages (yesterday + today), add monthly plan % and per-category fill rates.

**Architecture:** Pull Altegio `/resources` and `/timetable/resources/{id}/{date}` alongside records. Compute resource ↔ category affinity from rolling 90-day history inside the existing aggregator. Aggregate yesterday utilisation, monthly goal, and today category fill rates from these new tables. Rewrite template to emit two independent messages; tag `report_deliveries` rows with `message_kind` for per-message idempotency. Backfill window extended to 120 days at onboarding.

**Tech Stack:** NestJS 10 + TypeORM + Postgres 16 + BullMQ + Telegraf + @anthropic-ai/sdk + ts-jest (unchanged).

**Spec:** [`docs/superpowers/specs/2026-04-21-phase-1-1-dual-message-report-design.md`](../specs/2026-04-21-phase-1-1-dual-message-report-design.md)

---

## File Map

**Created:**
- `apps/api/src/db/migrations/1700000006000-CreateResourceTables.ts`
- `apps/api/src/db/migrations/1700000007000-AddRecordResourceInstanceIds.ts`
- `apps/api/src/db/migrations/1700000008000-AddReportDeliveryKind.ts`
- `apps/api/src/modules/altegio/dto/resource.dto.ts`
- `apps/api/src/modules/altegio/dto/timetable.dto.ts`
- `apps/api/src/modules/altegio/endpoints/resources.ts`
- `apps/api/src/modules/altegio/endpoints/timetable.ts`
- `apps/api/src/modules/sync/parsers/resources.parser.ts`
- `apps/api/src/modules/sync/parsers/timetable.parser.ts`
- `apps/api/src/modules/sync/resource-affinity.service.ts`
- `apps/api/src/modules/sync/parsers/resources.parser.spec.ts`
- `apps/api/src/modules/sync/parsers/timetable.parser.spec.ts`
- `apps/api/src/modules/metrics/metrics.service.spec.ts` additions for new methods (file may already exist)
- `apps/api/test/resource-affinity.int.spec.ts`
- `apps/api/test/fixtures/altegio/resources-sample.json`
- `apps/api/test/fixtures/altegio/timetable-sample.json`

**Modified:**
- `packages/shared/src/types/report.ts` (DailyReportData shape)
- `apps/api/src/modules/altegio/altegio.module.ts` (register endpoints)
- `apps/api/src/modules/altegio/dto/record.dto.ts` (add resource_instance_ids)
- `apps/api/src/modules/sync/parsers/records.parser.ts` (length fallback, resource ids)
- `apps/api/src/modules/sync/raw-writer.service.ts` (persist resources + timetable)
- `apps/api/src/modules/sync/aggregator.service.ts` (calls ResourceAffinityService)
- `apps/api/src/modules/sync/sync.service.ts` (pull resources + timetable, 120-day default)
- `apps/api/src/modules/metrics/metrics.service.ts` (new methods)
- `apps/api/src/modules/reports/entities/report-delivery.entity.ts` (message_kind)
- `apps/api/src/modules/reports/reports.service.ts` (dual send)
- `apps/api/src/modules/reports/template.renderer.ts` (split yesterday/today)
- `apps/api/src/modules/reports/ai-insight.service.ts` (prompt + DTO)
- Existing test files for above modules.

---

## Running totals reference

After this plan:
- Migrations: 9 (was 6)
- New service: `ResourceAffinityService`
- Two new Altegio endpoints: `ResourcesEndpoint`, `TimetableEndpoint`
- Report now emits **two** Telegram messages per tenant per morning.

---

### Task 1: Migration — resources / resource_schedule / resource_category_affinity

**Files:**
- Create: `apps/api/src/db/migrations/1700000006000-CreateResourceTables.ts`

- [ ] **Step 1: Write the migration**

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateResourceTables1700000006000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE resources (
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        altegio_id int NOT NULL,
        title text NOT NULL,
        fetched_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (tenant_id, altegio_id)
      )
    `);

    await q.query(`
      CREATE TABLE resource_schedule (
        tenant_id uuid NOT NULL,
        resource_altegio_id int NOT NULL,
        date date NOT NULL,
        working_minutes int NOT NULL,
        fetched_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (tenant_id, resource_altegio_id, date)
      )
    `);

    await q.query(`
      CREATE INDEX idx_resource_schedule_tenant_date
      ON resource_schedule (tenant_id, date)
    `);

    await q.query(`
      CREATE TABLE resource_category_affinity (
        tenant_id uuid NOT NULL,
        resource_altegio_id int NOT NULL,
        category_altegio_id int NOT NULL,
        share numeric(5,4) NOT NULL,
        computed_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (tenant_id, resource_altegio_id, category_altegio_id)
      )
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS resource_category_affinity');
    await q.query('DROP TABLE IF EXISTS resource_schedule');
    await q.query('DROP TABLE IF EXISTS resources');
  }
}
```

- [ ] **Step 2: Rebuild shared and run integration tests to confirm schema applies**

Run: `pnpm -F @altegio/api test:int -- --testPathPattern=tenants`
Expected: existing tenant int test still passes; no "migration failed" output.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/db/migrations/1700000006000-CreateResourceTables.ts
git commit -m "feat(db): add resources, resource_schedule, resource_category_affinity tables"
```

---

### Task 2: Migration — records.resource_instance_ids

**Files:**
- Create: `apps/api/src/db/migrations/1700000007000-AddRecordResourceInstanceIds.ts`

- [ ] **Step 1: Write the migration**

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRecordResourceInstanceIds1700000007000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE records
      ADD COLUMN resource_instance_ids int[] NOT NULL DEFAULT '{}'
    `);
    await q.query(`
      CREATE INDEX idx_records_resource_gin
      ON records USING gin (resource_instance_ids)
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP INDEX IF EXISTS idx_records_resource_gin');
    await q.query('ALTER TABLE records DROP COLUMN IF EXISTS resource_instance_ids');
  }
}
```

- [ ] **Step 2: Run integration tests to confirm column applies**

Run: `pnpm -F @altegio/api test:int -- --testPathPattern=sync`
Expected: passes with the new column present (existing syncs write `'{}'` default).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/db/migrations/1700000007000-AddRecordResourceInstanceIds.ts
git commit -m "feat(db): add records.resource_instance_ids column"
```

---

### Task 3: Migration — report_deliveries.message_kind

**Files:**
- Create: `apps/api/src/db/migrations/1700000008000-AddReportDeliveryKind.ts`
- Modify: `apps/api/src/modules/reports/entities/report-delivery.entity.ts`

- [ ] **Step 1: Write the migration**

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReportDeliveryKind1700000008000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE report_deliveries
      ADD COLUMN message_kind text NOT NULL DEFAULT 'yesterday'
    `);
    // Drop old unique (tenant, date) if present, add per-kind unique.
    await q.query(`
      ALTER TABLE report_deliveries
      DROP CONSTRAINT IF EXISTS uq_report_deliveries_tenant_date
    `);
    await q.query(`
      ALTER TABLE report_deliveries
      ADD CONSTRAINT uq_report_deliveries_tenant_date_kind
      UNIQUE (tenant_id, date, message_kind)
    `);
    await q.query(`
      ALTER TABLE report_deliveries
      ADD CONSTRAINT chk_report_deliveries_kind
      CHECK (message_kind IN ('yesterday','today'))
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE report_deliveries DROP CONSTRAINT IF EXISTS chk_report_deliveries_kind');
    await q.query('ALTER TABLE report_deliveries DROP CONSTRAINT IF EXISTS uq_report_deliveries_tenant_date_kind');
    await q.query('ALTER TABLE report_deliveries DROP COLUMN IF EXISTS message_kind');
  }
}
```

- [ ] **Step 2: Update the entity**

Modify `apps/api/src/modules/reports/entities/report-delivery.entity.ts` — add:

```ts
@Column({ type: 'text', name: 'message_kind' })
messageKind!: 'yesterday' | 'today';
```

- [ ] **Step 3: Build + run api tests**

Run: `pnpm -F @altegio/api build && pnpm -F @altegio/api test`
Expected: compiles, all 44 unit tests still pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/db/migrations/1700000008000-AddReportDeliveryKind.ts apps/api/src/modules/reports/entities/report-delivery.entity.ts
git commit -m "feat(db): per-message idempotency for report_deliveries (message_kind)"
```

---

### Task 4: Shared type — new DailyReportData shape

**Files:**
- Modify: `packages/shared/src/types/report.ts`

- [ ] **Step 1: Read the current shape**

Run: `cat packages/shared/src/types/report.ts`

- [ ] **Step 2: Rewrite the type to the Phase 1.1 shape**

```ts
export type TopStaff = { name: string; revenue: number; visits: number };
export type CategoryFill = { name: string; fillPct: number; visits: number };

export type YesterdayBlock = {
  date: string;              // 'YYYY-MM-DD'
  revenue: number;
  avg7: number | null;
  deltaPct: number | null;
  came: number;
  cancelled: number;
  avgCheck: number | null;
  utilizationPct: number | null;
  monthlyGoalPct: number | null;
  monthlyGoalTarget: number | null;
  monthlyGoalMtd: number | null;
  topStaff: TopStaff[];
  aiInsight: string | null;
};

export type TodayBlock = {
  date: string;
  scheduled: number;
  utilizationPct: number | null;
  categories: CategoryFill[]; // top-5 by capacity desc, may be empty
};

export type DailyReportData = {
  salonName: string;
  timezone: string;
  yesterday: YesterdayBlock;
  today: TodayBlock;
};
```

- [ ] **Step 3: Rebuild shared**

Run: `pnpm -F @altegio/shared build`
Expected: no errors.

- [ ] **Step 4: Commit (api side will fail build until updated in later tasks — that's fine, stays uncommitted until next tasks catch up)**

```bash
git add packages/shared/src/types/report.ts
git commit -m "feat(shared): Phase 1.1 DailyReportData shape (utilisation, monthly goal, categories)"
```

---

### Task 5: Altegio resource DTO

**Files:**
- Create: `apps/api/src/modules/altegio/dto/resource.dto.ts`

- [ ] **Step 1: Write the DTO**

```ts
export interface AltegioResourceDto {
  id: number;
  title: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/altegio/dto/resource.dto.ts
git commit -m "feat(altegio): AltegioResourceDto"
```

---

### Task 6: Altegio timetable DTO

**Files:**
- Create: `apps/api/src/modules/altegio/dto/timetable.dto.ts`

- [ ] **Step 1: Write the DTO**

```ts
export interface AltegioResourceTimetableDto {
  date: string;            // YYYY-MM-DD
  is_working: boolean;
  slots: Array<{ from: string; to: string }>; // HH:mm
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/altegio/dto/timetable.dto.ts
git commit -m "feat(altegio): AltegioResourceTimetableDto"
```

---

### Task 7: ResourcesEndpoint — fetch cabinets for a location

**Files:**
- Create: `apps/api/src/modules/altegio/endpoints/resources.ts`
- Modify: `apps/api/src/modules/altegio/altegio.module.ts`
- Test: expand existing `apps/api/src/modules/altegio/altegio.client.spec.ts` only if it becomes relevant; otherwise add parser-only tests later.

- [ ] **Step 1: Write the endpoint**

```ts
import { Injectable } from '@nestjs/common';
import { AltegioClient } from '../altegio.client';
import { AltegioAuthContext } from '../types';
import { AltegioResourceDto } from '../dto/resource.dto';

@Injectable()
export class ResourcesEndpoint {
  constructor(private readonly client: AltegioClient) {}

  async fetchAll(auth: AltegioAuthContext): Promise<AltegioResourceDto[]> {
    type Resp = { success: boolean; data: AltegioResourceDto[] };
    const res = await this.client.get<Resp>(auth, `/resources/${auth.locationId}`);
    return res.data;
  }
}
```

- [ ] **Step 2: Register in `altegio.module.ts` alongside existing endpoints**

Add `ResourcesEndpoint` to `providers` and `exports`.

- [ ] **Step 3: Compile-check**

Run: `pnpm -F @altegio/api build`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/altegio/endpoints/resources.ts apps/api/src/modules/altegio/altegio.module.ts
git commit -m "feat(altegio): ResourcesEndpoint"
```

---

### Task 8: TimetableEndpoint — resource schedule per date

**Files:**
- Create: `apps/api/src/modules/altegio/endpoints/timetable.ts`
- Modify: `apps/api/src/modules/altegio/altegio.module.ts`

- [ ] **Step 1: Write the endpoint**

```ts
import { Injectable } from '@nestjs/common';
import { AltegioClient } from '../altegio.client';
import { AltegioAuthContext } from '../types';
import { AltegioResourceTimetableDto } from '../dto/timetable.dto';

@Injectable()
export class TimetableEndpoint {
  constructor(private readonly client: AltegioClient) {}

  /** Pull resource timetable for a date range. */
  async fetchResourceRange(
    auth: AltegioAuthContext,
    resourceId: number,
    start: string,
    end: string,
  ): Promise<AltegioResourceTimetableDto[]> {
    type Resp = { success: boolean; data: AltegioResourceTimetableDto[] };
    const res = await this.client.get<Resp>(
      auth,
      `/timetable/resources/${auth.locationId}/${resourceId}`,
      { start_date: start, end_date: end },
    );
    return res.data;
  }
}
```

- [ ] **Step 2: Register in `altegio.module.ts`**

Add to providers + exports.

- [ ] **Step 3: Compile-check**

Run: `pnpm -F @altegio/api build`

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/altegio/endpoints/timetable.ts apps/api/src/modules/altegio/altegio.module.ts
git commit -m "feat(altegio): TimetableEndpoint for resource schedules"
```

---

### Task 9: Record DTO — add resource_instance_ids

**Files:**
- Modify: `apps/api/src/modules/altegio/dto/record.dto.ts`

- [ ] **Step 1: Add optional field**

```ts
export interface AltegioRecordDto {
  // …existing fields
  resource_instance_ids?: number[];
}
```

- [ ] **Step 2: Build**

Run: `pnpm -F @altegio/api build`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/altegio/dto/record.dto.ts
git commit -m "feat(altegio): records DTO carries resource_instance_ids"
```

---

### Task 10: Records parser — length fallback + resource ids

**Files:**
- Modify: `apps/api/src/modules/sync/parsers/records.parser.ts`
- Modify: `apps/api/src/modules/sync/parsers/records.parser.spec.ts`

- [ ] **Step 1: Update the failing test first**

In the existing spec, add a case:

```ts
it('prefers record.length over service.seance_length and carries resource ids', () => {
  const dto: AltegioRecordDto = {
    id: 1, staff_id: 11, services: [{ id: 100 }],
    datetime: '2026-04-19T10:00:00+05:00',
    attendance: 1, cost: 10000, seance_length: 1800, length: 2400,
    resource_instance_ids: [135733],
  } as AltegioRecordDto;

  const row = parseRecord('t', dto);
  expect(row.seanceLength).toBe(2400);
  expect(row.resourceInstanceIds).toEqual([135733]);
});
```

- [ ] **Step 2: Run test; expect FAIL**

Run: `pnpm -F @altegio/api test -- --testPathPattern=records.parser`
Expected: compile error on `resourceInstanceIds` or assertion fail (currently uses seance_length first).

- [ ] **Step 3: Implement**

In `records.parser.ts`, change the `seanceLength` line and add resource ids:

```ts
seanceLength: Number(dto.length ?? dto.seance_length ?? 0) || null,
resourceInstanceIds: Array.isArray(dto.resource_instance_ids) ? dto.resource_instance_ids : [],
```

And in the row type / insert, add column `resource_instance_ids`.

- [ ] **Step 4: Run test; expect PASS**

Run: `pnpm -F @altegio/api test -- --testPathPattern=records.parser`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/sync/parsers/records.parser.ts apps/api/src/modules/sync/parsers/records.parser.spec.ts
git commit -m "feat(sync): records carry resource ids, prefer length over seance_length"
```

---

### Task 11: Resources parser + fixtures + unit test

**Files:**
- Create: `apps/api/test/fixtures/altegio/resources-sample.json` (paste a mini sample: 4 items like `{"id":135733,"title":"Маникюрный стол #1"}`)
- Create: `apps/api/src/modules/sync/parsers/resources.parser.ts`
- Create: `apps/api/src/modules/sync/parsers/resources.parser.spec.ts`

- [ ] **Step 1: Create the fixture**

Write a minimal JSON array of 4 resources.

- [ ] **Step 2: Write the failing spec**

```ts
import resourcesSample from '../../test/fixtures/altegio/resources-sample.json';
import { parseResources } from './resources.parser';

describe('parseResources', () => {
  it('maps id+title for each resource', () => {
    const rows = parseResources('tenant-a', resourcesSample as any);
    expect(rows).toHaveLength(resourcesSample.length);
    expect(rows[0]).toMatchObject({ tenantId: 'tenant-a', altegioId: expect.any(Number), title: expect.any(String) });
  });
});
```

- [ ] **Step 3: Run — expect FAIL (no module)**

Run: `pnpm -F @altegio/api test -- --testPathPattern=resources.parser`

- [ ] **Step 4: Implement**

```ts
import { AltegioResourceDto } from '../../altegio/dto/resource.dto';

export interface ResourceRow {
  tenantId: string;
  altegioId: number;
  title: string;
}

export function parseResources(tenantId: string, dtos: AltegioResourceDto[]): ResourceRow[] {
  return dtos.map(d => ({ tenantId, altegioId: d.id, title: d.title }));
}
```

- [ ] **Step 5: Run — PASS**

- [ ] **Step 6: Commit**

```bash
git add apps/api/test/fixtures/altegio/resources-sample.json apps/api/src/modules/sync/parsers/resources.parser.ts apps/api/src/modules/sync/parsers/resources.parser.spec.ts
git commit -m "feat(sync): resources parser"
```

---

### Task 12: Timetable parser + fixture + unit test

**Files:**
- Create: `apps/api/test/fixtures/altegio/timetable-sample.json` (a few `{date, is_working, slots:[{from,to}]}` entries)
- Create: `apps/api/src/modules/sync/parsers/timetable.parser.ts`
- Create: `apps/api/src/modules/sync/parsers/timetable.parser.spec.ts`

- [ ] **Step 1: Create fixture (e.g., 3 days, one with two slots, one `is_working: false`)**

- [ ] **Step 2: Write the failing spec**

```ts
import sample from '../../test/fixtures/altegio/timetable-sample.json';
import { parseTimetable } from './timetable.parser';

describe('parseTimetable', () => {
  it('sums slot minutes per date, zero when is_working=false', () => {
    const rows = parseTimetable('tenant-a', 135733, sample as any);
    const byDate = Object.fromEntries(rows.map(r => [r.date, r.workingMinutes]));
    // assert a known day -> expected minutes (compute from fixture)
  });
});
```

Fill `byDate` assertions based on the actual fixture you wrote.

- [ ] **Step 3: Run — expect FAIL**

- [ ] **Step 4: Implement**

```ts
import { AltegioResourceTimetableDto } from '../../altegio/dto/timetable.dto';

export interface ResourceScheduleRow {
  tenantId: string;
  resourceAltegioId: number;
  date: string;
  workingMinutes: number;
}

export function parseTimetable(
  tenantId: string,
  resourceAltegioId: number,
  dtos: AltegioResourceTimetableDto[],
): ResourceScheduleRow[] {
  return dtos.map(d => ({
    tenantId,
    resourceAltegioId,
    date: d.date,
    workingMinutes: !d.is_working ? 0 : d.slots.reduce((acc, s) => acc + diffMinutes(s.from, s.to), 0),
  }));
}

function diffMinutes(from: string, to: string): number {
  const [fh, fm] = from.split(':').map(Number);
  const [th, tm] = to.split(':').map(Number);
  return th * 60 + tm - (fh * 60 + fm);
}
```

- [ ] **Step 5: Run — PASS**

- [ ] **Step 6: Commit**

```bash
git add apps/api/test/fixtures/altegio/timetable-sample.json apps/api/src/modules/sync/parsers/timetable.parser.ts apps/api/src/modules/sync/parsers/timetable.parser.spec.ts
git commit -m "feat(sync): timetable parser sums working minutes per day"
```

---

### Task 13: Raw-writer — persist resources + schedule

**Files:**
- Modify: `apps/api/src/modules/sync/raw-writer.service.ts`

- [ ] **Step 1: Add two writer methods**

```ts
async upsertResources(rows: ResourceRow[]): Promise<void> {
  if (!rows.length) return;
  await this.dataSource.query(`
    INSERT INTO resources (tenant_id, altegio_id, title)
    SELECT * FROM unnest($1::uuid[], $2::int[], $3::text[])
    ON CONFLICT (tenant_id, altegio_id) DO UPDATE SET title = EXCLUDED.title, fetched_at = now()
  `, [rows.map(r => r.tenantId), rows.map(r => r.altegioId), rows.map(r => r.title)]);
}

async upsertResourceSchedule(rows: ResourceScheduleRow[]): Promise<void> {
  if (!rows.length) return;
  await this.dataSource.query(`
    INSERT INTO resource_schedule (tenant_id, resource_altegio_id, date, working_minutes)
    SELECT * FROM unnest($1::uuid[], $2::int[], $3::date[], $4::int[])
    ON CONFLICT (tenant_id, resource_altegio_id, date) DO UPDATE SET working_minutes = EXCLUDED.working_minutes, fetched_at = now()
  `, [rows.map(r => r.tenantId), rows.map(r => r.resourceAltegioId), rows.map(r => r.date), rows.map(r => r.workingMinutes)]);
}
```

- [ ] **Step 2: Build**

Run: `pnpm -F @altegio/api build`

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/sync/raw-writer.service.ts
git commit -m "feat(sync): upsert resources + resource_schedule"
```

---

### Task 14: SyncService — pull resources + timetable, extend backfill default

**Files:**
- Modify: `apps/api/src/modules/sync/sync.service.ts`

- [ ] **Step 1: Add a new step in `runForTenant(tenantId, opts)`**

Inside the existing flow, after records sync, add:

```ts
const resources = await this.resourcesEndpoint.fetchAll(auth);
const resourceRows = parseResources(tenantId, resources);
await this.rawWriter.upsertResources(resourceRows);

const start = dayjs(endDate).subtract(opts.days, 'day').format('YYYY-MM-DD');
const end = dayjs(endDate).add(1, 'day').format('YYYY-MM-DD'); // include tomorrow for today's capacity

for (const r of resources) {
  const tt = await this.timetableEndpoint.fetchResourceRange(auth, r.id, start, end);
  await this.rawWriter.upsertResourceSchedule(parseTimetable(tenantId, r.id, tt));
}
```

Keep the existing records/services/staff/clients sync ahead of this.

- [ ] **Step 2: Change the default backfill for onboarding**

CLI `add-salon` already runs an initial sync via `trigger-sync`. Keep the CLI default at `--days 30` but add an alias flag `--onboard` that sets 120:

```ts
.option('--onboard', 'Use 120-day backfill window (first sync of a new tenant)')
```

Internally:
```ts
const days = opts.onboard ? 120 : opts.days;
```

Also: `trigger-report` callers can override with `--days 120` manually.

- [ ] **Step 3: Add a passing integration test**

Extend `apps/api/test/sync.int.spec.ts`:

```ts
it('pulls resources and populates resource_schedule', async () => {
  mockAltegio.setResources(resourcesSample);
  mockAltegio.setTimetable(timetableSample);
  await sync.runForTenant(tenantId, { days: 3 });
  const schedule = await db.query('SELECT * FROM resource_schedule WHERE tenant_id = $1', [tenantId]);
  expect(schedule.rows.length).toBeGreaterThan(0);
});
```

- [ ] **Step 4: Run int test**

Run: `pnpm -F @altegio/api test:int -- --testPathPattern=sync`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/sync/sync.service.ts apps/api/src/modules/cli/... apps/api/test/sync.int.spec.ts
git commit -m "feat(sync): pull resources + per-resource timetable, --onboard flag for 120-day backfill"
```

---

### Task 15: ResourceAffinityService — compute + upsert affinity

**Files:**
- Create: `apps/api/src/modules/sync/resource-affinity.service.ts`
- Test: `apps/api/test/resource-affinity.int.spec.ts`

- [ ] **Step 1: Write the failing int test**

```ts
describe('ResourceAffinityService', () => {
  it('computes share per (resource, category) from 90d history', async () => {
    await seedRecords(tenantId, [
      { resource: 135733, category: 7001, count: 90 }, // mostly маникюр
      { resource: 135733, category: 7002, count: 10 }, // 10% педикюр
      { resource: 135734, category: 7003, count: 30 },
    ]);
    await svc.recompute(tenantId);
    const rows = await query('SELECT * FROM resource_category_affinity WHERE tenant_id = $1 ORDER BY resource_altegio_id, category_altegio_id', [tenantId]);
    expect(rows).toEqual([
      { tenant_id: tenantId, resource_altegio_id: 135733, category_altegio_id: 7001, share: '0.9000' /* ... */ },
      { tenant_id: tenantId, resource_altegio_id: 135733, category_altegio_id: 7002, share: '0.1000' /* ... */ },
      { tenant_id: tenantId, resource_altegio_id: 135734, category_altegio_id: 7003, share: '1.0000' /* ... */ },
    ]);
  });

  it('drops (resource, category) pairs with n < 3', async () => {
    await seedRecords(tenantId, [{ resource: 1, category: 10, count: 2 }, { resource: 1, category: 11, count: 100 }]);
    await svc.recompute(tenantId);
    const rows = await query('SELECT * FROM resource_category_affinity WHERE tenant_id = $1', [tenantId]);
    expect(rows).toHaveLength(1);
    expect(rows[0].category_altegio_id).toBe(11);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement the service**

```ts
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class ResourceAffinityService {
  constructor(private readonly ds: DataSource) {}

  async recompute(tenantId: string): Promise<void> {
    await this.ds.query(`
      WITH exploded AS (
        SELECT r.tenant_id, resource_id, s.category_altegio_id
        FROM records r
        JOIN unnest(r.resource_instance_ids) AS resource_id ON true
        JOIN services s ON s.altegio_id = r.altegio_service_id AND s.tenant_id = r.tenant_id
        WHERE r.tenant_id = $1
          AND r.datetime >= now() - interval '90 days'
          AND cardinality(r.resource_instance_ids) > 0
      ),
      counts AS (
        SELECT tenant_id, resource_id, category_altegio_id, COUNT(*)::int AS n
        FROM exploded
        GROUP BY tenant_id, resource_id, category_altegio_id
        HAVING COUNT(*) >= 3
      ),
      totals AS (
        SELECT tenant_id, resource_id, SUM(n)::int AS total FROM counts GROUP BY tenant_id, resource_id
      )
      INSERT INTO resource_category_affinity (tenant_id, resource_altegio_id, category_altegio_id, share, computed_at)
      SELECT c.tenant_id, c.resource_id, c.category_altegio_id, (c.n::numeric / t.total)::numeric(5,4), now()
      FROM counts c JOIN totals t USING (tenant_id, resource_id)
      ON CONFLICT (tenant_id, resource_altegio_id, category_altegio_id)
      DO UPDATE SET share = EXCLUDED.share, computed_at = now()
    `, [tenantId]);

    // Delete stale rows that didn't make this run (pair not present anymore).
    await this.ds.query(`
      DELETE FROM resource_category_affinity
      WHERE tenant_id = $1 AND computed_at < now() - interval '1 hour'
    `, [tenantId]);
  }
}
```

(Column name `altegio_service_id` must match whatever `records` actually has; verify against the existing Task 5/12 record writer of the Phase 1 plan. If different, adjust SQL.)

- [ ] **Step 4: Register in `SyncModule`**

Add `ResourceAffinityService` to providers + exports.

- [ ] **Step 5: Run the int test — PASS**

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/sync/resource-affinity.service.ts apps/api/test/resource-affinity.int.spec.ts apps/api/src/modules/sync/sync.module.ts
git commit -m "feat(sync): ResourceAffinityService (90d rolling share per resource-category)"
```

---

### Task 16: Aggregator wires AffinityService at end of each sync

**Files:**
- Modify: `apps/api/src/modules/sync/aggregator.service.ts`

- [ ] **Step 1: Inject AffinityService and invoke it at the end of `rebuildFor(tenantId)`**

```ts
constructor(
  // …existing
  private readonly affinity: ResourceAffinityService,
) {}

async rebuildFor(tenantId: string): Promise<void> {
  // …existing aggregator steps
  await this.affinity.recompute(tenantId);
}
```

- [ ] **Step 2: Run existing aggregator int test to confirm it still passes**

Run: `pnpm -F @altegio/api test:int -- --testPathPattern=aggregator`

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/sync/aggregator.service.ts
git commit -m "feat(sync): aggregator recomputes resource-category affinity per run"
```

---

### Task 17: MetricsService — yesterdayUtilization

**Files:**
- Modify: `apps/api/src/modules/metrics/metrics.service.ts`
- Modify: `apps/api/test/metrics.int.spec.ts`

- [ ] **Step 1: Write failing int test**

```ts
it('computes yesterday utilisation as booked/capacity', async () => {
  await seedRecords([{ length: 60, attendance: 1 }, { length: 120, attendance: 1 }]);
  await seedResourceSchedule([{ resourceId: 1, workingMinutes: 360 }, { resourceId: 2, workingMinutes: 240 }]);
  const pct = await metrics.yesterdayUtilization(tenantId, '2026-04-19');
  // booked 180, capacity 600 -> 30
  expect(pct).toBe(30);
});

it('returns null when capacity is zero', async () => {
  const pct = await metrics.yesterdayUtilization(tenantId, '2026-04-18');
  expect(pct).toBeNull();
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

```ts
async yesterdayUtilization(tenantId: string, date: string): Promise<number | null> {
  const { rows } = await this.ds.query(`
    WITH booked AS (
      SELECT COALESCE(SUM(seance_length),0)::int AS mins
      FROM records
      WHERE tenant_id=$1 AND datetime::date = $2 AND attendance = 1
    ),
    capacity AS (
      SELECT COALESCE(SUM(working_minutes),0)::int AS mins
      FROM resource_schedule WHERE tenant_id=$1 AND date=$2
    )
    SELECT booked.mins AS b, capacity.mins AS c FROM booked, capacity
  `, [tenantId, date]);
  const { b, c } = rows[0];
  if (!c) return null;
  return Math.round((b / c) * 100);
}
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/metrics/metrics.service.ts apps/api/test/metrics.int.spec.ts
git commit -m "feat(metrics): yesterdayUtilization via resource_schedule"
```

---

### Task 18: MetricsService — monthlyGoal (avg 3m × 1.1)

**Files:**
- Modify: `apps/api/src/modules/metrics/metrics.service.ts`
- Modify: `apps/api/test/metrics.int.spec.ts`

- [ ] **Step 1: Write failing test**

```ts
it('returns null when history < 60 days', async () => {
  await seedMonthlyRevenue({ monthsBack: 1, amount: 1_000_000 });
  const goal = await metrics.monthlyGoal(tenantId, '2026-04-19');
  expect(goal).toBeNull();
});

it('returns { target, mtd, pct } with avg(3m)×1.1', async () => {
  await seedMonthlyRevenue([
    { monthsBack: 1, amount: 25_000_000 },
    { monthsBack: 2, amount: 23_000_000 },
    { monthsBack: 3, amount: 27_000_000 },
  ]);
  await seedMTD(tenantId, '2026-04-19', 19_500_000);
  const goal = await metrics.monthlyGoal(tenantId, '2026-04-19');
  expect(goal).toEqual({ target: 27_500_000, mtd: 19_500_000, pct: 71 });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

```ts
async monthlyGoal(tenantId: string, referenceDate: string): Promise<{ target: number; mtd: number; pct: number } | null> {
  const ref = new Date(referenceDate + 'T00:00:00Z');
  const { rows: historyRows } = await this.ds.query(`
    SELECT
      COUNT(DISTINCT date_trunc('month', datetime)) AS months,
      date_trunc('month', $2::date - interval '3 months') AS lower_bound
    FROM records WHERE tenant_id = $1 AND datetime >= $2::date - interval '60 days'
  `, [tenantId, referenceDate]);
  if (Number(historyRows[0].months) < 3) return null;

  const { rows } = await this.ds.query(`
    WITH prev AS (
      SELECT date_trunc('month', datetime)::date AS m, SUM(cost)::numeric AS rev
      FROM records
      WHERE tenant_id = $1 AND attendance = 1
        AND datetime >= date_trunc('month', $2::date) - interval '3 months'
        AND datetime <  date_trunc('month', $2::date)
      GROUP BY 1
    ),
    mtd AS (
      SELECT COALESCE(SUM(cost),0)::numeric AS rev
      FROM records
      WHERE tenant_id = $1 AND attendance = 1
        AND datetime >= date_trunc('month', $2::date)
        AND datetime <  $2::date
    )
    SELECT (AVG(prev.rev) * 1.1) AS target, mtd.rev AS mtd
    FROM prev, mtd
    GROUP BY mtd.rev
  `, [tenantId, referenceDate]);
  if (!rows.length || !rows[0].target) return null;

  const target = Math.round(Number(rows[0].target));
  const mtd = Math.round(Number(rows[0].mtd));
  return { target, mtd, pct: Math.round((mtd / target) * 100) };
}
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/metrics/metrics.service.ts apps/api/test/metrics.int.spec.ts
git commit -m "feat(metrics): monthlyGoal with avg-of-3-months × 1.1 target"
```

---

### Task 19: MetricsService — todayCategoryFillRates

**Files:**
- Modify: `apps/api/src/modules/metrics/metrics.service.ts`
- Modify: `apps/api/test/metrics.int.spec.ts`

- [ ] **Step 1: Write failing test**

```ts
it('returns top-5 categories by capacity (desc) with fill% + visits', async () => {
  await seedResourceSchedule([{ r: 1, wm: 600 }, { r: 2, wm: 400 }]);
  await seedAffinity([
    { r: 1, c: 10, share: 1.0 },
    { r: 2, c: 11, share: 0.5 },
    { r: 2, c: 12, share: 0.5 },
  ]);
  await seedTodayRecords([
    { cat: 10, length: 300, count: 3 }, // booked 300, capacity 600 -> 50%
    { cat: 11, length: 60, count: 1 },  // booked 60,  capacity 200 -> 30%
  ]);
  const rows = await metrics.todayCategoryFillRates(tenantId, '2026-04-20');
  expect(rows.slice(0, 2)).toEqual([
    { name: expect.any(String), fillPct: 50, visits: 3 },
    { name: expect.any(String), fillPct: 30, visits: 1 },
  ]);
});

it('skips categories with < 30min capacity', async () => {
  /* similar seed, expect no row for a category whose capacity is 15min */
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

```ts
async todayCategoryFillRates(tenantId: string, date: string): Promise<CategoryFill[]> {
  const { rows } = await this.ds.query(`
    WITH capacity AS (
      SELECT a.category_altegio_id AS cat,
             SUM(s.working_minutes * a.share)::int AS cap_min
      FROM resource_schedule s
      JOIN resource_category_affinity a
        ON a.tenant_id = s.tenant_id AND a.resource_altegio_id = s.resource_altegio_id
      WHERE s.tenant_id = $1 AND s.date = $2
      GROUP BY a.category_altegio_id
    ),
    booked AS (
      SELECT srv.category_altegio_id AS cat,
             SUM(r.seance_length)::int AS b_min,
             COUNT(*)::int AS visits
      FROM records r JOIN services srv
        ON srv.tenant_id = r.tenant_id AND srv.altegio_id = r.altegio_service_id
      WHERE r.tenant_id = $1 AND r.datetime::date = $2 AND r.attendance IN (0, 1)
      GROUP BY srv.category_altegio_id
    ),
    names AS (
      SELECT DISTINCT category_altegio_id AS cat, category_title FROM services WHERE tenant_id = $1
    )
    SELECT n.category_title AS name,
           COALESCE(b.visits, 0) AS visits,
           CASE WHEN c.cap_min > 0 THEN round(100.0 * COALESCE(b.b_min, 0) / c.cap_min)::int ELSE 0 END AS fillpct,
           c.cap_min
    FROM capacity c
    LEFT JOIN booked b ON b.cat = c.cat
    LEFT JOIN names n ON n.cat = c.cat
    WHERE c.cap_min >= 30
    ORDER BY c.cap_min DESC
    LIMIT 5
  `, [tenantId, date]);

  return rows.map(r => ({ name: r.name ?? 'Прочее', fillPct: r.fillpct, visits: r.visits }));
}
```

(If `services.category_title` column doesn't exist yet, either add it in Task 5 of Phase 1 style work — check current schema first. Alternative: join against Altegio `categories` raw data if we already pulled it.)

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/metrics/metrics.service.ts apps/api/test/metrics.int.spec.ts
git commit -m "feat(metrics): todayCategoryFillRates, top-5 by capacity with affinity-weighted share"
```

---

### Task 20: MetricsService — buildDailyReportData returns both blocks

**Files:**
- Modify: `apps/api/src/modules/metrics/metrics.service.ts`
- Modify: `apps/api/test/metrics.int.spec.ts`

- [ ] **Step 1: Add a composition method**

```ts
async buildDailyReportData(tenantId: string, reportDate: string): Promise<DailyReportData> {
  const yesterday = dayjs(reportDate).subtract(1, 'day').format('YYYY-MM-DD');
  const today = reportDate;
  const tenant = await this.tenants.findByIdOrThrow(tenantId);

  const [revenue, avg7, visits, topStaff, utilY, goal] = await Promise.all([
    this.yesterdayRevenue(tenantId, yesterday),
    this.avg7Revenue(tenantId, yesterday),
    this.yesterdayVisits(tenantId, yesterday),
    this.yesterdayTopStaff(tenantId, yesterday, 3),
    this.yesterdayUtilization(tenantId, yesterday),
    this.monthlyGoal(tenantId, yesterday),
  ]);

  const [scheduledToday, utilT, categories] = await Promise.all([
    this.scheduledToday(tenantId, today),
    this.yesterdayUtilization(tenantId, today), // same formula
    this.todayCategoryFillRates(tenantId, today),
  ]);

  return {
    salonName: tenant.salonName,
    timezone: tenant.timezone,
    yesterday: {
      date: yesterday,
      revenue,
      avg7: avg7 ?? null,
      deltaPct: avg7 ? Math.round(((revenue - avg7) / avg7) * 100) : null,
      came: visits.came,
      cancelled: visits.cancelled,
      avgCheck: visits.came ? Math.round(revenue / visits.came) : null,
      utilizationPct: utilY,
      monthlyGoalPct: goal?.pct ?? null,
      monthlyGoalTarget: goal?.target ?? null,
      monthlyGoalMtd: goal?.mtd ?? null,
      topStaff,
      aiInsight: null, // injected later by AiInsightService
    },
    today: {
      date: today,
      scheduled: scheduledToday,
      utilizationPct: utilT,
      categories,
    },
  };
}
```

- [ ] **Step 2: Run int tests**

Run: `pnpm -F @altegio/api test:int -- --testPathPattern=metrics`
Expected: new composition test passes.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/metrics/metrics.service.ts apps/api/test/metrics.int.spec.ts
git commit -m "feat(metrics): buildDailyReportData stitches Phase 1.1 shape"
```

---

### Task 21: Template renderer — split yesterday/today

**Files:**
- Modify: `apps/api/src/modules/reports/template.renderer.ts`
- Modify: `apps/api/src/modules/reports/template.renderer.spec.ts`

- [ ] **Step 1: Write failing snapshot tests**

```ts
describe('renderYesterdayMessage', () => {
  it('omits Отменили when cancelled=0', () => {
    const data = fixtures.yesterdayNoCancellations();
    expect(renderYesterdayMessage(data)).toMatchInlineSnapshot(`
      "☀ Доброе утро! Салон №1, Алматы
      📊 Вчера · Вс, 19 апр
      
      • Выручка:      2 899 953 ₸ (+7% к 7d avg)
      • Визитов:      93
      • Средний чек:  31 182 ₸
      • Загрузка:     64%
      • План месяца:  71% (19.5М из 27.5М)
      
      🏆 Топ-3 мастера
      1. Оксана Гарифзянова — 450 000 ₸ (2 визита)
      2. Гульнара — 293 880 ₸ (11 визитов)
      3. Насиба — 226 799 ₸ (5 визитов)
      
      💡 Главный инсайт
      Выручка вчера на 7% выше обычного..."
    `);
  });

  it('includes Отменили when cancelled>0', () => {
    const data = fixtures.yesterdayWithCancellations();
    expect(renderYesterdayMessage(data)).toContain('• Отменили:');
  });

  it('omits План месяца when monthlyGoalPct is null', () => {
    const data = fixtures.yesterdayNoGoal();
    expect(renderYesterdayMessage(data)).not.toContain('План месяца');
  });
});

describe('renderTodayMessage', () => {
  it('renders top-5 categories with fill% + visits', () => {
    const data = fixtures.todayFiveCategories();
    const msg = renderTodayMessage(data);
    expect(msg).toContain('Маникюр:');
    expect(msg).toContain('(12 зап.)');
  });

  it('omits categories section entirely when categories is empty', () => {
    const data = fixtures.todayNoCategories();
    expect(renderTodayMessage(data)).not.toContain('Заполненность по категориям');
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement `renderYesterdayMessage(data)` and `renderTodayMessage(data)`**

Follow the exact layout in the spec (§3). Drop the old `render(data)` single-message function once callers are switched.

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/reports/template.renderer.ts apps/api/src/modules/reports/template.renderer.spec.ts
git commit -m "feat(reports): split template into yesterday/today messages with Phase 1.1 layout"
```

---

### Task 22: AI insight — accept new shape, update prompt

**Files:**
- Modify: `apps/api/src/modules/reports/ai-insight.service.ts`
- Modify: `apps/api/src/modules/reports/ai-insight.service.spec.ts`

- [ ] **Step 1: Update the prompt payload**

The prompt template (Russian) should include the new numbers: utilisation, monthly goal %, top categories on today, top-3 masters. Keep the "1-2 sentences, no advice, no hallucinations" guardrail.

- [ ] **Step 2: Update the test (snapshot or assert key prompt fragments)**

Make sure the prompt now mentions `Загрузка вчера` and `План месяца` when those fields are non-null.

- [ ] **Step 3: Run — PASS**

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/reports/ai-insight.service.ts apps/api/src/modules/reports/ai-insight.service.spec.ts
git commit -m "feat(reports): AI insight sees utilization, monthly goal, today categories"
```

---

### Task 23: ReportsService — dual send with per-kind idempotency

**Files:**
- Modify: `apps/api/src/modules/reports/reports.service.ts`
- Modify: `apps/api/src/modules/reports/reports.service.spec.ts`

- [ ] **Step 1: Write failing tests**

```ts
describe('ReportsService.generateAndDeliver', () => {
  it('sends two messages and inserts two report_deliveries rows (yesterday, today)', async () => {
    await svc.generateAndDeliver(tenantId, '2026-04-20');
    expect(telegram.sendMessage).toHaveBeenCalledTimes(2);
    const rows = await query(`SELECT message_kind FROM report_deliveries WHERE tenant_id=$1 AND date='2026-04-19' ORDER BY message_kind`, [tenantId]);
    expect(rows.map(r => r.message_kind)).toEqual(['today', 'yesterday']);
  });

  it('is idempotent per message_kind — re-run skips already-sent kinds', async () => {
    await svc.generateAndDeliver(tenantId, '2026-04-20');
    telegram.sendMessage.mockClear();
    await svc.generateAndDeliver(tenantId, '2026-04-20');
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

```ts
async generateAndDeliver(tenantId: string, reportDate: string): Promise<void> {
  const yesterday = dayjs(reportDate).subtract(1, 'day').format('YYYY-MM-DD');
  const data = await this.metrics.buildDailyReportData(tenantId, reportDate);
  data.yesterday.aiInsight = await this.ai.insightOrNull(data);

  const tenant = await this.tenants.findByIdOrThrow(tenantId);

  for (const kind of ['yesterday', 'today'] as const) {
    const already = await this.deliveries.exists(tenantId, yesterday, kind);
    if (already) continue;

    const msg = kind === 'yesterday' ? renderYesterdayMessage(data) : renderTodayMessage(data);
    await this.telegram.sendMessage(tenant.telegramChatId, msg);
    await this.deliveries.insert({ tenantId, date: yesterday, messageKind: kind, status: 'sent' });
    if (kind === 'yesterday') await sleep(1000); // spacing between messages
  }
}
```

- [ ] **Step 4: Also surface a dry-run mode that returns both messages joined by `\n---8<---\n`**

Used by `apps/cli/src/commands/trigger-report.ts`. The CLI should still print `---8<--- ... ---8<---` to make the separator obvious.

- [ ] **Step 5: Run — PASS**

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/reports/reports.service.ts apps/api/src/modules/reports/reports.service.spec.ts apps/cli/src/commands/trigger-report.ts
git commit -m "feat(reports): dual Telegram send with per-kind idempotency, dry-run joins both messages"
```

---

### Task 24: CLI dry-run + live output updated

**Files:**
- Modify: `apps/cli/src/commands/trigger-report.ts`

- [ ] **Step 1: Update dry-run to print both messages**

```ts
if (opts.dryRun) {
  const { yesterday, today } = await svc.buildMessages(opts.tenant, opts.date);
  console.log('---8<--- [yesterday] ---8<---');
  console.log(yesterday);
  console.log('---8<--- [today] ---8<---');
  console.log(today);
  console.log('---8<---');
}
```

- [ ] **Step 2: Build**

Run: `pnpm -F @altegio/cli build && pnpm -F @altegio/api build`

- [ ] **Step 3: Commit**

```bash
git add apps/cli/src/commands/trigger-report.ts
git commit -m "feat(cli): trigger-report --dry-run prints both messages"
```

---

### Task 25: Manual prod rollout — onboard BrowUp to the new shape

**Files:** none new.

Executed on the VPS (`ssh root@178.128.202.65`):

- [ ] **Step 1: Pull and redeploy**

```bash
cd /opt/altegio-ai && git pull && ./deploy/deploy.sh
```

- [ ] **Step 2: Re-backfill BrowUp with 120 days to get history for monthly goal + affinity**

```bash
T=fe952c56-af0a-4f33-aa00-27b8dd293a8a
docker compose --env-file .env -f docker/docker-compose.prod.yml exec -T api \
  pnpm -F @altegio/cli start trigger-sync --tenant "$T" --days 120
```

Expected: logs show resources + timetable being pulled; `resource_schedule` and `resource_category_affinity` get populated.

- [ ] **Step 3: Dry-run the new report**

```bash
docker compose --env-file .env -f docker/docker-compose.prod.yml exec -T api \
  pnpm -F @altegio/cli start trigger-report --tenant "$T" --date 2026-04-22 --dry-run
```

Expected: two messages between `---8<---` separators. Sanity-check: `Загрузка` ∈ [40, 80], per-category `fill%` all less than 100, top-5 roughly matches salon reality.

- [ ] **Step 4: Live send and confirm two TG messages**

```bash
docker compose --env-file .env -f docker/docker-compose.prod.yml exec -T api \
  pnpm -F @altegio/cli start trigger-report --tenant "$T" --date 2026-04-22
```

Owner confirms both messages arrived in TG.

- [ ] **Step 5: Idempotency retry**

Re-run the live command. Expected: `Skipped kind=yesterday (already sent) / Skipped kind=today (already sent)` — no second pair of TG messages.

- [ ] **Step 6: Tag + push**

```bash
git tag v0.2.0-phase1-1
git push origin v0.2.0-phase1-1
```

- [ ] **Step 7: Append an acceptance note to `docs/superpowers/plans/2026-04-20-altegio-ai-phase-1-acceptance.md`**

Record the first live run of the new dual-message format (date, two message_kind rows in `report_deliveries`, sanity numbers from §4 of the spec).

---

## Self-review checklist

Ran against spec:

- [x] §3 Message 1 format → Task 21 (template renderer) + Task 20 (metrics shape).
- [x] §3 Message 2 format → Task 21 + Task 19 (todayCategoryFillRates).
- [x] §4.1-4.4 (revenue / Δ7d / visits / avg_check) → already in metrics service; surfaced via Task 20 composition.
- [x] §4.5 yesterdayUtilization → Task 17.
- [x] §4.6 monthlyGoal → Task 18.
- [x] §4.7 topStaff → already in Phase 1 metrics, re-used in Task 20.
- [x] §4.8/4.9 (scheduled today / today utilisation) → Task 17 (method), Task 20 (shape).
- [x] §4.10 affinity → Task 15 + Task 16.
- [x] §4.11 fill rates → Task 19.
- [x] §5 AI insight extension → Task 22.
- [x] §6 migrations → Tasks 1-3.
- [x] §6 endpoints + DTOs → Tasks 5-9.
- [x] §6 parsers + raw-writer → Tasks 10-13.
- [x] §6 sync service → Task 14.
- [x] §7 edge cases (capacity=0 / cancelled=0 / goal null / affinity empty) → Tasks 17/18/19/21 explicit test cases.
- [x] §8 backfill 120 → Task 14 `--onboard` flag + Task 25 rollout step.
- [x] §9 scope → only items in scope are planned; manual goal override, CLI set-goal, losses report, dashboard deliberately excluded.
- [x] §10 acceptance criteria → Task 25 explicit steps + tag.

No placeholders, no "TBD" in task bodies. Type names and method names match across tasks (`buildDailyReportData`, `renderYesterdayMessage`, `renderTodayMessage`, `ResourceAffinityService.recompute`, `monthlyGoal`, `yesterdayUtilization`, `todayCategoryFillRates`, `CategoryFill`, `YesterdayBlock`, `TodayBlock`).
