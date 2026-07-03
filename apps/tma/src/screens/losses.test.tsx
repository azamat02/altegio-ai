// apps/tma/src/screens/losses.test.tsx
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { LossesView } from './Losses';
import type { TmaLosses } from '@altegio/shared';

const data: TmaLosses = {
  periodDays: 30,
  annualized: true,
  cancellations: { count: 10, period: 300000, annual: 3650000 },
  noShow: { count: 5, period: 120000, annual: 1460000 },
  idle: { idleHours: 100, targetUtilizationPct: 80, period: 3000000, annual: 36500000 },
  churn: { newSleeping: 40, returnRatePct: 30, period: 360000, annual: 4380000 },
  totalPeriod: 3780000,
  totalAnnual: 45990000,
};

describe('LossesView', () => {
  it('renders the hero total, four blocks, the 30% assumption and the disclaimer', () => {
    const html = renderToString(<LossesView data={data} />);
    expect(html).toContain('46 млн ₸ в год');
    expect(html).toContain('Отмены');
    expect(html).toContain('Не пришли');
    expect(html).toContain('Простой');
    expect(html).toContain('Отток');
    expect(html).toContain('40 клиентов уснули за период');
    expect(html).toContain('30%');
    expect(html).toContain('до загрузки 80%');
    expect(html).toContain('не бухгалтерия');
  });

  it('short periods show period losses without annual projections', () => {
    const short: TmaLosses = {
      ...data,
      periodDays: 2,
      annualized: false,
      cancellations: { count: 10, period: 300000, annual: null },
      noShow: { count: 5, period: 120000, annual: null },
      idle: { ...data.idle, annual: null },
      churn: { ...data.churn, annual: null },
      totalAnnual: null,
    };
    const html = renderToString(<LossesView data={short} />);
    expect(html).toContain('за 2 дн.');
    expect(html).not.toContain('в год');
  });
});
