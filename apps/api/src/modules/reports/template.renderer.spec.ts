import { renderReport, buildAttention } from './template.renderer';
import type { DailyReportData } from '@altegio/shared';

const base: DailyReportData = {
  tenant: { id: 't', salonName: 'Салон №1', timezone: 'Asia/Almaty' },
  date: '2026-04-19',
  yesterday: {
    revenue: 2_340_000, visitsCompleted: 148, visitsCancelled: 41,
    avgCheck: 35_818, cancelRate: 41 / 189, cancellationLoss: 1_400_000,
  },
  baseline7d: { avgRevenue: 2_088_000, avgVisits: 140, avgCancelRate: 0.16 },
  topStaff: [
    { staffId: 1, name: 'Айгуль', revenue: 420_000, visits: 11 },
    { staffId: 2, name: 'Данияр', revenue: 380_000, visits: 9 },
    { staffId: 3, name: 'Асель', revenue: 310_000, visits: 12 },
  ],
  strugglingStaff: [{ staffId: 10, name: 'Марат', consecutiveDaysBelowAvg: 2 }],
  today: { bookedCount: 87, occupancyPct: 61, emptySlots: ['14:00', '18:00', '19:00'] },
  cancelClusters: [{ staffName: 'Айгуль', hour: 16, count: 6 }],
};

describe('renderReport', () => {
  it('renders the happy-path template with all sections', () => {
    const txt = renderReport(base);
    expect(txt).toContain('☀ Доброе утро!');
    expect(txt).toContain('Салон №1');
    expect(txt).toContain('Выручка:');
    expect(txt).toContain('2\u00a0340\u00a0000 ₸');
    expect(txt).toContain('+12% к среднему за неделю');
    expect(txt).toContain('🏆 Топ-3 мастера');
    expect(txt).toContain('1. Айгуль — 420\u00a0000 ₸ (11 визитов)');
    expect(txt).toContain('⚠ Требует внимания');
    expect(txt).toContain('📅 Сегодня');
    expect(txt).toContain('87 записей, загрузка 61%');
    expect(txt).toContain('Пустые слоты: 14:00, 18:00, 19:00');
  });

  it('hides attention section when no rule triggers', () => {
    const quiet: DailyReportData = {
      ...base,
      yesterday: { ...base.yesterday, cancelRate: 0.15, cancellationLoss: 50_000 },
      strugglingStaff: [],
      today: { ...base.today, occupancyPct: 70 },
    };
    expect(renderReport(quiet)).not.toContain('⚠ Требует внимания');
  });

  it('omits delta text when |delta| < 3%', () => {
    const close: DailyReportData = { ...base, baseline7d: { ...base.baseline7d, avgRevenue: base.yesterday.revenue * 1.01 } };
    const txt = renderReport(close);
    const line = txt.split('\n').find((l: string) => l.startsWith('• Выручка'))!;
    expect(line).not.toMatch(/[+−]\d+%/);
  });

  it('shows "визитов не было" on empty days', () => {
    const empty: DailyReportData = {
      ...base,
      yesterday: { revenue: 0, visitsCompleted: 0, visitsCancelled: 0, avgCheck: 0, cancelRate: 0, cancellationLoss: 0 },
      topStaff: [],
    };
    expect(renderReport(empty)).toContain('визитов не было');
  });

  it('drops empty-slots line when none', () => {
    const noSlots: DailyReportData = { ...base, today: { ...base.today, emptySlots: [] } };
    const txt = renderReport(noSlots);
    expect(txt).not.toContain('Пустые слоты:');
  });
});
