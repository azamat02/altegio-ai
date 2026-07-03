import { TestDb } from './helpers/test-db';
import { startTestDb } from './helpers/test-db';
import { TenantEntity } from '../src/modules/tenants/tenant.entity';
import { SyncJobEntity } from '../src/modules/sync/entities/sync-job.entity';
import { TenantsService } from '../src/modules/tenants/tenants.service';
import { TokenCipher } from '../src/modules/tenants/token-cipher.service';
import { AggregatorService } from '../src/modules/sync/aggregator.service';
import { ResourceAffinityService } from '../src/modules/sync/resource-affinity.service';
import { RawWriterService } from '../src/modules/sync/raw-writer.service';
import { RecordsParser } from '../src/modules/sync/parsers/records.parser';
import { StaffParser } from '../src/modules/sync/parsers/staff.parser';
import { ServicesParser } from '../src/modules/sync/parsers/services.parser';
import { ClientsParser } from '../src/modules/sync/parsers/clients.parser';
import { SyncService } from '../src/modules/sync/sync.service';
import { AltegioRawRecordEntity } from '../src/modules/sync/entities/altegio-raw-record.entity';
import { AltegioRawClientEntity } from '../src/modules/sync/entities/altegio-raw-client.entity';
import { AltegioRawStaffEntity } from '../src/modules/sync/entities/altegio-raw-staff.entity';
import { AltegioRawServiceEntity } from '../src/modules/sync/entities/altegio-raw-service.entity';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('SyncService integration', () => {
  let db: TestDb;
  let svc: SyncService;
  let tenants: TenantsService;

  beforeAll(async () => {
    db = await startTestDb();

    const tokenCipher = new TokenCipher(process.env.APP_ENCRYPTION_KEY!);
    tenants = new TenantsService(db.ds.getRepository(TenantEntity), tokenCipher);
    const raw = new RawWriterService(
      db.ds.getRepository(AltegioRawRecordEntity),
      db.ds.getRepository(AltegioRawClientEntity),
      db.ds.getRepository(AltegioRawStaffEntity),
      db.ds.getRepository(AltegioRawServiceEntity),
      db.ds,
    );
    const affinity = new ResourceAffinityService(db.ds);
    const agg = new AggregatorService(db.ds, affinity);

    const recFix = JSON.parse(readFileSync(join(__dirname, 'fixtures/altegio/records-sample.json'), 'utf8'));
    const stfFix = JSON.parse(readFileSync(join(__dirname, 'fixtures/altegio/staff-sample.json'), 'utf8'));
    const svcFix = JSON.parse(readFileSync(join(__dirname, 'fixtures/altegio/services-sample.json'), 'utf8'));
    const cliFix = JSON.parse(readFileSync(join(__dirname, 'fixtures/altegio/clients-search-sample.json'), 'utf8'));
    const ttFix  = JSON.parse(readFileSync(join(__dirname, 'fixtures/altegio/timetable-sample.json'), 'utf8'));

    const recEp = { fetchAll: async function* () { yield recFix; } } as any;
    const cliEp = { fetchAll: async function* () { yield cliFix; } } as any;
    const stfEp = { fetchAll: async () => stfFix } as any;
    const svcEp = { fetchAll: async () => svcFix } as any;
    const resEp = {} as any; // ResourcesEndpoint kept in DI but no longer called
    const ttEp  = { fetchStaffSchedule: async () => ttFix } as any;
    const svcCatEp = { fetchAll: async () => [] } as any;

    svc = new SyncService(
      db.ds,
      db.ds.getRepository(SyncJobEntity),
      tenants,
      raw,
      agg,
      new RecordsParser(),
      new StaffParser(),
      new ServicesParser(),
      new ClientsParser(),
      recEp, cliEp, stfEp, svcEp,
      resEp, ttEp, svcCatEp,
    );
  });

  afterAll(async () => { await db.stop(); });

  it('ingests fixture data end-to-end and is idempotent', async () => {
    const t = await tenants.create({ salonName: 'Live', locationId: 198823, altegioToken: 'x', timezone: 'Asia/Almaty' });

    await svc.syncTenant(t.id);
    const after1 = await db.ds.query(`SELECT COUNT(*) FROM records WHERE tenant_id = $1`, [t.id]);

    await svc.syncTenant(t.id);
    const after2 = await db.ds.query(`SELECT COUNT(*) FROM records WHERE tenant_id = $1`, [t.id]);

    expect(after1[0].count).toBe(after2[0].count);
    expect(Number(after1[0].count)).toBeGreaterThan(0);

    const dm = await db.ds.query(`SELECT * FROM daily_metrics WHERE tenant_id = $1`, [t.id]);
    expect(dm.length).toBeGreaterThan(0);
  });

  it('persists resource_instance_ids into records', async () => {
    const t = await tenants.create({ salonName: 'RIITest', locationId: 199001, altegioToken: 'z', timezone: 'Asia/Almaty' });
    await svc.syncTenant(t.id);
    const rows = await db.ds.query(
      `SELECT resource_instance_ids FROM records WHERE tenant_id = $1 AND cardinality(resource_instance_ids) > 0`,
      [t.id],
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it('populates resource_schedule from staff schedule', async () => {
    const t = await tenants.create({ salonName: 'ScheduleTest', locationId: 199002, altegioToken: 'w', timezone: 'Asia/Almaty' });

    await svc.syncTenant(t.id, { days: 3 });

    const schedCount = await db.ds.query(
      `SELECT COUNT(*) FROM resource_schedule WHERE tenant_id = $1`,
      [t.id],
    );
    expect(Number(schedCount[0].count)).toBeGreaterThan(0);
  });

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
});
