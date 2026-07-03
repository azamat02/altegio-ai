import { ClientsParser } from './clients.parser';

const p = new ClientsParser();
const T = 'tenant-1';

describe('ClientsParser (search endpoint shape)', () => {
  it('maps sold_amount to spent and trims datetime to a date', () => {
    const row = p.toRow(T, {
      id: 31396661,
      name: 'Зарина',
      phone: '+77019859510',
      visits_count: 648,
      last_visit_date: '2026-06-13 12:00:00',
      sold_amount: 15636614.02,
    });
    expect(row).toEqual({
      tenantId: T,
      altegioClientId: 31396661,
      name: 'Зарина',
      phone: '+77019859510',
      visitsCount: 648,
      lastVisitDate: '2026-06-13',
      spent: 15636614.02,
    });
  });

  it('normalizes empty-string last_visit_date to null', () => {
    const row = p.toRow(T, { id: 1, visits_count: 0, last_visit_date: '', sold_amount: 0 });
    expect(row.lastVisitDate).toBeNull();
    expect(row.visitsCount).toBe(0);
    expect(row.spent).toBe(0);
  });

  it('normalizes zero-dates and garbage to null', () => {
    expect(p.toRow(T, { id: 1, last_visit_date: '0000-00-00 00:00:00' }).lastVisitDate).toBeNull();
    expect(p.toRow(T, { id: 1, last_visit_date: 'not-a-date' }).lastVisitDate).toBeNull();
  });

  it('falls back to spent when sold_amount is absent (legacy raw payloads)', () => {
    expect(p.toRow(T, { id: 1, spent: 500 }).spent).toBe(500);
    expect(p.toRow(T, { id: 1 }).spent).toBeNull();
  });
});
