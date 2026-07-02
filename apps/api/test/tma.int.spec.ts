import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { TmaModule } from '../src/modules/tma/tma.module';

describe('TMA controller (int)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [TmaModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
  });
  afterAll(async () => { await app.close(); });

  it('GET /tma/ping returns ok', async () => {
    const res = await request(app.getHttpServer()).get('/tma/ping').expect(200);
    expect(res.body).toEqual({ ok: true });
  });
});
