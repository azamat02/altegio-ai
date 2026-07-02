import { parseNavCallback } from '../utils/keyboards';

describe('parseNavCallback', () => {
  it('parses a valid report nav', () => {
    expect(parseNavCallback('report:nav:2026-07-01:t1')).toEqual({ kind: 'report', date: '2026-07-01', tenantId: 't1' });
  });
  it('rejects the tenant-picker shape', () => {
    expect(parseNavCallback('report:2026-07-01:t1')).toBeNull();
  });
});
