// apps/api/test/tma-metrics.int.spec.ts
import { TestDb, startTestDb } from './helpers/test-db';
import { TenantEntity } from '../src/modules/tenants/tenant.entity';
import { TenantsService } from '../src/modules/tenants/tenants.service';
import { TokenCipher } from '../src/modules/tenants/token-cipher.service';
import { MetricsService } from '../src/modules/metrics/metrics.service';

describe('MetricsService.staffTable (int)', () => {
  let db: TestDb; let svc: MetricsService; let tenantId: string;

  beforeAll(async () => {
    db = await startTestDb();
    const tenants = new TenantsService(
      db.ds.getRepository(TenantEntity),
      new TokenCipher(process.env.APP_ENCRYPTION_KEY!),
    );
    svc = new MetricsService(db.ds, tenants);
    const t = await tenants.create({ salonName: 'S', locationId: 1, altegioToken: 'x', timezone: 'UTC' });
    tenantId = t.id;

    await db.ds.query(
      `INSERT INTO staff (tenant_id, altegio_staff_id, name, fired, bookable) VALUES
       ($1, 1, 'Alice', false, true), ($1, 2, 'Bob', false, true)`, [tenantId]);

    // Alice: capacity 600 min on 2026-06-01
    await db.ds.query(
      `INSERT INTO resource_schedule (tenant_id, resource_altegio_id, date, working_minutes) VALUES
       ($1, 1, '2026-06-01', 600)`, [tenantId]);

    // Alice on 2026-06-01: 2 completed (client 100 first-ever here, client 101 first-ever here),
    //   1 cancelled. seance_length 3600s each (60 min).
    await db.ds.query(
      `INSERT INTO records (tenant_id, altegio_record_id, altegio_staff_id, altegio_client_id, datetime, seance_length, cost, attendance, paid_full, is_online, deleted) VALUES
       ($1, 1, 1, 100, '2026-06-01 10:00+00', 3600, 10000, 1, 1, false, false),
       ($1, 2, 1, 101, '2026-06-01 11:00+00', 3600, 20000, 1, 1, false, false),
       ($1, 3, 1, 102, '2026-06-01 12:00+00', 3600,     0, -1, 0, false, false)`, [tenantId]);

    // Bob on 2026-06-02: 1 completed, client 100 already visited Alice earlier → NOT new for Bob.
    await db.ds.query(
      `INSERT INTO records (tenant_id, altegio_record_id, altegio_staff_id, altegio_client_id, datetime, seance_length, cost, attendance, paid_full, is_online, deleted) VALUES
       ($1, 4, 2, 100, '2026-06-02 10:00+00', 3600, 15000, 1, 1, false, false)`, [tenantId]);
  }, 60000);

  afterAll(async () => { await db.stop(); });

  it('aggregates Alice correctly over the range', async () => {
    const rows = await svc.staffTable(tenantId, '2026-06-01', '2026-06-02', 'UTC');
    const alice = rows.find((r) => r.name === 'Alice')!;
    expect(alice.revenue).toBe(30000);
    expect(alice.visits).toBe(2);
    expect(alice.avgCheck).toBe(15000);
    expect(alice.cancelPct).toBe(33);         // 1 / (2+1) = 33%
    expect(alice.utilizationPct).toBe(20);    // booked 120 min / capacity 600 = 20%
    expect(alice.newClients).toBe(2);         // clients 100 & 101 first-ever on 2026-06-01 with Alice
    expect(alice.revenuePerHour).toBe(15000); // 30000 / (120/60)
  });

  it('Bob has no new clients (client 100 first visited Alice)', async () => {
    const rows = await svc.staffTable(tenantId, '2026-06-01', '2026-06-02', 'UTC');
    const bob = rows.find((r) => r.name === 'Bob')!;
    expect(bob.visits).toBe(1);
    expect(bob.newClients).toBe(0);
    expect(bob.utilizationPct).toBeNull();    // no schedule rows for Bob
  });

  it('orders by revenue desc', async () => {
    const rows = await svc.staffTable(tenantId, '2026-06-01', '2026-06-02', 'UTC');
    expect(rows[0].name).toBe('Alice');
  });
});

describe('MetricsService trend series (int)', () => {
  let db: TestDb; let svc: MetricsService; let tenantId: string;

  beforeAll(async () => {
    db = await startTestDb();
    const tenants = new TenantsService(
      db.ds.getRepository(TenantEntity),
      new TokenCipher(process.env.APP_ENCRYPTION_KEY!),
    );
    svc = new MetricsService(db.ds, tenants);
    const t = await tenants.create({ salonName: 'S', locationId: 2, altegioToken: 'x', timezone: 'UTC' });
    tenantId = t.id;
    await db.ds.query(
      `INSERT INTO staff (tenant_id, altegio_staff_id, name, fired, bookable) VALUES ($1, 1, 'Alice', false, true)`, [tenantId]);
    await db.ds.query(
      `INSERT INTO records (tenant_id, altegio_record_id, altegio_staff_id, altegio_client_id, datetime, seance_length, cost, attendance, paid_full, is_online, deleted) VALUES
       ($1, 1, 1, 100, '2026-06-08 10:00+00', 3600, 10000, 1, 1, false, false),
       ($1, 2, 1, 101, '2026-06-10 10:00+00', 3600, 20000, 1, 1, false, false)`, [tenantId]);
  }, 60000);
  afterAll(async () => { await db.stop(); });

  it('staffRevenueTrend returns exactly `days` zero-filled ascending points', async () => {
    const series = await svc.staffRevenueTrend(tenantId, 1, 5, '2026-06-10', 'UTC');
    expect(series.map((p) => p.date)).toEqual(['2026-06-06', '2026-06-07', '2026-06-08', '2026-06-09', '2026-06-10']);
    expect(series.map((p) => p.revenue)).toEqual([0, 0, 10000, 0, 20000]);
  });

  it('revenueSeries sums tenant-wide', async () => {
    const series = await svc.revenueSeries(tenantId, 3, '2026-06-10', 'UTC');
    expect(series).toEqual([
      { date: '2026-06-08', revenue: 10000 },
      { date: '2026-06-09', revenue: 0 },
      { date: '2026-06-10', revenue: 20000 },
    ]);
  });
});

describe('MetricsService.staffDetail (int)', () => {
  let db: TestDb; let svc: MetricsService; let tenantId: string;

  beforeAll(async () => {
    db = await startTestDb();
    const tenants = new TenantsService(
      db.ds.getRepository(TenantEntity),
      new TokenCipher(process.env.APP_ENCRYPTION_KEY!),
    );
    svc = new MetricsService(db.ds, tenants);
    const t = await tenants.create({ salonName: 'S', locationId: 9, altegioToken: 'x', timezone: 'UTC' });
    tenantId = t.id;

    await db.ds.query(
      `INSERT INTO staff (tenant_id, altegio_staff_id, name, fired, bookable) VALUES ($1, 1, 'Алиса', false, true)`, [tenantId]);
    await db.ds.query(
      `INSERT INTO services (tenant_id, altegio_service_id, title, category_id, price_min, price_max, active) VALUES
       ($1, 501, 'Брови', NULL, 0, 0, true), ($1, 502, 'Ресницы', NULL, 0, 0, true)`, [tenantId]);
    await db.ds.query(
      `INSERT INTO resource_schedule (tenant_id, resource_altegio_id, date, working_minutes) VALUES
       ($1, 1, '2026-06-10', 600)`, [tenantId]);
    // client 100: first-ever visit BEFORE range (returning); client 101: first-ever IN range (new)
    await db.ds.query(
      `INSERT INTO records (tenant_id, altegio_record_id, altegio_staff_id, altegio_client_id, altegio_service_id, datetime, seance_length, cost, attendance, paid_full, is_online, deleted) VALUES
       ($1, 1, 1, 100, 501, '2026-06-01 10:00+00', 3600, 8000, 1, 1, false, false),
       ($1, 2, 1, 100, 501, '2026-06-10 10:00+00', 3600, 10000, 1, 1, false, false),
       ($1, 3, 1, 101, 502, '2026-06-10 12:00+00', 3600, 20000, 1, 1, false, false),
       ($1, 4, 1, 102, 501, '2026-06-10 14:00+00', 3600, 0, -1, 0, false, false),
       ($1, 5, 1, 103, 502, '2026-06-10 15:00+00', 3600, 0, 2, 0, false, false)`, [tenantId]);
  }, 60000);
  afterAll(async () => { await db.stop(); });

  it('aggregates header numbers, services, clients, cancels for the range', async () => {
    const d = (await svc.staffDetail(tenantId, 1, '2026-06-10', '2026-06-10', 'UTC'))!;
    expect(d.name).toBe('Алиса');
    expect(d.revenue).toBe(30000);
    expect(d.visits).toBe(2);
    expect(d.avgCheck).toBe(15000);
    expect(d.utilizationPct).toBe(20); // 120 booked min / 600 capacity
    expect(d.cancelled).toBe(1);
    expect(d.noShow).toBe(1);
    expect(d.newClients).toBe(1);        // client 101
    expect(d.returningClients).toBe(1);  // client 100 (first visit 2026-06-01)
    expect(d.services).toEqual([
      { title: 'Ресницы', visits: 1, revenue: 20000 },
      { title: 'Брови', visits: 1, revenue: 10000 },
    ]);
  });

  it('returns null for an unknown staff id', async () => {
    expect(await svc.staffDetail(tenantId, 999, '2026-06-10', '2026-06-10', 'UTC')).toBeNull();
  });
});

describe('MetricsService.lossesData (int)', () => {
  let db: TestDb; let svc: MetricsService; let tenantId: string;

  beforeAll(async () => {
    db = await startTestDb();
    const tenants = new TenantsService(
      db.ds.getRepository(TenantEntity),
      new TokenCipher(process.env.APP_ENCRYPTION_KEY!),
    );
    svc = new MetricsService(db.ds, tenants);
    const t = await tenants.create({ salonName: 'L', locationId: 11, altegioToken: 'x', timezone: 'UTC' });
    tenantId = t.id;

    await db.ds.query(
      `INSERT INTO staff (tenant_id, altegio_staff_id, name, fired, bookable) VALUES ($1, 1, 'A', false, true)`, [tenantId]);
    await db.ds.query(
      `INSERT INTO resource_schedule (tenant_id, resource_altegio_id, date, working_minutes) VALUES
       ($1, 1, '2026-06-10', 480), ($1, 1, '2026-06-11', 480)`, [tenantId]);
    // 2 completed (7200s = 120 min booked, 30000 revenue), 1 cancelled, 1 no-show (cost 8000)
    await db.ds.query(
      `INSERT INTO records (tenant_id, altegio_record_id, altegio_staff_id, altegio_client_id, datetime, seance_length, cost, attendance, paid_full, is_online, deleted) VALUES
       ($1, 1, 1, 100, '2026-06-10 10:00+00', 3600, 10000, 1, 1, false, false),
       ($1, 2, 1, 101, '2026-06-11 10:00+00', 3600, 20000, 1, 1, false, false),
       ($1, 3, 1, 102, '2026-06-10 12:00+00', 3600, 0, -1, 0, false, false),
       ($1, 4, 1, 103, '2026-06-11 12:00+00', 3600, 8000, 2, 0, false, false)`, [tenantId]);
    // clients: with the default 60-day threshold and range 2026-06-10..11 the
    // "fell asleep during the period" window is last_visit_date in 04-11..04-12.
    await db.ds.query(
      `INSERT INTO clients (tenant_id, altegio_client_id, name, phone, visits_count, last_visit_date, spent) VALUES
       ($1, 100, 'Уснула в периоде', '+7700', 5, '2026-04-11', 200000),
       ($1, 101, 'Давно спит', '+7702', 4, '2026-03-01', 150000),
       ($1, 102, 'Активная', '+7701', 3, '2026-06-11', 90000),
       ($1, 103, 'Без даты', NULL, 1, NULL, 10000)`, [tenantId]);
  }, 60000);
  afterAll(async () => { await db.stop(); });

  it('returns all ingredients over the range', async () => {
    const d = await svc.lossesData(tenantId, '2026-06-10', '2026-06-11', 'UTC');
    expect(d).toEqual({
      revenue: 30000, visits: 2, cancelled: 1,
      noShowCount: 1, noShowLost: 8000,
      bookedMin: 120, capacityMin: 960,
      // only 'Уснула в периоде' crossed the 60-day threshold inside the range;
      // the long-asleep stock and NULL dates are excluded
      newSleeping: 1,
      avgCheck: 15000,
    });
  });
});

describe('MetricsService.clientsAnalytics (int)', () => {
  let db: TestDb; let svc: MetricsService; let tenantId: string;

  beforeAll(async () => {
    db = await startTestDb();
    const tenants = new TenantsService(
      db.ds.getRepository(TenantEntity),
      new TokenCipher(process.env.APP_ENCRYPTION_KEY!),
    );
    svc = new MetricsService(db.ds, tenants);
    const t = await tenants.create({ salonName: 'C', locationId: 12, altegioToken: 'x', timezone: 'UTC' });
    tenantId = t.id;
    await db.ds.query(
      `INSERT INTO clients (tenant_id, altegio_client_id, name, phone, visits_count, last_visit_date, spent) VALUES
       ($1, 1, 'ВИП спящая', '+7700', 20, '2026-03-01', 900000),
       ($1, 2, 'Спящая мал.', '+7701', 2, '2026-04-20', 50000),
       ($1, 3, 'Активная', '+7702', 8, '2026-06-30', 400000),
       ($1, 4, 'Без даты', NULL, 1, NULL, 10000),
       ($1, 5, 'Ноль визитов', '+7704', 0, NULL, 0)`, [tenantId]);
  }, 60000);
  afterAll(async () => { await db.stop(); });

  it('splits sleeping / almost-lost / totals with ordering and null handling', async () => {
    // today=2026-07-03, sleeping cutoff = today−60 = 2026-05-04, almost-lost = today−90 = 2026-04-04
    const c = await svc.clientsAnalytics(tenantId, '2026-07-03', '2026-05-04', '2026-04-04');
    expect(c.totalClients).toBe(4);        // visits_count >= 1
    expect(c.sleepingCount).toBe(2);       // ВИП (03-01) + мал. (04-20); NULL excluded
    expect(c.almostLostCount).toBe(1);     // only ВИП (03-01 < 04-04)
    expect(c.sleeping.map((s: any) => s.name)).toEqual(['ВИП спящая', 'Спящая мал.']); // spent DESC
    expect(c.sleeping[0]).toMatchObject({ phone: '+7700', visits: 20, spent: 900000 });
    expect(c.sleeping[0].daysSince).toBe(124); // 2026-03-01 → 2026-07-03
    expect(c.top[0].name).toBe('ВИП спящая'); // top by spent incl. active
    expect(c.top.map((t: any) => t.name)).toContain('Активная');
  });
});
