import { IAnthropicAdapter, AiInsightService, buildPrompt } from './ai-insight.service';
import { DailyReportData } from '@altegio/shared';
import { baseFixture } from './__fixtures__/report-data';

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

/** Minimal fixture: nullable fields all null, so we can test null-skipping too */
const minimalFixture: DailyReportData = {
  salonName: 'Test Salon',
  timezone: 'Asia/Almaty',
  yesterday: {
    date: '2026-04-19',
    revenue: 100_000,
    avg7: null,
    deltaPct: null,
    came: 10,
    cancelled: 3,
    avgCheck: null,
    utilizationPct: null,
    monthlyGoalPct: null,
    monthlyGoalTarget: null,
    monthlyGoalMtd: null,
    monthlyGoalExpectedMtd: null,
    monthlyGoalManual: false,
    topStaff: [],
    noShow: { count: 0, lostRevenue: 0 },
    retention: { newClients: 0, returningClients: 0, newPct: null, returningPct: null },
    dynamics: {
      week: { value: 0, prev: 0, deltaPct: null },
      month: { value: 0, prev: 0, deltaPct: null },
    },
    sources: [],
    aiInsight: null,
  },
  today: {
    date: '2026-04-20',
    scheduled: 5,
    utilizationPct: null,
    categories: [],
  },
};

describe('AiInsightService', () => {
  it('returns text when model produces short plausible insight', async () => {
    const svc = new AiInsightService(
      fakeAdapter('Загрузка вчера составила 64 процента.'),
      repo() as any,
      { enabled: true },
    );
    expect(await svc.getInsight('tenant-uuid-1', baseFixture)).toMatch(/Загрузка/);
  });

  it('returns null on timeout', async () => {
    const svc = new AiInsightService(
      fakeAdapter('too late', 200),
      repo() as any,
      { enabled: true, timeoutMs: 50 },
    );
    expect(await svc.getInsight('tenant-uuid-1', baseFixture)).toBeNull();
  });

  it('rejects responses longer than 280 chars', async () => {
    const svc = new AiInsightService(
      fakeAdapter('а'.repeat(500)),
      repo() as any,
      { enabled: true },
    );
    expect(await svc.getInsight('tenant-uuid-1', baseFixture)).toBeNull();
  });

  it('rejects responses with fabricated numbers', async () => {
    const svc = new AiInsightService(
      fakeAdapter('Выручка составила 99999 ₸.'),
      repo() as any,
      { enabled: true },
    );
    expect(await svc.getInsight('tenant-uuid-1', baseFixture)).toBeNull();
  });

  it('returns null when disabled', async () => {
    const svc = new AiInsightService(
      fakeAdapter('anything'),
      repo() as any,
      { enabled: false },
    );
    expect(await svc.getInsight('tenant-uuid-1', baseFixture)).toBeNull();
  });
});

describe('buildPrompt', () => {
  it('includes Загрузка and План месяца when utilizationPct and monthlyGoalPct are non-null', () => {
    const prompt = buildPrompt(baseFixture);
    expect(prompt).toContain('Загрузка вчера');
    expect(prompt).toContain('Темп выполнения плана');
  });

  it('includes today utilization when non-null', () => {
    const prompt = buildPrompt(baseFixture);
    expect(prompt).toContain('Загрузка на сегодня');
  });

  it('includes today categories when present', () => {
    const prompt = buildPrompt(baseFixture);
    expect(prompt).toContain('Маникюр');
    expect(prompt).toContain('Аппараты');
  });

  it('skips Загрузка and План месяца lines when those fields are null', () => {
    const prompt = buildPrompt(minimalFixture);
    expect(prompt).not.toContain('Загрузка вчера');
    expect(prompt).not.toContain('Темп выполнения плана');
  });

  it('includes salon name and timezone', () => {
    const prompt = buildPrompt(baseFixture);
    expect(prompt).toContain('Салон №1, Алматы');
    expect(prompt).toContain('Asia/Almaty');
  });

  it('includes top staff entries', () => {
    const prompt = buildPrompt(baseFixture);
    expect(prompt).toContain('Оксана Гарифзянова');
    expect(prompt).toContain('Гульнара');
  });
});
