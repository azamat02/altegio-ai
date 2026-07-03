# TMA v2c — Clients Sync Fix + Fetch-Race Guards + Idle Calibration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the client sync so `visits_count`/`last_visit_date`/`spent` are populated (switch to Altegio `POST /company/{id}/clients/search`, sync ALL pages), add stale-response guards to all TMA screen fetches, make the idle-loss calculation use a configurable target utilization (default 80%), and clear the v2b cosmetic follow-ups.

**Architecture:** Backend: new `post()` on `AltegioClient`, `ClientsEndpoint` rewritten around the search endpoint (paginated generator), `SyncService` consumes all pages with a batched multi-row upsert. Idle calibration: new `tenants.target_utilization_pct` column (default 80) flows `TenantEntity → TmaService.losses → composeLosses`, surfaced in `TmaLosses.idle` and the Losses screen copy, settable via a new CLI command. Frontend: uniform `stale` flag guard in every data-fetching `useEffect`, tested with jsdom container tests.

**Tech Stack:** NestJS + TypeORM + PostgreSQL (jest unit / testcontainers int), React 18 + Vite + vitest (TMA), commander CLI, pnpm workspace.

## Global Constraints

- **NEVER run `git add -A` or `git add .`** — stage only the files you created/modified, by exact path.
- **No `Co-Authored-By`** or any mention of Claude in commit messages.
- UI copy is Russian; keep the existing tone (short, no exclamation marks in metrics contexts).
- Unit tests (api): `pnpm --filter @altegio/api test -- --testPathPattern=<name>`. Integration tests: `pnpm --filter @altegio/api test:int -- --testPathPattern=<name>` — **requires Docker** (testcontainers). If Docker is unavailable in your sandbox, report DONE_WITH_CONCERNS and say exactly which commands you could not run — the controller re-runs them. Never claim a test passed that you didn't run.
- TMA tests: `pnpm --filter @altegio/tma test`.
- Do not modify `.superpowers/sdd/` ledger files — the controller owns them.
- Do not start the Telegram bot locally (409 conflict with prod polling).
- Altegio API verified live facts (2026-07-03): `POST /company/{id}/clients/search` body `{"page":N,"page_size":200,"fields":[...]}` returns `{"success":true,"data":[...],"meta":{"total_count":27927}}`. Money field is **`sold_amount`** (the `spent`/`paid`/`balance` names silently return nothing). `last_visit_date` is `"YYYY-MM-DD HH:MM:SS"` or `""` (empty string) when no visits. `visits_count` is a plain int. Rate limits: 200 req/min, 5 req/sec (client limiter already set to 3 rps).

---

### Task 1: `AltegioClient.post()` + search-based `ClientsEndpoint`

**Files:**
- Modify: `apps/api/src/modules/altegio/altegio.client.ts`
- Modify: `apps/api/src/modules/altegio/dto/client.dto.ts`
- Modify: `apps/api/src/modules/altegio/endpoints/clients.ts`
- Test (create): `apps/api/src/modules/altegio/endpoints/clients.spec.ts`

**Interfaces:**
- Consumes: existing `AltegioClient.get`, `buildAuthHeader`, `AltegioAuthContext`.
- Produces: `AltegioClient.post<T>(auth, path, body)`; `ClientsEndpoint.searchPage(auth, page?, pageSize?): Promise<{ clients: AltegioClientDto[]; totalCount: number }>`; `ClientsEndpoint.fetchAll(auth): AsyncGenerator<AltegioClientDto[]>` now backed by the search endpoint; `AltegioClientDto.sold_amount?: number`. **Keep the old `fetchPage` method in this task** — `sync.service.ts` still calls it; Task 2 deletes it.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/altegio/endpoints/clients.spec.ts`:

```ts
import { ClientsEndpoint } from './clients';
import type { AltegioAuthContext } from '../types';

const auth: AltegioAuthContext = { partnerToken: 'p', userToken: 'u', locationId: 198823 };

function makeClient(pages: Array<any[]>, totalCount: number) {
  let call = 0;
  const post = jest.fn(async () => ({
    success: true,
    data: pages[call++] ?? [],
    meta: { total_count: totalCount },
  }));
  return { post, client: { post } as any };
}

describe('ClientsEndpoint (search API)', () => {
  it('searchPage POSTs to the search endpoint with page, page_size and fields', async () => {
    const { post, client } = makeClient([[{ id: 1 }]], 1);
    const ep = new ClientsEndpoint(client);
    const res = await ep.searchPage(auth, 2, 100);
    expect(post).toHaveBeenCalledWith(auth, '/company/198823/clients/search', {
      page: 2,
      page_size: 100,
      fields: ['id', 'name', 'phone', 'email', 'visits_count', 'last_visit_date', 'sold_amount'],
    });
    expect(res).toEqual({ clients: [{ id: 1 }], totalCount: 1 });
  });

  it('fetchAll pages until a short page and yields each batch', async () => {
    const page1 = Array.from({ length: 200 }, (_, i) => ({ id: i + 1 }));
    const page2 = [{ id: 201 }];
    const { post, client } = makeClient([page1, page2], 201);
    const ep = new ClientsEndpoint(client);
    const batches: any[][] = [];
    for await (const b of ep.fetchAll(auth)) batches.push(b);
    expect(batches.length).toBe(2);
    expect(batches[0].length).toBe(200);
    expect(batches[1]).toEqual(page2);
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('fetchAll stops immediately on an empty first page', async () => {
    const { post, client } = makeClient([[]], 0);
    const ep = new ClientsEndpoint(client);
    const batches: any[][] = [];
    for await (const b of ep.fetchAll(auth)) batches.push(b);
    expect(batches).toEqual([]);
    expect(post).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @altegio/api test -- --testPathPattern=endpoints/clients`
Expected: FAIL — `searchPage` does not exist / `post` is not a function.

- [ ] **Step 3: Add `post()` to AltegioClient**

In `apps/api/src/modules/altegio/altegio.client.ts`, after the existing `get<T>` method (line 59), add:

```ts
  async post<T>(
    auth: AltegioAuthContext,
    path: string,
    body: Record<string, unknown> = {},
  ): Promise<T> {
    const cfg: AxiosRequestConfig = {
      url: path,
      method: 'POST',
      data: body,
      headers: { Authorization: buildAuthHeader(auth), 'Content-Type': 'application/json' },
    };
    const res = await this.limiter.schedule(() => this.http.request<T>(cfg));
    return res.data;
  }
```

- [ ] **Step 4: Extend the DTO**

`apps/api/src/modules/altegio/dto/client.dto.ts` — add `sold_amount` (the search endpoint's money field):

```ts
export interface AltegioClientDto {
  id: number;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  visits_count?: number;
  last_visit_date?: string | null;
  spent?: number;
  sold_amount?: number;
  paid?: number;
  balance?: number;
}
```

- [ ] **Step 5: Rewrite ClientsEndpoint around the search endpoint**

Replace the body of `apps/api/src/modules/altegio/endpoints/clients.ts` with:

```ts
import { Injectable } from '@nestjs/common';
import { AltegioClient } from '../altegio.client';
import { AltegioAuthContext } from '../types';
import { AltegioClientDto } from '../dto/client.dto';

// Fields the search endpoint returns on request. NB: the money field is
// `sold_amount` — `spent`/`paid`/`balance` are silently ignored by this endpoint.
const SEARCH_FIELDS = ['id', 'name', 'phone', 'email', 'visits_count', 'last_visit_date', 'sold_amount'];

const PAGE_SIZE = 200;

@Injectable()
export class ClientsEndpoint {
  constructor(private readonly client: AltegioClient) {}

  /** @deprecated list endpoint returns no visit fields; removed once sync switches to fetchAll */
  async fetchPage(auth: AltegioAuthContext, page = 1, count = 200): Promise<AltegioClientDto[]> {
    type Resp = { success: boolean; data: AltegioClientDto[] };
    const res = await this.client.get<Resp>(auth, `/clients/${auth.locationId}`, { page, count });
    return res.data ?? [];
  }

  async searchPage(
    auth: AltegioAuthContext,
    page = 1,
    pageSize = PAGE_SIZE,
  ): Promise<{ clients: AltegioClientDto[]; totalCount: number }> {
    type Resp = { success: boolean; data: AltegioClientDto[]; meta?: { total_count?: number } };
    const res = await this.client.post<Resp>(auth, `/company/${auth.locationId}/clients/search`, {
      page,
      page_size: pageSize,
      fields: SEARCH_FIELDS,
    });
    return { clients: res.data ?? [], totalCount: res.meta?.total_count ?? 0 };
  }

  async *fetchAll(auth: AltegioAuthContext): AsyncGenerator<AltegioClientDto[]> {
    let page = 1;
    while (true) {
      const { clients } = await this.searchPage(auth, page);
      if (clients.length === 0) return;
      yield clients;
      if (clients.length < PAGE_SIZE) return;
      page++;
    }
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @altegio/api test -- --testPathPattern=endpoints/clients`
Expected: PASS (3 tests).

- [ ] **Step 7: Run the full unit suite (regressions)**

Run: `pnpm --filter @altegio/api test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/altegio/altegio.client.ts apps/api/src/modules/altegio/dto/client.dto.ts apps/api/src/modules/altegio/endpoints/clients.ts apps/api/src/modules/altegio/endpoints/clients.spec.ts
git commit -m "feat(altegio): clients search endpoint with full pagination"
```

---

### Task 2: Parser normalization + full-sweep client sync + batched upsert

**Files:**
- Modify: `apps/api/src/modules/sync/parsers/clients.parser.ts`
- Modify: `apps/api/src/modules/sync/sync.service.ts:86-89` (clients step) and `sync.service.ts:212-227` (`upsertClients`)
- Modify: `apps/api/src/modules/altegio/endpoints/clients.ts` (delete deprecated `fetchPage`)
- Create: `apps/api/src/modules/sync/parsers/clients.parser.spec.ts`
- Modify: `apps/api/test/sync.int.spec.ts:49` (mock) + new assertion test
- Create: `apps/api/test/fixtures/altegio/clients-search-sample.json`

**Interfaces:**
- Consumes: `ClientsEndpoint.fetchAll(auth): AsyncGenerator<AltegioClientDto[]>` (Task 1), `AltegioClientDto.sold_amount`, existing `RawWriterService.writeClients`.
- Produces: `ClientsParser.toRow` maps `spent = sold_amount ?? spent ?? null` and normalizes `last_visit_date` to `YYYY-MM-DD` or `null`. `SyncService` step 3 iterates all pages. `upsertClients` batches one multi-row `INSERT ... ON CONFLICT` per page.

- [ ] **Step 1: Write the failing parser test**

Create `apps/api/src/modules/sync/parsers/clients.parser.spec.ts`:

```ts
import { ClientsParser } from './clients.parser';

const p = new ClientsParser();
const T = 'tenant-1';

describe('ClientsParser (search endpoint shape)', () => {
  it('maps sold_amount to spent and trims datetime to a date', () => {
    const row = p.toRow(T, {
      id: 31396661,
      name: 'Зарина',
      phone: '+77019859510',
      visits_count: 648,
      last_visit_date: '2026-06-13 12:00:00',
      sold_amount: 15636614.02,
    });
    expect(row).toEqual({
      tenantId: T,
      altegioClientId: 31396661,
      name: 'Зарина',
      phone: '+77019859510',
      visitsCount: 648,
      lastVisitDate: '2026-06-13',
      spent: 15636614.02,
    });
  });

  it('normalizes empty-string last_visit_date to null', () => {
    const row = p.toRow(T, { id: 1, visits_count: 0, last_visit_date: '', sold_amount: 0 });
    expect(row.lastVisitDate).toBeNull();
    expect(row.visitsCount).toBe(0);
    expect(row.spent).toBe(0);
  });

  it('normalizes zero-dates and garbage to null', () => {
    expect(p.toRow(T, { id: 1, last_visit_date: '0000-00-00 00:00:00' }).lastVisitDate).toBeNull();
    expect(p.toRow(T, { id: 1, last_visit_date: 'not-a-date' }).lastVisitDate).toBeNull();
  });

  it('falls back to spent when sold_amount is absent (legacy raw payloads)', () => {
    expect(p.toRow(T, { id: 1, spent: 500 }).spent).toBe(500);
    expect(p.toRow(T, { id: 1 }).spent).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @altegio/api test -- --testPathPattern=clients.parser`
Expected: FAIL — `lastVisitDate` keeps the raw string, `spent` ignores `sold_amount`.

- [ ] **Step 3: Update the parser**

Replace the class body in `apps/api/src/modules/sync/parsers/clients.parser.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { AltegioClientDto } from '../../altegio/dto/client.dto';

export interface ClientRow {
  tenantId: string;
  altegioClientId: number;
  name: string | null;
  phone: string | null;
  visitsCount: number | null;
  lastVisitDate: string | null;
  spent: number | null;
}

@Injectable()
export class ClientsParser {
  toRow(tenantId: string, dto: AltegioClientDto): ClientRow {
    return {
      tenantId,
      altegioClientId: dto.id,
      name: dto.name ?? null,
      phone: dto.phone ?? null,
      visitsCount: dto.visits_count ?? null,
      lastVisitDate: this.normalizeDate(dto.last_visit_date),
      spent: dto.sold_amount ?? dto.spent ?? null,
    };
  }

  // Search endpoint sends "YYYY-MM-DD HH:MM:SS", "" when the client never visited,
  // and occasionally zero-dates. The clients column is a plain `date`.
  private normalizeDate(v: string | null | undefined): string | null {
    if (!v) return null;
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(v);
    if (!m || m[1] === '0000-00-00') return null;
    return m[1];
  }
}
```

- [ ] **Step 4: Run parser test to verify it passes**

Run: `pnpm --filter @altegio/api test -- --testPathPattern=clients.parser`
Expected: PASS (4 tests).

- [ ] **Step 5: Switch sync to the full sweep + batched upsert**

In `apps/api/src/modules/sync/sync.service.ts` replace the clients step (lines 86-89):

```ts
      // 3) Clients — full sweep via the search endpoint (the only source of
      // visits_count / last_visit_date / sold_amount)
      for await (const batch of this.cliEp.fetchAll(auth)) {
        await this.rawWriter.writeClients(tenantId, batch);
        await this.upsertClients(tenantId, batch.map((c) => this.cliParser.toRow(tenantId, c)));
      }
```

Replace `upsertClients` (lines 212-227) with a multi-row VALUES version (same style as `upsertRecords`):

```ts
  private async upsertClients(tenantId: string, rows: ClientRow[]): Promise<void> {
    if (rows.length === 0) return;
    const COLS = 7;
    const values = rows
      .map((_, i) => {
        const base = i * COLS;
        return `(${Array.from({ length: COLS }, (__, j) => `$${base + j + 1}`).join(', ')})`;
      })
      .join(', ');
    const params = rows.flatMap((r) => [
      tenantId, r.altegioClientId, r.name, r.phone, r.visitsCount, r.lastVisitDate, r.spent,
    ]);
    await this.ds.query(
      `
      INSERT INTO clients (tenant_id, altegio_client_id, name, phone, visits_count, last_visit_date, spent)
      VALUES ${values}
      ON CONFLICT (tenant_id, altegio_client_id) DO UPDATE SET
        name = EXCLUDED.name, phone = EXCLUDED.phone,
        visits_count = EXCLUDED.visits_count, last_visit_date = EXCLUDED.last_visit_date,
        spent = EXCLUDED.spent, updated_at = now()
      `,
      params,
    );
  }
```

- [ ] **Step 6: Delete the deprecated `fetchPage`**

In `apps/api/src/modules/altegio/endpoints/clients.ts` remove the `fetchPage` method and its `@deprecated` comment (nothing calls it anymore — verify with `grep -rn "fetchPage" apps/`, expect only `searchPage` matches or none).

- [ ] **Step 7: Create the search-shaped fixture**

Create `apps/api/test/fixtures/altegio/clients-search-sample.json`:

```json
[
  {
    "id": 31396661,
    "name": "Зарина",
    "phone": "+77019859510",
    "email": "",
    "visits_count": 648,
    "last_visit_date": "2026-06-13 12:00:00",
    "sold_amount": 15636614.02
  },
  {
    "id": 31392404,
    "name": "Сабина",
    "phone": "+72222222222",
    "email": "",
    "visits_count": 0,
    "last_visit_date": "",
    "sold_amount": 0
  },
  {
    "id": 31392405,
    "name": "Сабыргуль",
    "phone": "+77017115066",
    "email": "",
    "visits_count": 12,
    "last_visit_date": "2026-05-02 10:30:00",
    "sold_amount": 264000
  }
]
```

- [ ] **Step 8: Update the sync integration spec**

In `apps/api/test/sync.int.spec.ts`:

Line 45 — load the new fixture instead of the old list-endpoint one:

```ts
    const cliFix = JSON.parse(readFileSync(join(__dirname, 'fixtures/altegio/clients-search-sample.json'), 'utf8'));
```

Line 49 — the mock becomes a generator (search sweep):

```ts
    const cliEp = { fetchAll: async function* () { yield cliFix; } } as any;
```

Add a new test after the idempotency test (after line 87):

```ts
  it('persists visit fields from the clients search sweep', async () => {
    const t = await tenants.create({ salonName: 'ClientsSweep', locationId: 199003, altegioToken: 'y', timezone: 'Asia/Almaty' });
    await svc.syncTenant(t.id);

    const rows = await db.ds.query(
      `SELECT altegio_client_id, visits_count, last_visit_date::text AS lvd, spent
       FROM clients WHERE tenant_id = $1 ORDER BY altegio_client_id`,
      [t.id],
    );
    expect(rows.length).toBe(3);
    const zarina = rows.find((r: any) => Number(r.altegio_client_id) === 31396661);
    expect(zarina.visits_count).toBe(648);
    expect(zarina.lvd).toBe('2026-06-13');
    expect(Number(zarina.spent)).toBeCloseTo(15636614.02);
    const noVisits = rows.find((r: any) => Number(r.altegio_client_id) === 31392404);
    expect(noVisits.visits_count).toBe(0);
    expect(noVisits.lvd).toBeNull();
  });
```

- [ ] **Step 9: Run unit + integration tests**

Run: `pnpm --filter @altegio/api test`
Expected: PASS.
Run: `pnpm --filter @altegio/api test:int -- --testPathPattern=sync`
Expected: PASS (requires Docker — if unavailable, report DONE_WITH_CONCERNS naming this exact command).

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/modules/sync/parsers/clients.parser.ts apps/api/src/modules/sync/parsers/clients.parser.spec.ts apps/api/src/modules/sync/sync.service.ts apps/api/src/modules/altegio/endpoints/clients.ts apps/api/test/sync.int.spec.ts apps/api/test/fixtures/altegio/clients-search-sample.json
git commit -m "feat(sync): full client sweep via search endpoint with visit fields"
```

---

### Task 3: Configurable idle target utilization (default 80%)

**Files:**
- Create: `apps/api/src/db/migrations/1700000017000-AddTenantTargetUtilization.ts`
- Modify: `apps/api/src/modules/tenants/tenant.entity.ts`
- Modify: `apps/api/src/modules/tenants/tenants.service.ts`
- Modify: `apps/api/src/modules/tma/losses.ts`
- Modify: `apps/api/src/modules/tma/losses.spec.ts`
- Modify: `apps/api/src/modules/tma/tma.service.ts:93-98`
- Modify: `packages/shared/src/types/tma.ts:60`
- Modify: `apps/tma/src/screens/Losses.tsx:26`
- Modify: `apps/tma/src/screens/losses.test.tsx` (fixture gets the new field)
- Create: `apps/cli/src/commands/set-target-utilization.ts`
- Modify: `apps/cli/src/main.ts`
- Modify: `apps/api/test/tma.int.spec.ts` (losses test asserts the default)

**Interfaces:**
- Consumes: `composeLosses(i, periodDays)` (existing), `TenantsService.findById`, CLI `bootstrapApp` pattern from `set-monthly-goal.ts`.
- Produces: `composeLosses(i: LossIngredients, periodDays: number, targetUtilizationPct = 80): TmaLosses`; `TmaLosses.idle` gains `targetUtilizationPct: number`; `TenantEntity.targetUtilizationPct: number`; `TenantsService.setTargetUtilization(tenantId: string, pct: number): Promise<void>`; CLI command `set-target-utilization --tenant <id> --pct <n>`.

- [ ] **Step 1: Write the failing composeLosses tests**

In `apps/api/src/modules/tma/losses.spec.ts`, replace the whole file (idle math changes: idle is now measured against `capacity × target%`, default 80):

```ts
import { composeLosses, type LossIngredients } from './losses';

const base: LossIngredients = {
  revenue: 3_000_000, visits: 100, cancelled: 10,
  noShowCount: 5, noShowLost: 120_000,
  bookedMin: 6_000, capacityMin: 12_000, // 100h booked / 200h capacity
  sleepingCount: 40, avgCheck: 30_000,
};

describe('composeLosses', () => {
  it('computes the four blocks and the annual total for a 30-day period (default 80% target)', () => {
    const l = composeLosses(base, 30);
    expect(l.periodDays).toBe(30);
    expect(l.cancellations).toEqual({ count: 10, period: 300_000, annual: 3_650_000 });
    expect(l.noShow).toEqual({ count: 5, period: 120_000, annual: 1_460_000 });
    // target minutes = 12_000 × 0.8 = 9_600; idle = (9_600 − 6_000)/60 = 60h
    // revenuePerHour = 3_000_000 / 100h = 30_000; idle = 60h × 30_000 = 1_800_000
    expect(l.idle).toEqual({ idleHours: 60, targetUtilizationPct: 80, period: 1_800_000, annual: 21_900_000 });
    // churn = 40 × 30_000 × 0.3 = 360_000
    expect(l.churn).toEqual({ sleepingCount: 40, returnRatePct: 30, period: 360_000, annual: 4_380_000 });
    expect(l.totalAnnual).toBe(3_650_000 + 1_460_000 + 21_900_000 + 4_380_000);
  });

  it('target 100% reproduces the raw free-hours model', () => {
    const l = composeLosses(base, 30, 100);
    expect(l.idle).toEqual({ idleHours: 100, targetUtilizationPct: 100, period: 3_000_000, annual: 36_500_000 });
  });

  it('idle is 0 when booking already meets the target', () => {
    // booked 10_000 min > target 9_600 min
    const l = composeLosses({ ...base, bookedMin: 10_000 }, 30);
    expect(l.idle.period).toBe(0);
    expect(l.idle.idleHours).toBe(0);
  });

  it('idle block is 0 when there is no booked time or no capacity', () => {
    expect(composeLosses({ ...base, bookedMin: 0 }, 30).idle.period).toBe(0);
    expect(composeLosses({ ...base, capacityMin: 0 }, 30).idle.period).toBe(0);
  });

  it('idle never negative when overbooked', () => {
    expect(composeLosses({ ...base, bookedMin: 20_000 }, 30).idle.period).toBe(0);
  });

  it('projects a 1-day period ×365', () => {
    expect(composeLosses(base, 1).cancellations.annual).toBe(300_000 * 365);
  });

  it('computes idle money from exact fractional hours (display hours rounded)', () => {
    // capacity 6_090 min, target 100% → target−booked = 90 min = 1.5h
    // revenuePerHour = 3_000_000/100h = 30_000
    const l = composeLosses({ ...base, capacityMin: 6_090 }, 30, 100);
    expect(l.idle.idleHours).toBe(2);   // display rounds 1.5 → 2
    expect(l.idle.period).toBe(45_000); // money uses exact 1.5 × 30_000
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @altegio/api test -- --testPathPattern=tma/losses`
Expected: FAIL — idle numbers still computed from 100% capacity, no `targetUtilizationPct` in the block.

- [ ] **Step 3: Update the shared type**

`packages/shared/src/types/tma.ts` line 60 — the idle block:

```ts
  idle: LossBlock & { idleHours: number; targetUtilizationPct: number };
```

- [ ] **Step 4: Update composeLosses**

In `apps/api/src/modules/tma/losses.ts`:

```ts
import type { TmaLosses } from '@altegio/shared';

export interface LossIngredients {
  revenue: number; visits: number; cancelled: number;
  noShowCount: number; noShowLost: number;
  bookedMin: number; capacityMin: number;
  sleepingCount: number; avgCheck: number;
}

export const CHURN_RETURN_RATE = 0.3;
export const DEFAULT_TARGET_UTILIZATION_PCT = 80;

export function composeLosses(
  i: LossIngredients,
  periodDays: number,
  targetUtilizationPct: number = DEFAULT_TARGET_UTILIZATION_PCT,
): TmaLosses {
  const annual = (period: number) => Math.round((period * 365) / periodDays);
  const block = (period: number) => ({ period: Math.round(period), annual: annual(period) });

  const cancellations = { count: i.cancelled, ...block(i.cancelled * i.avgCheck) };
  const noShow = { count: i.noShowCount, ...block(i.noShowLost) };

  // Idle is measured against a realistic target utilization, not 100% of capacity —
  // a fully-booked salon never exists, so raw free hours grossly overstate the loss.
  let idleHours = 0;
  let idlePeriod = 0;
  if (i.bookedMin > 0 && i.capacityMin > 0) {
    const targetMin = i.capacityMin * (targetUtilizationPct / 100);
    const exactIdleHours = Math.max(0, targetMin - i.bookedMin) / 60;
    idleHours = Math.round(exactIdleHours);
    const revenuePerHour = i.revenue / (i.bookedMin / 60);
    idlePeriod = exactIdleHours * revenuePerHour;
  }
  const idle = { idleHours, targetUtilizationPct, ...block(idlePeriod) };

  const churn = {
    sleepingCount: i.sleepingCount,
    returnRatePct: CHURN_RETURN_RATE * 100,
    ...block(i.sleepingCount * i.avgCheck * CHURN_RETURN_RATE),
  };

  return {
    periodDays,
    cancellations, noShow, idle, churn,
    totalAnnual: cancellations.annual + noShow.annual + idle.annual + churn.annual,
  };
}
```

- [ ] **Step 5: Run losses tests to verify they pass**

Run: `pnpm --filter @altegio/api test -- --testPathPattern=tma/losses`
Expected: PASS (7 tests).

- [ ] **Step 6: Migration + entity + service setter**

Create `apps/api/src/db/migrations/1700000017000-AddTenantTargetUtilization.ts` (migrations are glob-loaded from this directory — no registration file):

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantTargetUtilization1700000017000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE tenants ADD COLUMN target_utilization_pct int NOT NULL DEFAULT 80`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE tenants DROP COLUMN IF EXISTS target_utilization_pct`);
  }
}
```

In `apps/api/src/modules/tenants/tenant.entity.ts`, after the `monthlyGoal` column:

```ts
  @Column({ type: 'int', name: 'target_utilization_pct', default: 80 })
  targetUtilizationPct!: number;
```

In `apps/api/src/modules/tenants/tenants.service.ts`, after `setMonthlyGoal`:

```ts
  async setTargetUtilization(tenantId: string, pct: number): Promise<void> {
    await this.repo.update({ id: tenantId }, { targetUtilizationPct: pct });
  }
```

- [ ] **Step 7: Thread the tenant value through TmaService.losses**

Replace `losses` in `apps/api/src/modules/tma/tma.service.ts` (lines 93-98):

```ts
  async losses(tenantId: string, from: string, to: string): Promise<TmaLosses> {
    const t = await this.tenants.findById(tenantId);
    if (!t) throw new Error(`Tenant ${tenantId} not found`);
    const sleepingCutoff = this.subtractDays(this.todayInTz(t.timezone), 60);
    const ingredients: LossIngredients = await this.metrics.lossesData(tenantId, from, to, t.timezone, sleepingCutoff);
    return composeLosses(ingredients, inclusiveDays(from, to), t.targetUtilizationPct ?? DEFAULT_TARGET_UTILIZATION_PCT);
  }
```

Update the import on line 6:

```ts
import { composeLosses, DEFAULT_TARGET_UTILIZATION_PCT, type LossIngredients } from './losses';
```

- [ ] **Step 8: Update the Losses screen copy + its test fixture**

`apps/tma/src/screens/Losses.tsx` line 26:

```tsx
      <LossCard title="Простой" context={`${d.idle.idleHours} свободных часов до загрузки ${d.idle.targetUtilizationPct}%`} period={d.idle.period} annual={d.idle.annual} />
```

In `apps/tma/src/screens/losses.test.tsx`, line 11, the fixture's `idle` becomes:

```ts
  idle: { idleHours: 100, targetUtilizationPct: 80, period: 3000000, annual: 36500000 },
```

and inside the existing test add an assertion for the new copy:

```ts
    expect(html).toContain('до загрузки 80%');
```

- [ ] **Step 9: CLI command**

Create `apps/cli/src/commands/set-target-utilization.ts`:

```ts
import { Command } from 'commander';
import { bootstrapApp } from '../bootstrap';
import { TenantsService } from '../../../api/src/modules/tenants/tenants.service';

export function setTargetUtilizationCommand(): Command {
  return new Command('set-target-utilization')
    .description('Set the target utilization %% used by the idle-loss estimate (default 80)')
    .requiredOption('--tenant <id>', 'Tenant UUID')
    .requiredOption('--pct <n>', 'Target utilization percent (integer 1..100)', (v) => Number(v))
    .action(async (opts) => {
      if (!Number.isInteger(opts.pct) || opts.pct < 1 || opts.pct > 100) {
        console.error('Provide --pct as an integer between 1 and 100');
        process.exit(1);
      }
      const app = await bootstrapApp();
      const tenants = app.get(TenantsService);
      await tenants.setTargetUtilization(opts.tenant, opts.pct);
      console.log(`Set target_utilization_pct=${opts.pct}% for tenant ${opts.tenant}`);
      await app.close();
    });
}
```

In `apps/cli/src/main.ts` add the import and registration (same pattern as `setMonthlyGoalCommand`):

```ts
import { setTargetUtilizationCommand } from './commands/set-target-utilization';
// ...
program.addCommand(setTargetUtilizationCommand());
```

- [ ] **Step 10: Assert the default in the losses int test**

In `apps/api/test/tma.int.spec.ts`, inside the test `'losses returns four blocks and an annual total'` (line 129), add after the existing block assertions:

```ts
    expect(res.body.idle.targetUtilizationPct).toBe(80);
```

- [ ] **Step 11: Run all suites**

Run: `pnpm --filter @altegio/api test`
Expected: PASS.
Run: `pnpm --filter @altegio/tma test`
Expected: PASS.
Run: `pnpm --filter @altegio/api test:int -- --testPathPattern=tma`
Expected: PASS (Docker; if unavailable → DONE_WITH_CONCERNS naming the command).

- [ ] **Step 12: Commit**

```bash
git add apps/api/src/db/migrations/1700000017000-AddTenantTargetUtilization.ts apps/api/src/modules/tenants/tenant.entity.ts apps/api/src/modules/tenants/tenants.service.ts apps/api/src/modules/tma/losses.ts apps/api/src/modules/tma/losses.spec.ts apps/api/src/modules/tma/tma.service.ts packages/shared/src/types/tma.ts apps/tma/src/screens/Losses.tsx apps/tma/src/screens/losses.test.tsx apps/cli/src/commands/set-target-utilization.ts apps/cli/src/main.ts apps/api/test/tma.int.spec.ts
git commit -m "feat(losses): idle loss measured against configurable target utilization (default 80%)"
```

---

### Task 4: Fetch-race guards in all TMA screens + container tests

**Files:**
- Modify: `apps/tma/package.json` (devDeps), `apps/tma/vite.config.ts` (no change needed — per-file jsdom pragma)
- Modify: `apps/tma/src/App.tsx:17-27`
- Modify: `apps/tma/src/screens/Staff.tsx:51-56`
- Modify: `apps/tma/src/screens/Losses.tsx:37-41`
- Modify: `apps/tma/src/screens/Clients.tsx:46-49`
- Modify: `apps/tma/src/screens/StaffDetailScreen.tsx:45-49`
- Create: `apps/tma/src/screens/clients.container.test.tsx`

**Interfaces:**
- Consumes: existing `api.get`, screen state shapes (unchanged).
- Produces: every data-fetching `useEffect` follows one pattern — reset state, `stale` flag checked in `.then`/`.catch`, cleanup sets `stale = true`. No public API changes.

- [ ] **Step 1: Install test tooling**

Run: `pnpm --filter @altegio/tma add -D jsdom @testing-library/react @testing-library/dom`
Expected: lockfile + package.json updated.

- [ ] **Step 2: Write the failing container test**

Create `apps/tma/src/screens/clients.container.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { TmaClients } from '@altegio/shared';

type Pending = { path: string; resolve: (v: TmaClients) => void; reject: (e: Error) => void };
const pending: Pending[] = [];

vi.mock('../api', () => ({
  api: {
    get: (path: string) =>
      new Promise((resolve, reject) => { pending.push({ path, resolve, reject }); }),
  },
}));

import { Clients } from './Clients';

const mk = (total: number): TmaClients => ({
  totalClients: total, sleepingCount: 0, almostLostCount: 0, sleeping: [], top: [],
});

beforeEach(() => { pending.length = 0; });

describe('Clients container', () => {
  it('walks loading → error → data', async () => {
    render(<Clients />);
    expect(screen.getByText('Загрузка…')).toBeTruthy();

    await act(async () => { pending[0].reject(new Error('HTTP 500')); });
    expect(screen.getByText('Не удалось загрузить. Попробуйте ещё раз.')).toBeTruthy();

    fireEvent.click(screen.getByText('30+ дней')); // re-fetch resets the error
    expect(screen.getByText('Загрузка…')).toBeTruthy();
    await act(async () => { pending[1].resolve(mk(777)); });
    expect(screen.getByText('777')).toBeTruthy();
  });

  it('ignores a stale response that resolves after a newer request', async () => {
    render(<Clients />);
    expect(pending[0].path).toContain('sleepingDays=60');

    fireEvent.click(screen.getByText('90+ дней'));
    expect(pending[1].path).toContain('sleepingDays=90');

    // Newer request resolves first…
    await act(async () => { pending[1].resolve(mk(999)); });
    expect(screen.getByText('999')).toBeTruthy();

    // …then the stale one lands and must be dropped.
    await act(async () => { pending[0].resolve(mk(111)); });
    expect(screen.getByText('999')).toBeTruthy();
    expect(screen.queryByText('111')).toBeNull();
  });

  it('shows loading (not stale data) while switching pills', async () => {
    render(<Clients />);
    await act(async () => { pending[0].resolve(mk(555)); });
    expect(screen.getByText('555')).toBeTruthy();

    fireEvent.click(screen.getByText('90+ дней'));
    expect(screen.getByText('Загрузка…')).toBeTruthy();
    expect(screen.queryByText('555')).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @altegio/tma test`
Expected: the stale-response test and the pill-switch test FAIL (current effect neither guards nor resets `data`).

- [ ] **Step 4: Apply the guard pattern to Clients**

`apps/tma/src/screens/Clients.tsx`, replace the effect (lines 46-49):

```tsx
  useEffect(() => {
    let stale = false;
    setData(null);
    setFailed(false);
    api.get<TmaClients>(`/tma/clients?sleepingDays=${days}`)
      .then((d) => { if (!stale) setData(d); })
      .catch(() => { if (!stale) setFailed(true); });
    return () => { stale = true; };
  }, [days]);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @altegio/tma test`
Expected: PASS (all files).

- [ ] **Step 6: Apply the same pattern to the other four fetch sites**

`apps/tma/src/screens/Losses.tsx` (lines 37-41):

```tsx
  useEffect(() => {
    const { from, to } = range(period);
    let stale = false;
    setData(null);
    setFailed(false);
    api.get<TmaLosses>(`/tma/losses?from=${from}&to=${to}`)
      .then((d) => { if (!stale) setData(d); })
      .catch(() => { if (!stale) setFailed(true); });
    return () => { stale = true; };
  }, [period]);
```

`apps/tma/src/screens/Staff.tsx` (lines 51-56):

```tsx
  useEffect(() => {
    const { from, to } = range(period);
    let stale = false;
    setRows([]);
    setTotals(null);
    api.get<StaffCompareResponse>(`/tma/staff?from=${from}&to=${to}&compare=1`)
      .then((r) => { if (!stale) { setRows(r.rows); setTotals(r.totals); } })
      .catch(() => { if (!stale) { setRows([]); setTotals(null); } });
    return () => { stale = true; };
  }, [period]);
```

`apps/tma/src/screens/StaffDetailScreen.tsx` (lines 45-49):

```tsx
  useEffect(() => {
    const { from, to } = range(period);
    let stale = false;
    setDetail(null);
    setFailed(false);
    api.get<StaffDetail>(`/tma/staff/${staffId}/detail?from=${from}&to=${to}`)
      .then((d) => { if (!stale) setDetail(d); })
      .catch(() => { if (!stale) setFailed(true); });
    return () => { stale = true; };
  }, [staffId, period]);
```

`apps/tma/src/App.tsx` (lines 17-27) — one-shot fetch; the guard protects against setState after unmount:

```tsx
  useEffect(() => {
    initTelegram();
    document.documentElement.setAttribute('data-theme', getTheme());
    // Some Telegram clients (notably the native macOS app) do not pass initData
    // to Mini Apps — fail fast with a precise message instead of a doomed 401.
    if (!getInitData()) {
      setError('NO_INITDATA');
      return;
    }
    let stale = false;
    api.get<TmaSummary>('/tma/summary')
      .then((s) => { if (!stale) setSummary(s); })
      .catch((e: Error) => { if (!stale) setError(e.message); });
    return () => { stale = true; };
  }, []);
```

- [ ] **Step 7: Run all TMA tests + build**

Run: `pnpm --filter @altegio/tma test`
Expected: PASS.
Run: `pnpm --filter @altegio/tma build`
Expected: builds clean (type-checks the changed screens).

- [ ] **Step 8: Commit**

```bash
git add apps/tma/package.json pnpm-lock.yaml apps/tma/src/App.tsx apps/tma/src/screens/Staff.tsx apps/tma/src/screens/Losses.tsx apps/tma/src/screens/Clients.tsx apps/tma/src/screens/StaffDetailScreen.tsx apps/tma/src/screens/clients.container.test.tsx
git commit -m "fix(tma): stale-response guards in all screen fetches"
```

---

### Task 5: v2b cosmetic follow-ups

**Files:**
- Modify: `apps/api/src/modules/metrics/metrics.service.ts` (comment headers + return type)
- Modify: `apps/api/test/tma-metrics.int.spec.ts:241`
- Modify: `apps/tma/src/screens/Clients.tsx:14`

**Interfaces:**
- Consumes: `TmaClients` from `@altegio/shared`.
- Produces: no behavior changes — comments, an explicit return type, a renamed test variable.

- [ ] **Step 1: Strip planning-artifact comments from metrics.service.ts**

Every `// Task N …` / `// Task N (TMA vXx) …` section-header comment loses its task prefix, keeping only the descriptive part. Exact replacements (header lines only, the `-----` frame lines stay):

| Line (approx) | Before | After |
|---|---|---|
| 15 | `// Task 17 — yesterdayUtilization (attendance = 1: completed visits only)` | `// yesterdayUtilization (attendance = 1: completed visits only)` |
| 39 | `// Task 20 (C3 fix) — todayUtilization (attendance IN (0,1): including scheduled)` | `// todayUtilization (attendance IN (0,1): including scheduled)` |
| 63 | `// Task 18 — monthlyGoal (I6: 60-day history gate + NaN/Infinity guard)` | `// monthlyGoal (60-day history gate + NaN/Infinity guard)` |
| 150 | `// Task 19 — todayCategoryFillRates (C2 fix: TZ-aware date filter)` | `// todayCategoryFillRates (TZ-aware date filter)` |
| 201 | `// Task 20 helpers — scheduledToday, yesterdayRevenue, avg7Revenue,` | `// Report helpers — scheduledToday, yesterdayRevenue, avg7Revenue,` |
| 296 | `// Task 2 (TMA) — staffTable: per-staff aggregates over a date range` | `// staffTable: per-staff aggregates over a date range` |
| 362 | `// Task 20 — buildDailyReportData` | `// buildDailyReportData` |
| 635 | `// Task 3 (TMA) — staffRevenueTrend + revenueSeries daily series` | `// staffRevenueTrend + revenueSeries daily series` |
| 680 | `// Task 3 (TMA v2a) — staffDetail: per-master header, services, clients, cancels` | `// staffDetail: per-master header, services, clients, cancels` |
| 764 | `// Task 2 (TMA v2b) — lossesData: SQL ingredients for the losses screen` | `// lossesData: SQL ingredients for the losses screen` |
| 809 | `// Task 3 (TMA v2b) — clientsAnalytics: sleeping list, LTV top, counters` | `// clientsAnalytics: sleeping list, LTV top, counters` |

Also line 250: `// I7: divide by 7 (not rows.length) for a true 7-day average` → `// divide by 7 (not rows.length) for a true 7-day average`.

- [ ] **Step 2: Explicit return type on clientsAnalytics**

Line 812 of `apps/api/src/modules/metrics/metrics.service.ts`:

```ts
  async clientsAnalytics(tenantId: string, today: string, sleepingCutoff: string, almostLostCutoff: string): Promise<TmaClients> {
```

Extend the shared import on line 5:

```ts
import { CategoryFill, DailyReportData, TopStaff, StaffTableRow, TrendPoint, TmaClients } from '@altegio/shared';
```

- [ ] **Step 3: De-shadow `top` in the int test**

`apps/api/test/tma-metrics.int.spec.ts` line 241:

```ts
    expect(c.top.map((t: any) => t.name)).toContain('Активная');
```

- [ ] **Step 4: Design note for the «90+ дней» counter**

`apps/tma/src/screens/Clients.tsx` — above line 14 add:

```tsx
        {/* Design note: the «90+ дней» counter is intentionally fixed at the 90-day
            cutoff regardless of the sleeping-threshold pill — it answers "how many are
            almost lost", not "how many match the current filter". */}
```

- [ ] **Step 5: Verify nothing broke**

Run: `pnpm --filter @altegio/api test`
Expected: PASS.
Run: `pnpm --filter @altegio/tma test && pnpm --filter @altegio/tma build`
Expected: PASS / clean build.
Run: `pnpm --filter @altegio/api test:int -- --testPathPattern=tma-metrics`
Expected: PASS (Docker; if unavailable → DONE_WITH_CONCERNS naming the command).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/metrics/metrics.service.ts apps/api/test/tma-metrics.int.spec.ts apps/tma/src/screens/Clients.tsx
git commit -m "chore: strip planning-artifact comments, explicit TmaClients type, test cleanups"
```

---

## Post-merge operations (controller/owner, not subagent tasks)

1. Merge `feature/tma-v2c` → `main`, push. CI deploys automatically (find the run by `headSha`, not "latest").
2. Resync BrowUp: `ssh root@167.99.250.107`, then CLI inside the api container:
   `docker exec docker-api-1 sh -c 'cd /app && apps/cli/node_modules/.bin/ts-node -r tsconfig-paths/register --project apps/cli/tsconfig.json apps/cli/src/main.ts trigger-sync --tenant <id>'`
   (full client sweep runs on every sync now; ~140 search pages ≈ 50 s at 3 rps).
3. Verify prod DB: `SELECT COUNT(*) FILTER (WHERE visits_count IS NOT NULL) FROM clients;` — expect ~27.9k rows with visit fields.
4. Open the TMA on a phone: Clients tab shows sleeping list + LTV top; Losses idle shows «до загрузки 80%» with a sane hero number.
5. Manual visual pass (owner): 0.7rem tab labels legibility on device (v2b leftover).
6. If the owner wants a different idle target: `set-target-utilization --tenant <id> --pct <n>`.
