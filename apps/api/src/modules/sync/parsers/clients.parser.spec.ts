import { ClientsParser } from './clients.parser';

describe('ClientsParser', () => {
  const p = new ClientsParser();
  it('maps fields with defaults for missing optionals', () => {
    const row = p.toRow('t', { id: 10 } as any);
    expect(row).toMatchObject({
      altegioClientId: 10, name: null, phone: null,
      visitsCount: null, lastVisitDate: null, spent: null,
    });
  });
  it('preserves provided fields', () => {
    const row = p.toRow('t', { id: 11, name: 'X', phone: '+7700', visits_count: 5, spent: 12000 } as any);
    expect(row).toMatchObject({ name: 'X', phone: '+7700', visitsCount: 5, spent: 12000 });
  });
});
