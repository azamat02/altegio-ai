import nock from 'nock';
import { AltegioClient } from './altegio.client';

describe('AltegioClient', () => {
  const base = 'https://api.alteg.io/api/v1';
  const auth = { partnerToken: 'partner_xyz', locationId: 198823 };

  afterEach(() => nock.cleanAll());

  it('sends Authorization header with Bearer partner token', async () => {
    const scope = nock(base, {
      reqheaders: {
        authorization: 'Bearer partner_xyz',
        accept: 'application/vnd.api.v2+json',
      },
    })
      .get('/records/198823')
      .query(true)
      .reply(200, { success: true, data: [] });

    const c = new AltegioClient({ baseUrl: base, requestsPerSecond: 10 });
    const res = await c.get<{ success: boolean; data: unknown[] }>(auth, '/records/198823', { page: 1 });
    expect(res.success).toBe(true);
    expect(res.data).toEqual([]);
    scope.done();
  });

  it('retries 500 errors up to 3 times', async () => {
    const scope = nock(base)
      .get('/records/198823').query(true).reply(500)
      .get('/records/198823').query(true).reply(500)
      .get('/records/198823').query(true).reply(200, { success: true, data: [{ id: 1 }] });

    const c = new AltegioClient({ baseUrl: base, requestsPerSecond: 100, retries: 3 });
    const res = await c.get<{ success: boolean; data: { id: number }[] }>(auth, '/records/198823');
    expect(res.data).toEqual([{ id: 1 }]);
    scope.done();
  });

  it('does NOT retry 400', async () => {
    nock(base).get('/records/198823').query(true).reply(400, { success: false });
    const c = new AltegioClient({ baseUrl: base, requestsPerSecond: 100 });
    await expect(c.get(auth, '/records/198823')).rejects.toThrow();
  });

  it('includes User token when userToken provided', async () => {
    const scope = nock(base, {
      reqheaders: {
        authorization: 'Bearer partner_xyz, User user_abc',
      },
    })
      .get('/records/198823')
      .query(true)
      .reply(200, { success: true, data: [] });

    const c = new AltegioClient({ baseUrl: base, requestsPerSecond: 10 });
    await c.get({ partnerToken: 'partner_xyz', userToken: 'user_abc', locationId: 198823 }, '/records/198823');
    scope.done();
  });
});
