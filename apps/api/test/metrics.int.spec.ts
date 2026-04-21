import { TestDb } from './helpers/test-db';
import { startTestDb } from './helpers/test-db';
import { TenantEntity } from '../src/modules/tenants/tenant.entity';
import { TenantsService } from '../src/modules/tenants/tenants.service';
import { TokenCipher } from '../src/modules/tenants/token-cipher.service';
import { MetricsService } from '../src/modules/metrics/metrics.service';

// ---------------------------------------------------------------------------
// Task 17 — yesterdayUtilization
// ---------------------------------------------------------------------------

describe('MetricsService.yesterdayUtilization (int)', () => {
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
    const t = await tenants.create({ salonName: 'U', locationId: 10, altegioToken: 'u', timezone: 'UTC' });
    tenantId = t.id;

    // resource_schedule: 2 resources on 2026-04-19 with 600 + 400 = 1000 working_minutes
    await db.ds.query(
      `INSERT INTO resource_schedule (tenant_id, resource_altegio_id, date, working_minutes) VALUES
       ($1, 1, '2026-04-19', 600),
       ($1, 2, '2026-04-19', 400)`,
      [tenantId],
    );

    await db.ds.query(
      `INSERT INTO staff (tenant_id, altegio_staff_id, name, fired, bookable) VALUES
       ($1, 1, 'Alice', false, true)`,
      [tenantId],
    );

    // 2 attended records with seance_length 12000 + 18000 = 30000 seconds (200 + 300 minutes) on 2026-04-19
    await db.ds.query(
      `INSERT INTO records (tenant_id, altegio_record_id, altegio_staff_id, datetime, seance_length, cost, attendance, paid_full, is_online, deleted) VALUES
       ($1, 101, 1, '2026-04-19 10:00+00', 12000, 1000, 1, 1, false, false),
       ($1, 102, 1, '2026-04-19 12:00+00', 18000, 2000, 1, 1, false, false)`,
      [tenantId],
    );
  }, 60000);

  afterAll(async () => { await db.stop(); });

  it('returns correct utilization %', async () => {
    // 500 / 1000 * 100 = 50%
    const pct = await svc.yesterdayUtilization(tenantId, '2026-04-19', 'UTC');
    expect(pct).toBe(50);
  });

  it('returns null when no capacity for the date', async () => {
    const pct = await svc.yesterdayUtilization(tenantId, '2026-01-01', 'UTC');
    expect(pct).toBeNull();
  });

  it('returns 0 when capacity exists but no attended bookings', async () => {
    // Seed a schedule with no records for that date
    await db.ds.query(
      `INSERT INTO resource_schedule (tenant_id, resource_altegio_id, date, working_minutes) VALUES
       ($1, 1, '2026-05-01', 480)`,
      [tenantId],
    );
    const pct = await svc.yesterdayUtilization(tenantId, '2026-05-01', 'UTC');
    expect(pct).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// C2 — TZ-aware day boundary (Asia/Almaty)
// ---------------------------------------------------------------------------

describe('MetricsService TZ boundary (int)', () => {
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
    const t = await tenants.create({ salonName: 'TZ', locationId: 50, altegioToken: 'tz', timezone: 'Asia/Almaty' });
    tenantId = t.id;

    await db.ds.query(
      `INSERT INTO staff (tenant_id, altegio_staff_id, name, fired, bookable) VALUES
       ($1, 1, 'Askar', false, true)`,
      [tenantId],
    );

    // Record at 23:00 Almaty on 2026-04-19 = 18:00 UTC on 2026-04-19
    // UTC date: 2026-04-19  — but local Almaty date: 2026-04-19
    // A UTC-naive query (datetime::date) would bucket it correctly for UTC anyway in this case.
    // The real boundary test: record at 23:00 Almaty = 18:00 UTC on Apr 19.
    // yesterdayRevenue for yesterday='2026-04-19' with tz=Asia/Almaty must count this record.
    await db.ds.query(
      `INSERT INTO records (tenant_id, altegio_record_id, altegio_staff_id, datetime, seance_length, cost, attendance, paid_full, is_online, deleted) VALUES
       ($1, 700, 1, '2026-04-19 18:00+00', 60, 8000, 1, 1, false, false)`,
      [tenantId],
    );

    // Seed 7 days of prior history so avg7Revenue doesn't return null
    for (let i = 1; i <= 7; i++) {
      await db.ds.query(
        `INSERT INTO records (tenant_id, altegio_record_id, altegio_staff_id, datetime, seance_length, cost, attendance, paid_full, is_online, deleted) VALUES
         ($1, ${700 + i}, 1, $2::timestamptz, 60, 1000, 1, 1, false, false)`,
        [tenantId, `2026-04-${String(19 - i).padStart(2, '0')} 10:00+00`],
      );
    }
  }, 60000);

  afterAll(async () => { await db.stop(); });

  it('counts a 23:00 Almaty record on the correct local day', async () => {
    // 2026-04-19 18:00 UTC = 2026-04-19 23:00 Almaty (+5) → local date 2026-04-19
    const rev = await (svc as any).yesterdayRevenue(tenantId, '2026-04-19', 'Asia/Almaty');
    expect(rev).toBe(8000);
  });

  it('does NOT count it on the next local day', async () => {
    const rev = await (svc as any).yesterdayRevenue(tenantId, '2026-04-20', 'Asia/Almaty');
    expect(rev).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Task 18 — monthlyGoal
// ---------------------------------------------------------------------------

describe('MetricsService.monthlyGoal (int)', () => {
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
    const t = await tenants.create({ salonName: 'G', locationId: 20, altegioToken: 'g', timezone: 'UTC' });
    tenantId = t.id;

    await db.ds.query(
      `INSERT INTO staff (tenant_id, altegio_staff_id, name, fired, bookable) VALUES
       ($1, 1, 'Alice', false, true)`,
      [tenantId],
    );

    // 3 full prior months: Jan=30000, Feb=60000, Mar=90000 (avg=60000, target=66000)
    // 2026-01 (31 days)
    await db.ds.query(
      `INSERT INTO records (tenant_id, altegio_record_id, altegio_staff_id, datetime, seance_length, cost, attendance, paid_full, is_online, deleted) VALUES
       ($1, 201, 1, '2026-01-15 10:00+00', 60, 30000, 1, 1, false, false)`,
      [tenantId],
    );
    // 2026-02
    await db.ds.query(
      `INSERT INTO records (tenant_id, altegio_record_id, altegio_staff_id, datetime, seance_length, cost, attendance, paid_full, is_online, deleted) VALUES
       ($1, 202, 1, '2026-02-15 10:00+00', 60, 60000, 1, 1, false, false)`,
      [tenantId],
    );
    // 2026-03
    await db.ds.query(
      `INSERT INTO records (tenant_id, altegio_record_id, altegio_staff_id, datetime, seance_length, cost, attendance, paid_full, is_online, deleted) VALUES
       ($1, 203, 1, '2026-03-15 10:00+00', 60, 90000, 1, 1, false, false)`,
      [tenantId],
    );
    // 2026-04: some MTD records before the reference date (2026-04-19)
    await db.ds.query(
      `INSERT INTO records (tenant_id, altegio_record_id, altegio_staff_id, datetime, seance_length, cost, attendance, paid_full, is_online, deleted) VALUES
       ($1, 204, 1, '2026-04-05 10:00+00', 60, 10000, 1, 1, false, false),
       ($1, 205, 1, '2026-04-10 10:00+00', 60, 5000, 1, 1, false, false)`,
      [tenantId],
    );
  }, 60000);

  afterAll(async () => { await db.stop(); });

  it('returns target/mtd/pct with 3 full prior months and 60+ days of history', async () => {
    // avg of Jan(30000)+Feb(60000)+Mar(90000) = 60000; target = 66000
    // mtd for April up to (exclusive) 2026-04-19 = 10000 + 5000 = 15000
    // pct = round(15000/66000*100) = 23
    const result = await svc.monthlyGoal(tenantId, '2026-04-19', 'UTC');
    expect(result).not.toBeNull();
    expect(result!.target).toBe(66000);
    expect(result!.mtd).toBe(15000);
    expect(result!.pct).toBe(23);
  });

  it('returns null when history is less than 60 days before referenceDate', async () => {
    // earliest record is 2026-01-15; referenceDate 2026-02-28 → gap = 44 days < 60 → null
    const result = await svc.monthlyGoal(tenantId, '2026-02-28', 'UTC');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Task 19 — todayCategoryFillRates
// ---------------------------------------------------------------------------

describe('MetricsService.todayCategoryFillRates (int)', () => {
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
    const t = await tenants.create({ salonName: 'C', locationId: 30, altegioToken: 'c', timezone: 'UTC' });
    tenantId = t.id;

    await db.ds.query(
      `INSERT INTO staff (tenant_id, altegio_staff_id, name, fired, bookable) VALUES
       ($1, 1, 'Alice', false, true)`,
      [tenantId],
    );

    // Two resources with schedules
    // Resource 1: 600 working_minutes; Resource 2: 400 working_minutes
    await db.ds.query(
      `INSERT INTO resource_schedule (tenant_id, resource_altegio_id, date, working_minutes) VALUES
       ($1, 1, '2026-04-20', 600),
       ($1, 2, '2026-04-20', 400)`,
      [tenantId],
    );

    // Affinities:
    // Resource 1 → catA (100%)  => cap 600
    // Resource 2 → catB (50%) + catC (50%)  => catB cap 200, catC cap 200
    await db.ds.query(
      `INSERT INTO resource_category_affinity (tenant_id, resource_altegio_id, category_altegio_id, share) VALUES
       ($1, 1, 100, 1.0),
       ($1, 2, 200, 0.5),
       ($1, 2, 300, 0.5)`,
      [tenantId],
    );

    // Services: three categories
    await db.ds.query(
      `INSERT INTO services (tenant_id, altegio_service_id, title, category_id, price_min, price_max, active) VALUES
       ($1, 1001, 'Haircut', 100, 1000, 2000, true),
       ($1, 1002, 'Color', 200, 2000, 4000, true),
       ($1, 1003, 'Manicure', 300, 500, 1000, true)`,
      [tenantId],
    );

    // Records on 2026-04-20:
    // catA (svc 1001): 10800 + 7200 = 18000 sec = 300 min booked → fillPct = round(300/600*100) = 50
    // catB (svc 1002): 6000 sec = 100 min booked → fillPct = round(100/200*100) = 50
    // catC (svc 1003): no records → fillPct = 0
    await db.ds.query(
      `INSERT INTO records (tenant_id, altegio_record_id, altegio_staff_id, altegio_service_id, datetime, seance_length, cost, attendance, paid_full, is_online, deleted) VALUES
       ($1, 301, 1, 1001, '2026-04-20 09:00+00', 10800, 1500, 1, 1, false, false),
       ($1, 302, 1, 1001, '2026-04-20 10:00+00', 7200, 1500, 0, 0, false, false),
       ($1, 303, 1, 1002, '2026-04-20 11:00+00', 6000, 3000, 1, 1, false, false)`,
      [tenantId],
    );
  }, 60000);

  afterAll(async () => { await db.stop(); });

  it('returns top categories ordered by capacity desc with correct fillPct and visits', async () => {
    const cats = await svc.todayCategoryFillRates(tenantId, '2026-04-20', 'UTC');
    // catA cap=600, catB cap=200, catC cap=200 (all >=30)
    // Order: catA first (600), then catB/catC (200 each)
    expect(cats.length).toBe(3);
    expect(cats[0].name).toBe('Haircut'); // catA, highest cap
    expect(cats[0].fillPct).toBe(50);     // 300/600
    expect(cats[0].visits).toBe(2);       // 2 records in catA

    // catB
    const catB = cats.find((c) => c.name === 'Color');
    expect(catB).toBeDefined();
    expect(catB!.fillPct).toBe(50);  // 100/200
    expect(catB!.visits).toBe(1);

    // catC
    const catC = cats.find((c) => c.name === 'Manicure');
    expect(catC).toBeDefined();
    expect(catC!.fillPct).toBe(0);
    expect(catC!.visits).toBe(0);
  });

  it('drops categories with capacity < 30 minutes', async () => {
    // Insert a tiny affinity so catD has only 10 minutes capacity
    await db.ds.query(
      `INSERT INTO resource_category_affinity (tenant_id, resource_altegio_id, category_altegio_id, share) VALUES
       ($1, 2, 400, 0.025)`,  // 400 * 0.025 = 10 minutes
      [tenantId],
    );
    await db.ds.query(
      `INSERT INTO services (tenant_id, altegio_service_id, title, category_id, price_min, price_max, active) VALUES
       ($1, 1004, 'Tiny', 400, 100, 200, true)`,
      [tenantId],
    );
    const cats = await svc.todayCategoryFillRates(tenantId, '2026-04-20', 'UTC');
    expect(cats.find((c) => c.name === 'Tiny')).toBeUndefined();
  });

  it('returns at most 5 categories even if more exist', async () => {
    // Add 3 more categories (each with enough capacity)
    for (let i = 5; i <= 7; i++) {
      await db.ds.query(
        `INSERT INTO resource_category_affinity (tenant_id, resource_altegio_id, category_altegio_id, share) VALUES
         ($1, 1, ${i * 100}, 0.1)`,  // 600 * 0.1 = 60 min each
        [tenantId],
      );
      await db.ds.query(
        `INSERT INTO services (tenant_id, altegio_service_id, title, category_id, price_min, price_max, active) VALUES
         ($1, ${2000 + i}, 'Extra${i}', ${i * 100}, 100, 200, true)`,
        [tenantId],
      );
    }
    const cats = await svc.todayCategoryFillRates(tenantId, '2026-04-20', 'UTC');
    expect(cats.length).toBeLessThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// Task 20 — buildDailyReportData (end-to-end happy path)
// ---------------------------------------------------------------------------

describe('MetricsService.buildDailyReportData (int)', () => {
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
    const t = await tenants.create({ salonName: 'TestSalon', locationId: 40, altegioToken: 'ts', timezone: 'UTC' });
    tenantId = t.id;

    await db.ds.query(
      `INSERT INTO staff (tenant_id, altegio_staff_id, name, fired, bookable) VALUES
       ($1, 1, 'Alice', false, true),
       ($1, 2, 'Bob', false, true)`,
      [tenantId],
    );

    // Services
    await db.ds.query(
      `INSERT INTO services (tenant_id, altegio_service_id, title, category_id, price_min, price_max, active) VALUES
       ($1, 2001, 'Haircut', 100, 1000, 2000, true),
       ($1, 2002, 'Color', 200, 2000, 4000, true)`,
      [tenantId],
    );

    // resource_schedule + affinity for today (2026-04-20) and yesterday (2026-04-19)
    await db.ds.query(
      `INSERT INTO resource_schedule (tenant_id, resource_altegio_id, date, working_minutes) VALUES
       ($1, 1, '2026-04-19', 600),
       ($1, 1, '2026-04-20', 600)`,
      [tenantId],
    );
    await db.ds.query(
      `INSERT INTO resource_category_affinity (tenant_id, resource_altegio_id, category_altegio_id, share) VALUES
       ($1, 1, 100, 1.0)`,
      [tenantId],
    );

    // Yesterday (2026-04-19): 2 completed + 1 cancelled
    // seance_length in seconds: 120 min = 7200 s, 180 min = 10800 s, 60 min = 3600 s,
    //                            90 min = 5400 s, 120 min = 7200 s
    await db.ds.query(
      `INSERT INTO records (tenant_id, altegio_record_id, altegio_staff_id, altegio_service_id, datetime, seance_length, cost, attendance, paid_full, is_online, deleted) VALUES
       ($1, 401, 1, 2001, '2026-04-19 10:00+00', 7200, 5000, 1, 1, false, false),
       ($1, 402, 1, 2001, '2026-04-19 12:00+00', 10800, 7000, 1, 1, false, false),
       ($1, 403, 2, 2002, '2026-04-19 15:00+00', 3600, 3000, -1, 0, false, false),
       ($1, 404, 1, 2001, '2026-04-20 09:00+00', 5400, 2000, 0, 0, false, false),
       ($1, 405, 2, 2001, '2026-04-20 11:00+00', 7200, 4000, 1, 1, false, false)`,
      [tenantId],
    );

    // Historic records for 3 months: Jan, Feb, Mar 2026
    await db.ds.query(
      `INSERT INTO records (tenant_id, altegio_record_id, altegio_staff_id, datetime, seance_length, cost, attendance, paid_full, is_online, deleted) VALUES
       ($1, 501, 1, '2026-01-15 10:00+00', 60, 30000, 1, 1, false, false),
       ($1, 502, 1, '2026-02-15 10:00+00', 60, 60000, 1, 1, false, false),
       ($1, 503, 1, '2026-03-15 10:00+00', 60, 90000, 1, 1, false, false)`,
      [tenantId],
    );
  }, 60000);

  afterAll(async () => { await db.stop(); });

  it('builds DailyReportData with correct nested shape', async () => {
    const data = await svc.buildDailyReportData(tenantId, '2026-04-20');

    expect(data.salonName).toBe('TestSalon');
    expect(data.timezone).toBe('UTC');

    // Yesterday block
    expect(data.yesterday.date).toBe('2026-04-19');
    expect(data.yesterday.revenue).toBe(12000);  // 5000+7000
    expect(data.yesterday.came).toBe(2);
    expect(data.yesterday.cancelled).toBe(1);
    expect(data.yesterday.avgCheck).toBe(6000);  // 12000/2
    expect(data.yesterday.aiInsight).toBeNull();
    expect(data.yesterday.topStaff.length).toBeGreaterThan(0);
    expect(data.yesterday.topStaff[0].name).toBe('Alice');
    // utilizationPct: booked = 120+180 = 300 min; capacity = 600 min; 50%
    expect(data.yesterday.utilizationPct).toBe(50);

    // Today block
    expect(data.today.date).toBe('2026-04-20');
    // attendance IN (0,1): record 404 (attendance=0) + record 405 (attendance=1) = 2
    expect(data.today.scheduled).toBe(2);
    // C3 fix: todayUtilization uses attendance IN (0,1)
    // booked: record 404 (90 min, att=0) + record 405 (120 min, att=1) = 210 min; capacity 600 => 35%
    expect(data.today.utilizationPct).toBe(35);
    expect(Array.isArray(data.today.categories)).toBe(true);
  });
});
