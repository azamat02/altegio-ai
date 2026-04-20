import { AiInsightService, IAnthropicAdapter } from './ai-insight.service';
import type { DailyReportData } from '@altegio/shared';

function fakeAdapter(response: string | Error, delayMs = 0): IAnthropicAdapter {
  return {
    generate: async () => {
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      if (response instanceof Error) throw response;
      return response;
    },
  };
}

function repo() {
  const saved: any[] = [];
  return {
    create: (x: any) => x,
    save: jest.fn(async (x: any) => { saved.push(x); return x; }),
    _saved: saved,
  } as any;
}

const sample: DailyReportData = {
  tenant: { id: 't', salonName: 'Test', timezone: 'Asia/Almaty' },
  date: '2026-04-19',
  yesterday: { revenue: 100000, visitsCompleted: 10, visitsCancelled: 3, avgCheck: 10000, cancelRate: 0.23, cancellationLoss: 30000 },
  baseline7d: { avgRevenue: 120000, avgVisits: 12, avgCancelRate: 0.15 },
  topStaff: [], strugglingStaff: [],
  today: { bookedCount: 5, occupancyPct: 40, emptySlots: [] },
  cancelClusters: [],
};

describe('AiInsightService', () => {
  it('returns text when model produces short plausible insight', async () => {
    const svc = new AiInsightService(
      fakeAdapter('Отмены выросли до 23 процентов.'),
      repo() as any,
      { enabled: true },
    );
    expect(await svc.getInsight(sample)).toMatch(/Отмены/);
  });

  it('returns null on timeout', async () => {
    const svc = new AiInsightService(
      fakeAdapter('too late', 200),
      repo() as any,
      { enabled: true, timeoutMs: 50 },
    );
    expect(await svc.getInsight(sample)).toBeNull();
  });

  it('rejects responses longer than 280 chars', async () => {
    const svc = new AiInsightService(
      fakeAdapter('а'.repeat(500)),
      repo() as any,
      { enabled: true },
    );
    expect(await svc.getInsight(sample)).toBeNull();
  });

  it('rejects responses with fabricated numbers', async () => {
    const svc = new AiInsightService(
      fakeAdapter('Выручка составила 99999 ₸.'),
      repo() as any,
      { enabled: true },
    );
    expect(await svc.getInsight(sample)).toBeNull();
  });

  it('returns null when disabled', async () => {
    const svc = new AiInsightService(
      fakeAdapter('anything'),
      repo() as any,
      { enabled: false },
    );
    expect(await svc.getInsight(sample)).toBeNull();
  });
});
