import { TestDb, startTestDb } from './helpers/test-db';
import { TenantEntity } from '../src/modules/tenants/tenant.entity';
import { TenantsService } from '../src/modules/tenants/tenants.service';
import { TokenCipher } from '../src/modules/tenants/token-cipher.service';
import { MetricsService } from '../src/modules/metrics/metrics.service';

// ---------------------------------------------------------------------------
// noShowForDate
// ---------------------------------------------------------------------------

describe('MetricsService.noShowForDate (int)', () => {
  let db: TestDb;
  let svc: MetricsService;
  let tenantId: string;

  beforeAll(async () => {
    db = await startTestDb();
    const tenants = new TenantsService(
      db.ds.getRepository(TenantEntity),
      new TokenCipher(process.env.APP_ENCRYPTION_KEY!),
    );
    svc = new MetricsService(db.ds, tenants);
    const t = await tenants.create({ salonName: 'NS', locationId: 60, altegioToken: 't', timezone: 'UTC' });
    tenantId = t.id;

    await db.ds.query(
      `INSERT INTO staff (tenant_id, altegio_staff_id, name, fired, bookable) VALUES
       ($1, 1, 'A', false, true)`,
      [tenantId],
    );

    await db.ds.query(
      `INSERT INTO records (tenant_id, altegio_record_id, altegio_staff_id, datetime, seance_length, cost, attendance, paid_full, is_online, deleted) VALUES
       ($1, 1, 1, '2026-05-10 10:00+00', 3600, 5000, 2, 0, false, false),
       ($1, 2, 1, '2026-05-10 12:00+00', 3600, 3000, 2, 0, false, false),
       ($1, 3, 1, '2026-05-10 14:00+00', 3600, 4000, 1, 1, false, false),
       ($1, 4, 1, '2026-05-11 10:00+00', 3600, 7000, 2, 0, false, false)`,
      [tenantId],
    );
  }, 60000);

  afterAll(async () => { await db.stop(); });

  it('counts no-shows and sums lost revenue for the date', async () => {
    const r = await svc.noShowForDate(tenantId, '2026-05-10', 'UTC');
    expect(r.count).toBe(2);
    expect(r.lostRevenue).toBe(8000);
  });

  it('returns zeros when no no-shows', async () => {
    const r = await svc.noShowForDate(tenantId, '2026-05-12', 'UTC');
    expect(r).toEqual({ count: 0, lostRevenue: 0 });
  });
});

// ---------------------------------------------------------------------------
// staffDailyBreakdown
// ---------------------------------------------------------------------------

describe('MetricsService.staffDailyBreakdown (int)', () => {
  let db: TestDb;
  let svc: MetricsService;
  let tenantId: string;

  beforeAll(async () => {
    db = await startTestDb();
    const tenants = new TenantsService(
      db.ds.getRepository(TenantEntity),
      new TokenCipher(process.env.APP_ENCRYPTION_KEY!),
    );
    svc = new MetricsService(db.ds, tenants);
    const t = await tenants.create({ salonName: 'SD', locationId: 61, altegioToken: 't', timezone: 'UTC' });
    tenantId = t.id;

    await db.ds.query(
      `INSERT INTO staff (tenant_id, altegio_staff_id, name, fired, bookable) VALUES
       ($1, 1, 'Alice', false, true),
       ($1, 2, 'Bob',   false, true),
       ($1, 3, 'Cara',  false, true)`,
      [tenantId],
    );

    // 2026-05-10: Alice 2 visits (3000+5000), Bob 1 visit (4000), Cara 0 attended (1 no-show)
    await db.ds.query(
      `INSERT INTO records (tenant_id, altegio_record_id, altegio_staff_id, datetime, seance_length, cost, attendance, paid_full, is_online, deleted) VALUES
       ($1, 10, 1, '2026-05-10 09:00+00', 3600, 3000, 1, 1, false, false),
       ($1, 11, 1, '2026-05-10 11:00+00', 7200, 5000, 1, 1, false, false),
       ($1, 12, 2, '2026-05-10 13:00+00', 3600, 4000, 1, 1, false, false),
       ($1, 13, 3, '2026-05-10 15:00+00', 3600, 2000, 2, 0, false, false)`,
      [tenantId],
    );
  }, 60000);

  afterAll(async () => { await db.stop(); });

  it('returns per-staff breakdown ordered by revenue desc', async () => {
    const rows = await svc.staffDailyBreakdown(tenantId, '2026-05-10', 'UTC');
    expect(rows.length).toBe(2); // Cara excluded (no attended)
    expect(rows[0].name).toBe('Alice');
    expect(rows[0].revenue).toBe(8000);
    expect(rows[0].visits).toBe(2);
    expect(rows[0].avgCheck).toBe(4000);
    expect(rows[0].bookedMinutes).toBe(180); // (3600+7200)/60
    expect(rows[1].name).toBe('Bob');
    expect(rows[1].revenue).toBe(4000);
    expect(rows[1].avgCheck).toBe(4000);
  });

  it('returns empty array when no records', async () => {
    const rows = await svc.staffDailyBreakdown(tenantId, '2026-05-20', 'UTC');
    expect(rows).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// retentionForDate
// ---------------------------------------------------------------------------

describe('MetricsService.retentionForDate (int)', () => {
  let db: TestDb;
  let svc: MetricsService;
  let tenantId: string;

  beforeAll(async () => {
    db = await startTestDb();
    const tenants = new TenantsService(
      db.ds.getRepository(TenantEntity),
      new TokenCipher(process.env.APP_ENCRYPTION_KEY!),
    );
    svc = new MetricsService(db.ds, tenants);
    const t = await tenants.create({ salonName: 'RT', locationId: 62, altegioToken: 't', timezone: 'UTC' });
    tenantId = t.id;

    await db.ds.query(
      `INSERT INTO staff (tenant_id, altegio_staff_id, name, fired, bookable) VALUES
       ($1, 1, 'A', false, true)`,
      [tenantId],
    );

    // Client 100: first visit 2026-04-01 (attended), again 2026-05-10 (attended) → returning on 2026-05-10
    // Client 200: first attended visit on 2026-05-10                              → new on 2026-05-10
    // Client 300: first visit 2026-05-09 (cancelled), then 2026-05-10 (attended)  → new on 2026-05-10 (first ATTENDED is 2026-05-10)
    // Client 400: visit 2026-05-10 but attendance=2 (no-show)                     → not counted
    await db.ds.query(
      `INSERT INTO records (tenant_id, altegio_record_id, altegio_staff_id, altegio_client_id, datetime, seance_length, cost, attendance, paid_full, is_online, deleted) VALUES
       ($1, 20, 1, 100, '2026-04-01 10:00+00', 3600, 1000, 1, 1, false, false),
       ($1, 21, 1, 100, '2026-05-10 10:00+00', 3600, 2000, 1, 1, false, false),
       ($1, 22, 1, 200, '2026-05-10 11:00+00', 3600, 3000, 1, 1, false, false),
       ($1, 23, 1, 300, '2026-05-09 11:00+00', 3600, 1500, -1, 0, false, false),
       ($1, 24, 1, 300, '2026-05-10 12:00+00', 3600, 1500, 1, 1, false, false),
       ($1, 25, 1, 400, '2026-05-10 13:00+00', 3600, 1000, 2, 0, false, false)`,
      [tenantId],
    );
  }, 60000);

  afterAll(async () => { await db.stop(); });

  it('splits attended clients into new vs returning', async () => {
    const r = await svc.retentionForDate(tenantId, '2026-05-10', 'UTC');
    expect(r.newClients).toBe(2);       // 200, 300
    expect(r.returningClients).toBe(1); // 100
    expect(r.totalClients).toBe(3);
    expect(r.newPct).toBe(67);
    expect(r.returningPct).toBe(33);
  });

  it('returns nulls when no attended clients', async () => {
    const r = await svc.retentionForDate(tenantId, '2026-05-20', 'UTC');
    expect(r).toEqual({
      newClients: 0,
      returningClients: 0,
      totalClients: 0,
      newPct: null,
      returningPct: null,
    });
  });
});

// ---------------------------------------------------------------------------
// sourceBreakdown
// ---------------------------------------------------------------------------

describe('MetricsService.sourceBreakdown (int)', () => {
  let db: TestDb;
  let svc: MetricsService;
  let tenantId: string;

  beforeAll(async () => {
    db = await startTestDb();
    const tenants = new TenantsService(
      db.ds.getRepository(TenantEntity),
      new TokenCipher(process.env.APP_ENCRYPTION_KEY!),
    );
    svc = new MetricsService(db.ds, tenants);
    const t = await tenants.create({ salonName: 'SB', locationId: 64, altegioToken: 't', timezone: 'UTC' });
    tenantId = t.id;

    await db.ds.query(
      `INSERT INTO staff (tenant_id, altegio_staff_id, name, fired, bookable) VALUES ($1, 1, 'A', false, true)`,
      [tenantId],
    );

    // 2026-05-10: 3 Online widget (15000), 2 Altegio.me App (7000), 2 direct=NULL (5000), 1 no-show (excluded)
    await db.ds.query(
      `INSERT INTO records (tenant_id, altegio_record_id, altegio_staff_id, datetime, seance_length, cost, attendance, paid_full, is_online, deleted, record_source) VALUES
       ($1, 40, 1, '2026-05-10 09:00+00', 3600, 5000, 1, 1, false, false, 'Online widget'),
       ($1, 41, 1, '2026-05-10 10:00+00', 3600, 6000, 1, 1, false, false, 'Online widget'),
       ($1, 42, 1, '2026-05-10 11:00+00', 3600, 4000, 1, 1, false, false, 'Online widget'),
       ($1, 43, 1, '2026-05-10 12:00+00', 3600, 3000, 1, 1, false, false, 'Altegio.me App'),
       ($1, 44, 1, '2026-05-10 13:00+00', 3600, 4000, 1, 1, false, false, 'Altegio.me App'),
       ($1, 45, 1, '2026-05-10 14:00+00', 3600, 2000, 1, 1, false, false, NULL),
       ($1, 46, 1, '2026-05-10 15:00+00', 3600, 3000, 1, 1, false, false, NULL),
       ($1, 47, 1, '2026-05-10 16:00+00', 3600, 9999, 2, 0, false, false, 'Online widget')`,
      [tenantId],
    );
  }, 60000);

  afterAll(async () => { await db.stop(); });

  it('groups attended records by source with shares', async () => {
    const rows = await svc.sourceBreakdown(tenantId, '2026-05-10', 'UTC');
    expect(rows.length).toBe(3);
    // 7 attended total → Online 3/7=43%, App 2/7=29%, Direct 2/7=29%
    const widget = rows.find((r) => r.source === 'Online widget')!;
    expect(widget.visits).toBe(3);
    expect(widget.revenue).toBe(15000);
    expect(widget.sharePct).toBe(43);
    const app = rows.find((r) => r.source === 'Altegio.me App')!;
    expect(app.visits).toBe(2);
    expect(app.revenue).toBe(7000);
    const direct = rows.find((r) => r.source === 'Прямая запись')!;
    expect(direct.visits).toBe(2);
    expect(direct.revenue).toBe(5000);
  });

  it('returns empty array when no attended records', async () => {
    const rows = await svc.sourceBreakdown(tenantId, '2026-05-20', 'UTC');
    expect(rows).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// revenueDynamics
// ---------------------------------------------------------------------------

describe('MetricsService.revenueDynamics (int)', () => {
  let db: TestDb;
  let svc: MetricsService;
  let tenantId: string;

  beforeAll(async () => {
    db = await startTestDb();
    const tenants = new TenantsService(
      db.ds.getRepository(TenantEntity),
      new TokenCipher(process.env.APP_ENCRYPTION_KEY!),
    );
    svc = new MetricsService(db.ds, tenants);
    const t = await tenants.create({ salonName: 'RD', locationId: 63, altegioToken: 't', timezone: 'UTC' });
    tenantId = t.id;

    await db.ds.query(
      `INSERT INTO staff (tenant_id, altegio_staff_id, name, fired, bookable) VALUES
       ($1, 1, 'A', false, true)`,
      [tenantId],
    );

    // Reference: 2026-05-15
    // Day:        2026-05-15 = 10000;  prev (2026-05-08) = 5000        → +100%
    // Week:       2026-05-09..15 = 10000+2000=12000 (only seed these)
    //             prev 2026-05-02..08 = 5000 (only 2026-05-08)         → +140%
    // Month MTD:  2026-05-01..15: 12000 + 1000(2026-05-05) = 13000
    //             2026-04 same-day (1..15) = 7000+8000 = 15000         → ~-13%
    await db.ds.query(
      `INSERT INTO records (tenant_id, altegio_record_id, altegio_staff_id, datetime, seance_length, cost, attendance, paid_full, is_online, deleted) VALUES
       ($1, 30, 1, '2026-05-15 10:00+00', 3600, 10000, 1, 1, false, false),
       ($1, 31, 1, '2026-05-08 10:00+00', 3600, 5000,  1, 1, false, false),
       ($1, 32, 1, '2026-05-09 10:00+00', 3600, 2000,  1, 1, false, false),
       ($1, 33, 1, '2026-05-05 10:00+00', 3600, 1000,  1, 1, false, false),
       ($1, 34, 1, '2026-04-01 10:00+00', 3600, 7000,  1, 1, false, false),
       ($1, 35, 1, '2026-04-15 10:00+00', 3600, 8000,  1, 1, false, false),
       ($1, 36, 1, '2026-05-15 12:00+00', 3600, 1500,  2, 0, false, false)`, // no-show excluded
      [tenantId],
    );
  }, 60000);

  afterAll(async () => { await db.stop(); });

  it('computes day/week/month vs previous comparable period', async () => {
    const r = await svc.revenueDynamics(tenantId, '2026-05-15', 'UTC');

    expect(r.day.value).toBe(10000);
    expect(r.day.prev).toBe(5000);
    expect(r.day.deltaPct).toBe(100);

    expect(r.week.value).toBe(12000); // 2026-05-09 (2000) + 2026-05-15 (10000)
    expect(r.week.prev).toBe(6000);   // 2026-05-05 (1000) + 2026-05-08 (5000)
    expect(r.week.deltaPct).toBe(100);

    expect(r.month.value).toBe(18000);  // MTD May: 1000+5000+2000+10000
    expect(r.month.prev).toBe(15000);   // Apr 1..15: 7000+8000
    expect(r.month.deltaPct).toBe(20);
  });

  it('returns null deltaPct when prev period is zero', async () => {
    const r = await svc.revenueDynamics(tenantId, '2027-01-01', 'UTC');
    expect(r.day.deltaPct).toBeNull();
    expect(r.week.deltaPct).toBeNull();
    expect(r.month.deltaPct).toBeNull();
  });
});
