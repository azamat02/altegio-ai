import { ReportsService } from './reports.service';
import type { DailyReportData } from '@altegio/shared';

const data: DailyReportData = {
  tenant: { id: 't', salonName: 'S', timezone: 'UTC' },
  date: '2026-04-19',
  yesterday: { revenue: 0, visitsCompleted: 0, visitsCancelled: 0, avgCheck: 0, cancelRate: 0, cancellationLoss: 0 },
  baseline7d: { avgRevenue: 0, avgVisits: 0, avgCancelRate: 0 },
  topStaff: [], strugglingStaff: [],
  today: { bookedCount: 0, occupancyPct: 0, emptySlots: [] },
  cancelClusters: [],
};

describe('ReportsService', () => {
  let fakeMetrics: { getDailyReportData: jest.Mock };
  let fakeAi: { getInsight: jest.Mock };

  beforeEach(() => {
    fakeMetrics = { getDailyReportData: jest.fn().mockResolvedValue(data) };
    fakeAi = { getInsight: jest.fn() };
  });

  it('appends insight when AI returns text', async () => {
    fakeAi.getInsight.mockResolvedValue('Главный факт.');
    const svc = new ReportsService(fakeMetrics as any, fakeAi as any);
    const text = await svc.buildText('t', '2026-04-20');
    expect(text).toContain('💡 Главный инсайт');
    expect(text).toContain('Главный факт.');
  });

  it('falls back gracefully when AI returns null', async () => {
    fakeAi.getInsight.mockResolvedValue(null);
    const svc = new ReportsService(fakeMetrics as any, fakeAi as any);
    const text = await svc.buildText('t', '2026-04-20');
    expect(text).not.toContain('Главный инсайт');
  });
});
