import { startTestDb, TestDb } from './helpers/test-db';
import { TenantEntity } from '../src/modules/tenants/tenant.entity';
import { TenantsService } from '../src/modules/tenants/tenants.service';
import { TokenCipher } from '../src/modules/tenants/token-cipher.service';
import { AggregatorService } from '../src/modules/sync/aggregator.service';

describe('AggregatorService (int)', () => {
  let db: TestDb;
  let svc: TenantsService;
  let agg: AggregatorService;

  beforeAll(async () => {
    db = await startTestDb();
    svc = new TenantsService(
      db.ds.getRepository(TenantEntity),
      new TokenCipher(process.env.APP_ENCRYPTION_KEY!),
    );
    agg = new AggregatorService(db.ds);
  });

  afterAll(async () => { await db.stop(); });

  it('computes daily_metrics and staff_daily from records', async () => {
    const t = await svc.create({ salonName: 'Agg', locationId: 99, altegioToken: 't', timezone: 'UTC' });

    await db.ds.query(`
      INSERT INTO records (tenant_id, altegio_record_id, altegio_staff_id, datetime, seance_length, cost, attendance, paid_full, is_online, deleted)
      VALUES
        ($1, 1, 1, '2026-04-19 10:00+00', 3600, 5000, 1, 1, false, false),
        ($1, 2, 1, '2026-04-19 12:00+00', 3600, 7000, 1, 1, false, false),
        ($1, 3, 1, '2026-04-19 14:00+00', 3600, 9000, -1, 0, false, false)
    `, [t.id]);

    await db.ds.query(
      `INSERT INTO staff (tenant_id, altegio_staff_id, name, fired, bookable) VALUES ($1, 1, 'A', false, true)`,
      [t.id],
    );

    await agg.recomputeDay(t.id, '2026-04-19');

    const dm = await db.ds.query(`SELECT * FROM daily_metrics WHERE tenant_id = $1`, [t.id]);
    expect(dm).toHaveLength(1);
    expect(Number(dm[0].revenue_total)).toBe(12000);
    expect(dm[0].visits_completed).toBe(2);
    expect(dm[0].visits_cancelled).toBe(1);
    expect(Number(dm[0].avg_check)).toBe(6000);

    const sd = await db.ds.query(`SELECT * FROM staff_daily WHERE tenant_id = $1`, [t.id]);
    expect(sd).toHaveLength(1);
    expect(Number(sd[0].revenue)).toBe(12000);
    expect(sd[0].visits).toBe(2);
    expect(sd[0].cancelled).toBe(1);
  });

  it('is idempotent — rerunning produces the same row count', async () => {
    const t = await svc.create({ salonName: 'Agg2', locationId: 100, altegioToken: 't', timezone: 'UTC' });
    await db.ds.query(
      `INSERT INTO records (tenant_id, altegio_record_id, altegio_staff_id, datetime, seance_length, cost, attendance, paid_full, is_online, deleted)
       VALUES ($1, 10, 5, '2026-04-19 10:00+00', 3600, 1000, 1, 1, false, false)`,
      [t.id],
    );
    await db.ds.query(
      `INSERT INTO staff (tenant_id, altegio_staff_id, name, fired, bookable) VALUES ($1, 5, 'B', false, true)`,
      [t.id],
    );

    await agg.recomputeDay(t.id, '2026-04-19');
    await agg.recomputeDay(t.id, '2026-04-19');

    const count = await db.ds.query(`SELECT COUNT(*) FROM daily_metrics WHERE tenant_id = $1`, [t.id]);
    expect(Number(count[0].count)).toBe(1);
  });
});
