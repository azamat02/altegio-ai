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
