import { StaffParser } from './staff.parser';

describe('StaffParser', () => {
  const p = new StaffParser();
  it('maps position.title and normalizes fired flag', () => {
    const row = p.toRow('t', { id: 1, name: 'A', fired: 1, position: { id: 2, title: 'Senior' } } as any);
    expect(row).toMatchObject({ name: 'A', fired: true, positionTitle: 'Senior' });
  });
  it('defaults bookable to true when undefined', () => {
    const row = p.toRow('t', { id: 1, name: 'A', fired: 0 } as any);
    expect(row.bookable).toBe(true);
  });
});
