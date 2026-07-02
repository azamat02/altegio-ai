// apps/api/src/modules/tma/tma-compare.spec.ts
import { TmaService } from './tma.service';
import type { StaffTableRow } from '@altegio/shared';

const row = (staffId: number, name: string, revenue: number): StaffTableRow => ({
  staffId, name, revenue, visits: 1, avgCheck: revenue, cancelPct: 0,
  utilizationPct: null, newClients: 0, revenuePerHour: 0,
});

describe('TmaService.staffCompare', () => {
  function svc(cur: StaffTableRow[], prev: StaffTableRow[]) {
    const metrics = { staffTable: jest.fn().mockResolvedValueOnce(cur).mockResolvedValueOnce(prev) };
    const tenants = { findById: jest.fn().mockResolvedValue({ timezone: 'UTC' }) };
    return { s: new TmaService(metrics as any, tenants as any), metrics };
  }

  it('merges prev revenue and computes deltas + totals', async () => {
    const { s, metrics } = svc(
      [row(1, 'Алиса', 1200), row(2, 'Боб', 500)],
      [row(1, 'Алиса', 1000), row(3, 'Ушедшая', 300)],
    );
    const res = await s.staffCompare('t1', '2026-06-24', '2026-06-30');
    expect(metrics.staffTable).toHaveBeenNthCalledWith(1, 't1', '2026-06-24', '2026-06-30', 'UTC');
    expect(metrics.staffTable).toHaveBeenNthCalledWith(2, 't1', '2026-06-17', '2026-06-23', 'UTC');
    expect(res.rows[0]).toMatchObject({ staffId: 1, prevRevenue: 1000, deltaPct: 20 });
    expect(res.rows[1]).toMatchObject({ staffId: 2, prevRevenue: 0, deltaPct: null }); // «новый»
    expect(res.totals).toEqual({ revenue: 1700, prevRevenue: 1300, deltaPct: 31 });
  });

  it('totals delta is null when previous window is empty', async () => {
    const { s } = svc([row(1, 'Алиса', 100)], []);
    const res = await s.staffCompare('t1', '2026-07-01', '2026-07-01');
    expect(res.totals).toEqual({ revenue: 100, prevRevenue: 0, deltaPct: null });
  });
});
