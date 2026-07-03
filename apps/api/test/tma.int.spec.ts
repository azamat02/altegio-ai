import * as crypto from 'crypto';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TestDb, startTestDb } from './helpers/test-db';
import { TenantEntity } from '../src/modules/tenants/tenant.entity';
import { TenantsService } from '../src/modules/tenants/tenants.service';
import { TokenCipher } from '../src/modules/tenants/token-cipher.service';
import { MetricsService } from '../src/modules/metrics/metrics.service';
import { TenantChatsService } from '../src/modules/telegram-bot/tenant-chats.service';
import { TenantChatEntity } from '../src/modules/telegram-bot/entities/tenant-chat.entity';
import { TmaController } from '../src/modules/tma/tma.controller';
import { TmaService } from '../src/modules/tma/tma.service';
import { TmaAuthGuard } from '../src/modules/tma/tma-auth.guard';
import { getDataSourceToken } from '@nestjs/typeorm';

const BOT_TOKEN = '123:ABC';
function sign(userId: number): string {
  const now = Math.floor(Date.now() / 1000);
  const fields = { auth_date: String(now), user: JSON.stringify({ id: userId }) };
  const dataCheck = Object.keys(fields).sort().map((k) => `${k}=${(fields as any)[k]}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const hash = crypto.createHmac('sha256', secret).update(dataCheck).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

describe('TMA endpoints (int)', () => {
  let app: INestApplication; let db: TestDb; let tenantId: string;

  beforeAll(async () => {
    process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;
    db = await startTestDb();
    const tenants = new TenantsService(db.ds.getRepository(TenantEntity), new TokenCipher(process.env.APP_ENCRYPTION_KEY!));
    const t = await tenants.create({ salonName: 'S', locationId: 3, altegioToken: 'x', timezone: 'UTC' });
    tenantId = t.id;
    await db.ds.query(`INSERT INTO tenant_chats (tenant_id, chat_id, role, subscribed) VALUES ($1, 42, 'owner', true)`, [tenantId]);
    await db.ds.query(`INSERT INTO staff (tenant_id, altegio_staff_id, name, fired, bookable) VALUES ($1, 1, 'Alice', false, true)`, [tenantId]);
    await db.ds.query(
      `INSERT INTO records (tenant_id, altegio_record_id, altegio_staff_id, altegio_client_id, datetime, seance_length, cost, attendance, paid_full, is_online, deleted) VALUES
       ($1, 1, 1, 100, '2026-06-10 10:00+00', 3600, 10000, 1, 1, false, false)`, [tenantId]);

    const mod = await Test.createTestingModule({
      controllers: [TmaController],
      providers: [
        TmaService,
        TmaAuthGuard,
        MetricsService,
        TenantsService,
        TenantChatsService,
        { provide: TokenCipher, useValue: new TokenCipher(process.env.APP_ENCRYPTION_KEY!) },
        { provide: getDataSourceToken(), useValue: db.ds },
        { provide: getRepositoryToken(TenantEntity), useValue: db.ds.getRepository(TenantEntity) },
        { provide: getRepositoryToken(TenantChatEntity), useValue: db.ds.getRepository(TenantChatEntity) },
      ],
    }).compile();
    app = mod.createNestApplication();
    await app.init();
  }, 60000);
  afterAll(async () => { await app.close(); await db.stop(); });

  it('401 without auth header', async () => {
    await request(app.getHttpServer()).get('/tma/staff?from=2026-06-01&to=2026-06-30').expect(401);
  });

  it('returns the staff table for the authed tenant', async () => {
    const res = await request(app.getHttpServer())
      .get('/tma/staff?from=2026-06-01&to=2026-06-30')
      .set('Authorization', `tma ${sign(42)}`)
      .expect(200);
    expect(res.body[0]).toMatchObject({ name: 'Alice', revenue: 10000, visits: 1 });
  });

  it('returns a summary', async () => {
    const res = await request(app.getHttpServer())
      .get('/tma/summary?date=2026-06-10')
      .set('Authorization', `tma ${sign(42)}`)
      .expect(200);
    expect(res.body.salonName).toBe('S');
    expect(Array.isArray(res.body.revenue30d)).toBe(true);
    expect(res.body.date).toBe('2026-06-10');
    expect(res.body.revenue).toBe(10000);
  });

  it('returns a staff trend', async () => {
    const res = await request(app.getHttpServer())
      .get('/tma/staff/1/trend?days=5')
      .set('Authorization', `tma ${sign(42)}`)
      .expect(200);
    expect(res.body.series).toHaveLength(5);
  });

  it('staff?compare=1 returns rows+totals with prev window', async () => {
    const res = await request(app.getHttpServer())
      .get('/tma/staff?from=2026-06-08&to=2026-06-14&compare=1')
      .set('Authorization', `tma ${sign(42)}`)
      .expect(200);
    expect(res.body.rows[0]).toMatchObject({ name: 'Alice', revenue: 10000, prevRevenue: 0, deltaPct: null });
    expect(res.body.totals).toMatchObject({ revenue: 10000, prevRevenue: 0, deltaPct: null });
  });

  it('summary carries dynamics through', async () => {
    const res = await request(app.getHttpServer())
      .get('/tma/summary?date=2026-06-10')
      .set('Authorization', `tma ${sign(42)}`)
      .expect(200);
    expect(res.body.dynamics).toEqual(
      expect.objectContaining({ week: expect.any(Object), month: expect.any(Object) }),
    );
  });

  it('staff/:id/detail returns the composed detail', async () => {
    const res = await request(app.getHttpServer())
      .get('/tma/staff/1/detail?from=2026-06-08&to=2026-06-14')
      .set('Authorization', `tma ${sign(42)}`)
      .expect(200);
    expect(res.body).toMatchObject({ staffId: 1, name: 'Alice', revenue: 10000, visits: 1 });
    expect(res.body.trend).toHaveLength(30);
    expect(Array.isArray(res.body.services)).toBe(true);
  });

  it('staff/:id/detail 404s for unknown staff', async () => {
    await request(app.getHttpServer())
      .get('/tma/staff/999/detail?from=2026-06-08&to=2026-06-14')
      .set('Authorization', `tma ${sign(42)}`)
      .expect(404);
  });

  it('losses returns four blocks and an annual total', async () => {
    const res = await request(app.getHttpServer())
      .get('/tma/losses?from=2026-06-08&to=2026-06-14')
      .set('Authorization', `tma ${sign(42)}`)
      .expect(200);
    expect(res.body.periodDays).toBe(7);
    for (const k of ['cancellations', 'noShow', 'idle', 'churn']) {
      expect(res.body[k]).toMatchObject({ period: expect.any(Number), annual: expect.any(Number) });
    }
    expect(res.body.churn.returnRatePct).toBe(30);
    expect(typeof res.body.totalAnnual).toBe('number');
  });

  it('clients whitelists sleepingDays and returns lists', async () => {
    const res = await request(app.getHttpServer())
      .get('/tma/clients?sleepingDays=45') // invalid → falls back to 60
      .set('Authorization', `tma ${sign(42)}`)
      .expect(200);
    expect(Array.isArray(res.body.sleeping)).toBe(true);
    expect(Array.isArray(res.body.top)).toBe(true);
    expect(typeof res.body.totalClients).toBe('number');
  });
});
