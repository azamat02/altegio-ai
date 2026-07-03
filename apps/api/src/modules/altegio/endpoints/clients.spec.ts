import { ClientsEndpoint } from './clients';
import type { AltegioAuthContext } from '../types';

const auth: AltegioAuthContext = { partnerToken: 'p', userToken: 'u', locationId: 198823 };

function makeClient(pages: Array<any[]>, totalCount: number) {
  let call = 0;
  const post = jest.fn(async () => ({
    success: true,
    data: pages[call++] ?? [],
    meta: { total_count: totalCount },
  }));
  return { post, client: { post } as any };
}

describe('ClientsEndpoint (search API)', () => {
  it('searchPage POSTs to the search endpoint with page, page_size and fields', async () => {
    const { post, client } = makeClient([[{ id: 1 }]], 1);
    const ep = new ClientsEndpoint(client);
    const res = await ep.searchPage(auth, 2, 100);
    expect(post).toHaveBeenCalledWith(auth, '/company/198823/clients/search', {
      page: 2,
      page_size: 100,
      fields: ['id', 'name', 'phone', 'email', 'visits_count', 'last_visit_date', 'sold_amount'],
    });
    expect(res).toEqual({ clients: [{ id: 1 }], totalCount: 1 });
  });

  it('fetchAll pages until a short page and yields each batch', async () => {
    const page1 = Array.from({ length: 200 }, (_, i) => ({ id: i + 1 }));
    const page2 = [{ id: 201 }];
    const { post, client } = makeClient([page1, page2], 201);
    const ep = new ClientsEndpoint(client);
    const batches: any[][] = [];
    for await (const b of ep.fetchAll(auth)) batches.push(b);
    expect(batches.length).toBe(2);
    expect(batches[0].length).toBe(200);
    expect(batches[1]).toEqual(page2);
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('fetchAll stops immediately on an empty first page', async () => {
    const { post, client } = makeClient([[]], 0);
    const ep = new ClientsEndpoint(client);
    const batches: any[][] = [];
    for await (const b of ep.fetchAll(auth)) batches.push(b);
    expect(batches).toEqual([]);
    expect(post).toHaveBeenCalledTimes(1);
  });
});
