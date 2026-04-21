import { TestDb } from './helpers/test-db';
import { startTestDb } from './helpers/test-db';
import { TenantEntity } from '../src/modules/tenants/tenant.entity';
import { TenantsService } from '../src/modules/tenants/tenants.service';
import { TokenCipher } from '../src/modules/tenants/token-cipher.service';
import { AggregatorService } from '../src/modules/sync/aggregator.service';
import { ResourceAffinityService } from '../src/modules/sync/resource-affinity.service';
import { MetricsService } from '../src/modules/metrics/metrics.service';

describe('MetricsService (int)', () => {
  let db: TestDb;
  let tenants: TenantsService;
  let svc: MetricsService;
  let agg: AggregatorService;
  let tenantId: string;

  beforeAll(async () => {
    db = await startTestDb();
    tenants = new TenantsService(db.ds.getRepository(TenantEntity), new TokenCipher(process.env.APP_ENCRYPTION_KEY!));
    const affinity = new ResourceAffinityService(db.ds);
    agg = new AggregatorService(db.ds, affinity);
    svc = new MetricsService(db.ds, tenants);

    const t = await tenants.create({ salonName: 'M', locationId: 1, altegioToken: 't', timezone: 'UTC' });
    tenantId = t.id;

    await db.ds.query(
      `INSERT INTO staff (tenant_id, altegio_staff_id, name, fired, bookable) VALUES
       ($1, 1, 'Alice', false, true),
       ($1, 2, 'Bob', false, true)`,
      [tenantId],
    );

    // 2 completed + 1 cancelled yesterday (2026-04-19), 1 booked today (2026-04-20)
    await db.ds.query(
      `INSERT INTO records (tenant_id, altegio_record_id, altegio_staff_id, datetime, seance_length, cost, attendance, paid_full, is_online, deleted) VALUES
       ($1, 1, 1, '2026-04-19 10:00+00', 3600, 5000, 1, 1, false, false),
       ($1, 2, 1, '2026-04-19 12:00+00', 3600, 7000, 1, 1, false, false),
       ($1, 3, 2, '2026-04-19 15:00+00', 3600, 4000, -1, 0, false, false),
       ($1, 4, 1, '2026-04-20 11:00+00', 3600, 3000, 0, 0, false, false)`,
      [tenantId],
    );

    for (const day of ['2026-04-12','2026-04-13','2026-04-14','2026-04-15','2026-04-16','2026-04-17','2026-04-18']) {
      await db.ds.query(
        `INSERT INTO daily_metrics (tenant_id, date, revenue_total, visits_completed, visits_cancelled, avg_check, occupancy_pct, computed_at)
         VALUES ($1, $2, 10000, 5, 1, 2000, 40, now())`,
        [tenantId, day],
      );
    }
    await agg.recomputeDay(tenantId, '2026-04-19');
  }, 60000);

  afterAll(async () => { await db.stop(); });

  it('produces DailyReportData with yesterday stats and top staff', async () => {
    const d = await svc.getDailyReportData(tenantId, '2026-04-20');
    expect(d.yesterday.revenue).toBe(12000);
    expect(d.yesterday.visitsCompleted).toBe(2);
    expect(d.yesterday.visitsCancelled).toBe(1);
    expect(d.yesterday.cancellationLoss).toBe(4000);
    expect(d.topStaff[0].name).toBe('Alice');
    expect(d.today.bookedCount).toBe(1);
  });
});
