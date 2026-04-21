import { DataSource } from 'typeorm';
import { startTestDb, TestDb } from './helpers/test-db';
import { TenantEntity } from '../src/modules/tenants/tenant.entity';
import { TenantsService } from '../src/modules/tenants/tenants.service';
import { TokenCipher } from '../src/modules/tenants/token-cipher.service';
import { ResourceAffinityService } from '../src/modules/sync/resource-affinity.service';

// ---- helpers ----------------------------------------------------------------

async function seedServices(
  ds: DataSource,
  tenantId: string,
  rows: Array<{ serviceId: number; categoryId: number }>,
): Promise<void> {
  for (const { serviceId, categoryId } of rows) {
    await ds.query(
      `INSERT INTO services (tenant_id, altegio_service_id, title, category_id)
       VALUES ($1, $2, $3, $4)`,
      [tenantId, serviceId, `Service ${serviceId}`, categoryId],
    );
  }
}

/**
 * Bulk-insert `count` records for a given (tenantId, staffId, serviceId).
 * All records are attendance=1, within the last 90 days, keyed by altegio_staff_id.
 *
 * Uses a generate_series approach to avoid per-row round-trips while keeping
 * the parameterisation simple enough for Postgres type inference.
 */
async function seedRecords(
  ds: DataSource,
  tenantId: string,
  opts: { resourceId: number; serviceId: number; count: number; startId?: number },
): Promise<void> {
  const { resourceId, serviceId, count, startId = 1 } = opts;
  // generate_series produces `count` rows; we compute each record_id offset from startId.
  // Days offset cycles through 1..80 so every row falls within the 90-day window.
  // resourceId is used as altegio_staff_id (the new capacity unit).
  await ds.query(
    `INSERT INTO records
       (tenant_id, altegio_record_id, altegio_staff_id, altegio_service_id, datetime,
        seance_length, cost, attendance, paid_full, is_online, deleted)
     SELECT $1::uuid,
            $4::bigint + g.i - 1,
            $3::bigint,
            $2::bigint,
            now() - (((g.i - 1) % 80 + 1)::text || ' days')::interval,
            3600, 1000, 1, 1, false, false
     FROM generate_series(1, $5::int) AS g(i)`,
    [tenantId, serviceId, resourceId, startId, count],
  );
}

// ---- tests ------------------------------------------------------------------

describe('ResourceAffinityService (int)', () => {
  let db: TestDb;
  let tenants: TenantsService;
  let svc: ResourceAffinityService;

  beforeAll(async () => {
    db = await startTestDb();
    tenants = new TenantsService(
      db.ds.getRepository(TenantEntity),
      new TokenCipher(process.env.APP_ENCRYPTION_KEY!),
    );
    svc = new ResourceAffinityService(db.ds);
  }, 90_000);

  afterAll(async () => {
    await db.stop();
  });

  // --------------------------------------------------------------------------
  it('computes 90/10 share correctly for two categories', async () => {
    const t = await tenants.create({
      salonName: 'Affinity90',
      locationId: 1,
      altegioToken: 't1',
      timezone: 'UTC',
    });

    // Category 10 → serviceId 101 (90 visits), category 20 → serviceId 102 (10 visits)
    await seedServices(db.ds, t.id, [
      { serviceId: 101, categoryId: 10 },
      { serviceId: 102, categoryId: 20 },
    ]);

    const resourceId = 1;
    await seedRecords(db.ds, t.id, { resourceId, serviceId: 101, count: 90, startId: 1000 });
    await seedRecords(db.ds, t.id, { resourceId, serviceId: 102, count: 10, startId: 2000 });

    await svc.recompute(t.id);

    const rows: Array<{ resource_altegio_id: string; category_altegio_id: string; share: string }> =
      await db.ds.query(
        `SELECT resource_altegio_id, category_altegio_id, share
         FROM resource_category_affinity
         WHERE tenant_id = $1
         ORDER BY category_altegio_id`,
        [t.id],
      );

    expect(rows).toHaveLength(2);

    const catA = rows.find((r) => Number(r.category_altegio_id) === 10);
    const catB = rows.find((r) => Number(r.category_altegio_id) === 20);

    expect(catA).toBeDefined();
    expect(catB).toBeDefined();
    expect(Number(catA!.share)).toBeCloseTo(0.9, 4);
    expect(Number(catB!.share)).toBeCloseTo(0.1, 4);
  });

  // --------------------------------------------------------------------------
  it('excludes (resource, category) pairs with n < 3', async () => {
    const t = await tenants.create({
      salonName: 'AffinityThreshold',
      locationId: 2,
      altegioToken: 't2',
      timezone: 'UTC',
    });

    // Category 30 → 2 visits (below threshold), category 40 → 100 visits (above)
    await seedServices(db.ds, t.id, [
      { serviceId: 201, categoryId: 30 },
      { serviceId: 202, categoryId: 40 },
    ]);

    const resourceId = 2;
    await seedRecords(db.ds, t.id, { resourceId, serviceId: 201, count: 2, startId: 3000 });
    await seedRecords(db.ds, t.id, { resourceId, serviceId: 202, count: 100, startId: 4000 });

    await svc.recompute(t.id);

    const rows: Array<{ category_altegio_id: string }> = await db.ds.query(
      `SELECT category_altegio_id
       FROM resource_category_affinity
       WHERE tenant_id = $1`,
      [t.id],
    );

    // Only the category with 100 visits should appear
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].category_altegio_id)).toBe(40);
  });

  // --------------------------------------------------------------------------
  it('deletes stale affinity rows that are no longer supported by data', async () => {
    const t = await tenants.create({
      salonName: 'AffinityStale',
      locationId: 3,
      altegioToken: 't3',
      timezone: 'UTC',
    });

    // Pre-seed a stale affinity row for (resource=5, category=99) — no records back it
    await db.ds.query(
      `INSERT INTO resource_category_affinity
         (tenant_id, resource_altegio_id, category_altegio_id, share, computed_at)
       VALUES ($1, 5, 99, 0.5000, now() - interval '2 hours')`,
      [t.id],
    );

    // Seed real data: resource 5, category 50 only (category 99 gets no new records)
    await seedServices(db.ds, t.id, [{ serviceId: 301, categoryId: 50 }]);
    await seedRecords(db.ds, t.id, { resourceId: 5, serviceId: 301, count: 10, startId: 5000 });

    await svc.recompute(t.id);

    const rows: Array<{ resource_altegio_id: string; category_altegio_id: string }> =
      await db.ds.query(
        `SELECT resource_altegio_id, category_altegio_id
         FROM resource_category_affinity
         WHERE tenant_id = $1`,
        [t.id],
      );

    // Stale row (resource=5, category=99) must be gone; only (resource=5, category=50) survives
    const stale = rows.find((r) => Number(r.category_altegio_id) === 99);
    const live = rows.find((r) => Number(r.category_altegio_id) === 50);

    expect(stale).toBeUndefined();
    expect(live).toBeDefined();
  });
});
