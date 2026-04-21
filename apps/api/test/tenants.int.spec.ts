import type { TestDb } from './helpers/test-db';
import { startTestDb } from './helpers/test-db';
import { TenantEntity } from '../src/modules/tenants/tenant.entity';
import { TenantsService } from '../src/modules/tenants/tenants.service';
import { TokenCipher } from '../src/modules/tenants/token-cipher.service';

describe('Tenants integration', () => {
  let db: TestDb;
  let svc: TenantsService;

  beforeAll(async () => {
    db = await startTestDb();
    svc = new TenantsService(
      db.ds.getRepository(TenantEntity),
      new TokenCipher(process.env.APP_ENCRYPTION_KEY!),
    );
  });

  afterAll(async () => {
    await db.stop();
  });

  it('persists and retrieves a tenant with encrypted token', async () => {
    const t = await svc.create({
      salonName: 'Real',
      locationId: 198823,
      altegioToken: 'abc123',
      timezone: 'Asia/Almaty',
    });
    const found = await svc.findByLocation(198823);
    expect(found?.id).toBe(t.id);
    expect(await svc.getAltegioToken(t.id)).toBe('abc123');
  });

  it('enforces UNIQUE(location_id)', async () => {
    await svc.create({ salonName: 'A', locationId: 111, altegioToken: 't', timezone: 'Asia/Almaty' });
    await expect(
      svc.create({ salonName: 'B', locationId: 111, altegioToken: 't', timezone: 'Asia/Almaty' }),
    ).rejects.toThrow(/duplicate key/);
  });
});
