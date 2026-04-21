import type { CreateTenantInput } from './tenants.service';
import { TenantsService } from './tenants.service';
import { TokenCipher } from './token-cipher.service';
import type { Repository } from 'typeorm';
import type { TenantEntity } from './tenant.entity';

function repoMock() {
  const store = new Map<string, TenantEntity>();
  return {
    create: jest.fn((data: Partial<TenantEntity>) => ({ ...data }) as TenantEntity),
    save: jest.fn(async (t: TenantEntity) => {
      t.id = t.id ?? 'uuid-' + store.size;
      store.set(t.id, t);
      return t;
    }),
    findOne: jest.fn(async ({ where }: any) =>
      [...store.values()].find((t) =>
        Object.entries(where).every(([k, v]) => (t as any)[k] === v),
      ) ?? null,
    ),
    find: jest.fn(async ({ where }: any) =>
      [...store.values()].filter((t) =>
        Object.entries(where).every(([k, v]) => (t as any)[k] === v),
      ),
    ),
    update: jest.fn(async (where: any, patch: any) => {
      for (const t of store.values()) {
        if (Object.entries(where).every(([k, v]) => (t as any)[k] === v)) {
          Object.assign(t, patch);
        }
      }
      return { affected: 1 };
    }),
    _store: store,
  } as unknown as Repository<TenantEntity> & { _store: Map<string, TenantEntity> };
}

describe('TenantsService', () => {
  const cipher = new TokenCipher('a'.repeat(64));

  function make() {
    const repo = repoMock();
    return { repo, svc: new TenantsService(repo, cipher) };
  }

  it('creates a tenant and encrypts the token at rest', async () => {
    const { repo, svc } = make();
    const input: CreateTenantInput = {
      salonName: 'Test',
      locationId: 198823,
      altegioToken: 'plaintext',
      timezone: 'Asia/Almaty',
    };
    const t = await svc.create(input);
    expect(t.salonName).toBe('Test');
    const stored = [...(repo as any)._store.values()][0] as TenantEntity;
    expect(stored.altegioTokenEncrypted).toBeInstanceOf(Buffer);
    expect(stored.altegioTokenEncrypted.toString()).not.toContain('plaintext');
  });

  it('returns decrypted token via getAltegioToken', async () => {
    const { svc } = make();
    const t = await svc.create({
      salonName: 'T', locationId: 1, altegioToken: 'secret', timezone: 'Asia/Almaty',
    });
    expect(await svc.getAltegioToken(t.id)).toBe('secret');
  });

  it('findEnabled returns only tenants with report_enabled=true', async () => {
    const { svc } = make();
    const a = await svc.create({ salonName: 'A', locationId: 1, altegioToken: 't', timezone: 'Asia/Almaty' });
    const b = await svc.create({ salonName: 'B', locationId: 2, altegioToken: 't', timezone: 'Asia/Almaty' });
    await svc.setReportEnabled(b.id, true);
    const enabled = await svc.findEnabled();
    expect(enabled.map((t: TenantEntity) => t.id)).toEqual([b.id]);
    void a;
  });
});
