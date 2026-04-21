import { ReportsService } from './reports.service';
import { baseFixture } from './__fixtures__/report-data';

// Clone so tests can mutate aiInsight without affecting others
function cloneFixture() {
  return {
    ...baseFixture,
    yesterday: { ...baseFixture.yesterday },
    today: { ...baseFixture.today },
  };
}

function makeDeliveriesRepo() {
  return {
    findBy: jest.fn<Promise<any[]>, any[]>().mockResolvedValue([]),
    insert: jest.fn<Promise<void>, any[]>().mockResolvedValue(undefined),
  };
}

function makeSvc(overrides: {
  metrics?: any;
  ai?: any;
  telegram?: any;
  tenants?: any;
  deliveries?: any;
}) {
  const metrics = overrides.metrics ?? {
    buildDailyReportData: jest.fn().mockResolvedValue(cloneFixture()),
  };
  const ai = overrides.ai ?? {
    getInsight: jest.fn().mockResolvedValue(null),
  };
  const telegram = overrides.telegram ?? {
    sendReport: jest.fn().mockResolvedValue({ messageId: 1 }),
  };
  const tenants = overrides.tenants ?? {
    findById: jest.fn().mockResolvedValue({ id: 't-1', salonName: 'Салон №1', telegramChatId: 12345 }),
  };
  const deliveries = overrides.deliveries ?? makeDeliveriesRepo();

  const svc = new ReportsService(
    metrics as any,
    ai as any,
    telegram as any,
    tenants as any,
    deliveries as any,
  );

  return { svc, metrics, ai, telegram, tenants, deliveries };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('ReportsService.generateAndDeliver', () => {
  it('sends two messages and inserts two report_deliveries rows', async () => {
    const { svc, telegram, deliveries } = makeSvc({});
    await svc.generateAndDeliver('t-1', '2026-04-20');

    expect(telegram.sendReport).toHaveBeenCalledTimes(2);
    expect(deliveries.insert).toHaveBeenCalledTimes(2);

    const calls = deliveries.insert.mock.calls;
    expect(calls[0][0]).toMatchObject({ messageKind: 'yesterday', status: 'sent', tenantId: 't-1', date: '2026-04-19' });
    expect(calls[1][0]).toMatchObject({ messageKind: 'today', status: 'sent', tenantId: 't-1', date: '2026-04-19' });
  });

  it('is idempotent per kind — a pre-sent kind is skipped, the other still sends', async () => {
    const deliveries = makeDeliveriesRepo();
    // First findBy call (kind='yesterday') returns an existing row
    deliveries.findBy.mockResolvedValueOnce([{ tenantId: 't-1', date: '2026-04-19', messageKind: 'yesterday', status: 'sent' }]);
    // Second findBy call (kind='today') returns empty
    deliveries.findBy.mockResolvedValueOnce([]);

    const { svc, telegram } = makeSvc({ deliveries });
    await svc.generateAndDeliver('t-1', '2026-04-20');

    expect(telegram.sendReport).toHaveBeenCalledTimes(1);
    expect(deliveries.insert).toHaveBeenCalledTimes(1);
    expect(deliveries.insert).toHaveBeenCalledWith(expect.objectContaining({ messageKind: 'today' }));
  });

  it('records a failed delivery and re-throws on telegram error', async () => {
    const telegram = { sendReport: jest.fn().mockRejectedValue(new Error('tg 500')) };
    const { svc, deliveries } = makeSvc({ telegram });

    await expect(svc.generateAndDeliver('t-1', '2026-04-20')).rejects.toThrow('tg 500');

    expect(deliveries.insert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', error: expect.stringContaining('tg 500') }),
    );
  });

  it('throws when tenant not found', async () => {
    const tenants = { findById: jest.fn().mockResolvedValue(null) };
    const { svc } = makeSvc({ tenants });
    await expect(svc.generateAndDeliver('t-1', '2026-04-20')).rejects.toThrow(/not found/);
  });

  it('throws when tenant has no telegram_chat_id', async () => {
    const tenants = { findById: jest.fn().mockResolvedValue({ id: 't-1', salonName: 'S', telegramChatId: null }) };
    const { svc } = makeSvc({ tenants });
    await expect(svc.generateAndDeliver('t-1', '2026-04-20')).rejects.toThrow(/no telegram_chat_id/);
  });

  it('passes tenantId to ai.getInsight', async () => {
    const ai = { getInsight: jest.fn().mockResolvedValue(null) };
    const { svc } = makeSvc({ ai });
    await svc.generateAndDeliver('t-1', '2026-04-20');
    expect(ai.getInsight).toHaveBeenCalledWith('t-1', expect.any(Object));
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('ReportsService.buildMessages', () => {
  it('returns both rendered messages without sending', async () => {
    const telegram = { sendReport: jest.fn() };
    const deliveries = makeDeliveriesRepo();
    const { svc } = makeSvc({ telegram, deliveries });

    const out = await svc.buildMessages('t-1', '2026-04-20');

    expect(out.yesterday).toContain('☀');
    expect(out.today).toContain('📅 Сегодня');
    expect(telegram.sendReport).not.toHaveBeenCalled();
    expect(deliveries.insert).not.toHaveBeenCalled();
    expect(deliveries.findBy).not.toHaveBeenCalled();
  });

  it('includes AI insight in yesterday message when getInsight returns text', async () => {
    const ai = { getInsight: jest.fn().mockResolvedValue('Интересный факт.') };
    const { svc } = makeSvc({ ai });

    const out = await svc.buildMessages('t-1', '2026-04-20');
    expect(out.yesterday).toContain('💡 Главный инсайт');
    expect(out.yesterday).toContain('Интересный факт.');
  });

  it('passes tenantId to ai.getInsight', async () => {
    const ai = { getInsight: jest.fn().mockResolvedValue(null) };
    const { svc } = makeSvc({ ai });
    await svc.buildMessages('t-1', '2026-04-20');
    expect(ai.getInsight).toHaveBeenCalledWith('t-1', expect.any(Object));
  });
});
