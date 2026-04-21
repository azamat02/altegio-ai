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
    findOne: jest.fn<Promise<any | null>, any[]>().mockResolvedValue(null),
    save: jest.fn<Promise<any>, any[]>().mockImplementation((v) => Promise.resolve(v)),
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
  it('sends two messages and saves two report_deliveries rows', async () => {
    const { svc, telegram, deliveries } = makeSvc({});
    await svc.generateAndDeliver('t-1', '2026-04-20');

    expect(telegram.sendReport).toHaveBeenCalledTimes(2);
    expect(deliveries.save).toHaveBeenCalledTimes(2);

    const calls = deliveries.save.mock.calls;
    expect(calls[0][0]).toMatchObject({ messageKind: 'yesterday', status: 'sent', tenantId: 't-1', date: '2026-04-19' });
    expect(calls[1][0]).toMatchObject({ messageKind: 'today', status: 'sent', tenantId: 't-1', date: '2026-04-19' });
  });

  it('is idempotent per kind — a pre-sent kind is skipped, the other still sends', async () => {
    const deliveries = makeDeliveriesRepo();
    // First findOne call (kind='yesterday') returns an existing sent row → skip
    deliveries.findOne.mockResolvedValueOnce({ tenantId: 't-1', date: '2026-04-19', messageKind: 'yesterday', status: 'sent' });
    // Second findOne call (kind='today') returns null → send
    deliveries.findOne.mockResolvedValueOnce(null);

    const { svc, telegram } = makeSvc({ deliveries });
    await svc.generateAndDeliver('t-1', '2026-04-20');

    expect(telegram.sendReport).toHaveBeenCalledTimes(1);
    expect(deliveries.save).toHaveBeenCalledTimes(1);
    expect(deliveries.save).toHaveBeenCalledWith(expect.objectContaining({ messageKind: 'today' }));
  });

  it('records a failed delivery and re-throws on telegram error', async () => {
    const telegram = { sendReport: jest.fn().mockRejectedValue(new Error('tg 500')) };
    const { svc, deliveries } = makeSvc({ telegram });

    await expect(svc.generateAndDeliver('t-1', '2026-04-20')).rejects.toThrow('tg 500');

    expect(deliveries.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', error: expect.stringContaining('tg 500') }),
    );
  });

  it('retries successfully after a prior failed row', async () => {
    const deliveries = makeDeliveriesRepo();
    // Both findOne calls return null (failed rows do NOT block retries)
    deliveries.findOne.mockResolvedValue(null);

    const { svc, telegram } = makeSvc({ deliveries });
    await svc.generateAndDeliver('t-1', '2026-04-20');

    // Both messages should be sent
    expect(telegram.sendReport).toHaveBeenCalledTimes(2);
    // Both saved rows should have status='sent'
    const saves = deliveries.save.mock.calls.map((c: any[]) => c[0]);
    expect(saves.every((s: any) => s.status === 'sent')).toBe(true);
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
    expect(deliveries.save).not.toHaveBeenCalled();
    expect(deliveries.findOne).not.toHaveBeenCalled();
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
