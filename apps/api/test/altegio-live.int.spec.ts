/**
 * Live smoke test — runs only when ALTEGIO_LIVE_TEST=1 is set.
 * Used once to capture initial fixtures from the BrowUp partner token.
 *
 * Altegio API requires: Authorization: Bearer <partner_token>, User <user_token>
 * The AltegioClient currently only sends the partner token.
 * We make direct axios requests here so we can pass both tokens.
 */
import axios from 'axios';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RUN = process.env.ALTEGIO_LIVE_TEST === '1';
const describeOrSkip = RUN ? describe : describe.skip;

const BASE = 'https://api.alteg.io/api/v1';
const LOCATION_ID = 198823;

function makeHeaders(partnerToken: string, userToken?: string) {
  let auth = `Bearer ${partnerToken}`;
  if (userToken) auth += `, User ${userToken}`;
  return {
    Authorization: auth,
    Accept: 'application/vnd.api.v2+json',
  };
}

async function get<T>(path: string, params: Record<string, unknown> = {}): Promise<T> {
  const partnerToken = process.env.ALTEGIO_PARTNER_TOKEN!;
  const userToken = process.env.ALTEGIO_USER_TOKEN;
  const res = await axios.get<T>(`${BASE}${path}`, {
    params,
    headers: makeHeaders(partnerToken, userToken),
    timeout: 30_000,
  });
  return res.data;
}

describeOrSkip('Altegio live smoke', () => {
  it('captures fixtures', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const fromDate = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const fixturesDir = join(__dirname, 'fixtures/altegio');

    // Records (last 30 days, up to 50)
    type RecordsResp = { success: boolean; data: unknown[] };
    const recsResp = await get<RecordsResp>(`/records/${LOCATION_ID}`, {
      start_date: fromDate,
      end_date: today,
      page: 1,
      count: 50,
      include_finance_transactions: 1,
    });
    const recs = recsResp.data ?? [];

    // Staff
    type StaffResp = { success: boolean; data: unknown[] };
    const stfResp = await get<StaffResp>(`/staff/${LOCATION_ID}`);
    const stf = stfResp.data ?? [];

    // Services
    type ServicesResp = { success: boolean; data: unknown[] };
    const svcResp = await get<ServicesResp>(`/company/${LOCATION_ID}/services/`);
    const svc = svcResp.data ?? [];

    // Clients
    type ClientsResp = { success: boolean; data: unknown[] };
    const cliResp = await get<ClientsResp>(`/clients/${LOCATION_ID}`, { page: 1, count: 50 });
    const cli = cliResp.data ?? [];

    writeFileSync(join(fixturesDir, 'records-sample.json'), JSON.stringify(recs, null, 2));
    writeFileSync(join(fixturesDir, 'staff-sample.json'), JSON.stringify(stf, null, 2));
    writeFileSync(join(fixturesDir, 'services-sample.json'), JSON.stringify(svc, null, 2));
    writeFileSync(join(fixturesDir, 'clients-sample.json'), JSON.stringify(cli, null, 2));

    console.log(`Records: ${recs.length}, Staff: ${stf.length}, Services: ${svc.length}, Clients: ${cli.length}`);
    expect(recs.length).toBeGreaterThan(0);
  }, 60_000);
});
