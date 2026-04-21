import { ReportsService } from './reports.service';
import { DailyReportData } from '@altegio/shared';

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
  let fakeTelegram: { sendReport: jest.Mock };
  let fakeTenants: { findById: jest.Mock };
  let fakeDeliveries: { findOne: jest.Mock; upsert: jest.Mock };

  beforeEach(() => {
    fakeMetrics = { getDailyReportData: jest.fn().mockResolvedValue(data) };
    fakeAi = { getInsight: jest.fn() };
    fakeTelegram = { sendReport: jest.fn() };
    fakeTenants = { findById: jest.fn() };
    fakeDeliveries = { findOne: jest.fn(), upsert: jest.fn() };
  });

  it('appends insight when AI returns text', async () => {
    fakeAi.getInsight.mockResolvedValue('Главный факт.');
    const svc = new ReportsService(fakeMetrics as any, fakeAi as any, fakeTelegram as any, fakeTenants as any, fakeDeliveries as any);
    const text = await svc.buildText('t', '2026-04-20');
    expect(text).toContain('💡 Главный инсайт');
    expect(text).toContain('Главный факт.');
  });

  it('falls back gracefully when AI returns null', async () => {
    fakeAi.getInsight.mockResolvedValue(null);
    const svc = new ReportsService(fakeMetrics as any, fakeAi as any, fakeTelegram as any, fakeTenants as any, fakeDeliveries as any);
    const text = await svc.buildText('t', '2026-04-20');
    expect(text).not.toContain('Главный инсайт');
  });

  describe('generateAndDeliver', () => {
    beforeEach(() => {
      fakeMetrics.getDailyReportData.mockResolvedValue(data);
      fakeAi.getInsight.mockResolvedValue(null);
    });

    it('skips when report already sent', async () => {
      fakeDeliveries.findOne.mockResolvedValue({ status: 'sent' });
      const svc = new ReportsService(fakeMetrics as any, fakeAi as any, fakeTelegram as any, fakeTenants as any, fakeDeliveries as any);
      await svc.generateAndDeliver('t', '2026-04-20');
      expect(fakeTelegram.sendReport).not.toHaveBeenCalled();
      expect(fakeDeliveries.upsert).not.toHaveBeenCalled();
    });

    it('throws when tenant has no chat id', async () => {
      fakeDeliveries.findOne.mockResolvedValue(null);
      fakeTenants.findById.mockResolvedValue({ id: 't', salonName: 'S', telegramChatId: null });
      const svc = new ReportsService(fakeMetrics as any, fakeAi as any, fakeTelegram as any, fakeTenants as any, fakeDeliveries as any);
      await expect(svc.generateAndDeliver('t', '2026-04-20')).rejects.toThrow(/no telegram_chat_id/);
    });

    it('sends and records success', async () => {
      fakeDeliveries.findOne.mockResolvedValue(null);
      fakeTenants.findById.mockResolvedValue({ id: 't', salonName: 'S', telegramChatId: 12345 });
      fakeTelegram.sendReport.mockResolvedValue({ messageId: 99 });
      const svc = new ReportsService(fakeMetrics as any, fakeAi as any, fakeTelegram as any, fakeTenants as any, fakeDeliveries as any);
      await svc.generateAndDeliver('t', '2026-04-20');
      expect(fakeTelegram.sendReport).toHaveBeenCalledWith(12345, expect.any(String));
      expect(fakeDeliveries.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 't', date: '2026-04-19', messageId: 99, status: 'sent' }),
        ['tenantId', 'date'],
      );
    });

    it('records failure when telegram throws', async () => {
      fakeDeliveries.findOne.mockResolvedValue(null);
      fakeTenants.findById.mockResolvedValue({ id: 't', salonName: 'S', telegramChatId: 12345 });
      fakeTelegram.sendReport.mockRejectedValue(new Error('boom'));
      const svc = new ReportsService(fakeMetrics as any, fakeAi as any, fakeTelegram as any, fakeTenants as any, fakeDeliveries as any);
      await expect(svc.generateAndDeliver('t', '2026-04-20')).rejects.toThrow('boom');
      expect(fakeDeliveries.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 't', status: 'failed', error: expect.stringContaining('boom') }),
        ['tenantId', 'date'],
      );
    });
  });
});
