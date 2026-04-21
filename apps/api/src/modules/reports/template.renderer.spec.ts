import { renderYesterdayMessage, renderTodayMessage } from './template.renderer';
import { baseFixture } from './__fixtures__/report-data';
import { DailyReportData } from '@altegio/shared';

// ─── Helpers ────────────────────────────────────────────────────────────────

function withY(patch: Partial<DailyReportData['yesterday']>): DailyReportData {
  return { ...baseFixture, yesterday: { ...baseFixture.yesterday, ...patch } };
}

function withT(patch: Partial<DailyReportData['today']>): DailyReportData {
  return { ...baseFixture, today: { ...baseFixture.today, ...patch } };
}

// ─── Yesterday ──────────────────────────────────────────────────────────────

describe('renderYesterdayMessage', () => {
  it('full happy path: cancellations > 0, goal available, insight present', () => {
    const txt = renderYesterdayMessage(baseFixture);
    expect(txt).toMatchInlineSnapshot(`
"☀ Доброе утро! Салон №1, Алматы
📊 Вчера · Вс, 19 апр

• Выручка:      2\u00a0899\u00a0953\u00a0₸ (+7% к 7d avg)
• Визитов:      93
• Отменили:     4 (4%)
• Средний чек:  31\u00a0182\u00a0₸
• Загрузка:     64%
• План месяца:  71% (19.5М из 27.5М)

🏆 Топ-3 мастера
1. Оксана Гарифзянова — 450\u00a0000\u00a0₸ (2 визита)
2. Гульнара — 293\u00a0880\u00a0₸ (11 визитов)
3. Насиба — 226\u00a0799\u00a0₸ (5 визитов)

💡 Главный инсайт
Воскресенье показало пик выручки за последние 2 недели. Стоит повторить промо."
`);
  });

  it('omits Отменили when cancelled = 0', () => {
    const txt = renderYesterdayMessage(withY({ cancelled: 0 }));
    expect(txt).not.toContain('Отменили');
  });

  it('omits План месяца when monthlyGoalPct is null', () => {
    const txt = renderYesterdayMessage(
      withY({ monthlyGoalPct: null, monthlyGoalMtd: null, monthlyGoalTarget: null }),
    );
    expect(txt).not.toContain('План месяца');
  });

  it('omits AI insight block when aiInsight is null', () => {
    const txt = renderYesterdayMessage(withY({ aiInsight: null }));
    expect(txt).not.toContain('💡 Главный инсайт');
  });

  it('omits Δ7d suffix when deltaPct is null', () => {
    const txt = renderYesterdayMessage(withY({ deltaPct: null }));
    const revLine = txt.split('\n').find((l) => l.startsWith('• Выручка'))!;
    expect(revLine).not.toMatch(/к 7d avg/);
    expect(revLine).not.toMatch(/[+−]\d+%/);
  });

  it('omits Загрузка when utilizationPct is null', () => {
    const txt = renderYesterdayMessage(withY({ utilizationPct: null }));
    expect(txt).not.toContain('Загрузка');
  });

  it('omits Средний чек when came = 0', () => {
    const txt = renderYesterdayMessage(withY({ came: 0, avgCheck: null }));
    expect(txt).not.toContain('Средний чек');
  });

  it('formats negative deltaPct with minus sign', () => {
    const txt = renderYesterdayMessage(withY({ deltaPct: -12 }));
    const revLine = txt.split('\n').find((l) => l.startsWith('• Выручка'))!;
    expect(revLine).toContain('−12% к 7d avg');
  });
});

// ─── Today ───────────────────────────────────────────────────────────────────

describe('renderTodayMessage', () => {
  it('renders top-5 categories', () => {
    const txt = renderTodayMessage(baseFixture);
    expect(txt).toMatchInlineSnapshot(`
"📅 Сегодня · Пн, 20 апр

• Записей:  59
• Загрузка: 82%

📊 Заполненность по категориям
• Маникюр      68% (12 зап.)
• Аппараты     45% (8 зап.)
• Макияж       30% (4 зап.)
• Депиляция    20% (3 зап.)
• Окрашивание  15% (2 зап.)"
`);
  });

  it('omits the categories section when categories is empty', () => {
    const txt = renderTodayMessage(withT({ categories: [] }));
    expect(txt).not.toContain('Заполненность по категориям');
    expect(txt).toContain('Записей:');
  });

  it('omits Загрузка when utilizationPct is null', () => {
    const txt = renderTodayMessage(withT({ utilizationPct: null }));
    expect(txt).not.toContain('Загрузка');
    expect(txt).toContain('Записей:');
  });
});
