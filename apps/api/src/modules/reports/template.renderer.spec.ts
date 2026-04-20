import { renderReport, buildAttention } from './template.renderer';
import { baseFixture as base } from './__fixtures__/report-data';
import type { DailyReportData } from '@altegio/shared';

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

describe('buildAttention rules matrix', () => {
  it('triggers cancel-spike bullet at 1.3x baseline', () => {
    const d: DailyReportData = {
      ...base,
      baseline7d: { ...base.baseline7d, avgCancelRate: 0.10 },
      yesterday: { ...base.yesterday, cancelRate: 0.14, visitsCancelled: 10, cancellationLoss: 300_000 },
    };
    expect(buildAttention(d)[0]).toMatch(/Рост отмен/);
  });

  it('does not trigger struggling bullet when list is empty', () => {
    const d: DailyReportData = { ...base, strugglingStaff: [] };
    expect(buildAttention(d).every((b) => !b.includes('день подряд'))).toBe(true);
  });

  it('triggers low-occupancy bullet below 40%', () => {
    const d: DailyReportData = {
      ...base,
      today: { ...base.today, occupancyPct: 25 },
    };
    expect(buildAttention(d)).toContain('Низкая загрузка сегодня');
  });

  it('caps bullets at 3', () => {
    const d: DailyReportData = {
      ...base,
      baseline7d: { ...base.baseline7d, avgCancelRate: 0.05 },
      yesterday: { ...base.yesterday, cancelRate: 0.5, visitsCancelled: 80, cancellationLoss: 9e6 },
      strugglingStaff: [
        { staffId: 1, name: 'X', consecutiveDaysBelowAvg: 2 },
        { staffId: 2, name: 'Y', consecutiveDaysBelowAvg: 2 },
      ],
      today: { ...base.today, occupancyPct: 20 },
    };
    expect(buildAttention(d).length).toBe(3);
  });
});
