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

function makeData(patch: Partial<DailyReportData>): DailyReportData {
  return { ...baseFixture, ...patch };
}

// ─── Yesterday ──────────────────────────────────────────────────────────────

describe('renderYesterdayMessage', () => {
  it('full happy path: cancellations > 0, goal available, insight present', () => {
    const txt = renderYesterdayMessage(baseFixture);
    expect(txt).toMatchInlineSnapshot(`
"☀ Доброе утро! <b>Салон №1, Алматы</b>
<i>📊 Вчера · Вс, 19 апр</i>

• Выручка: <b>2 899 953 ₸</b> (+7% к 7d avg)
• Визитов: 93
• Отменили: 4 (4%)
• Не пришли: 2 (18 000 ₸ упущено)
• Средний чек: <b>31 182 ₸</b>
• Загрузка: <b>64%</b>
• Клиенты: 31 новых · 62 постоянных (33%/67%)

<b>📈 Динамика выручки</b>
Неделя: <b>18 200 000 ₸</b> vs <b>14 900 000 ₸</b> (+22%)
Месяц: <b>19 500 000 ₸</b> vs <b>17 800 000 ₸</b> (+10%)

<b>💰 План месяца</b>
Цель: 27.5М ₸ (0.9М ₸ в день)
Прошло: 19 из 30 дней
Ожидалось: 18.3М ₸
Факт: <b>19.5М ₸</b>
Темп: <b>106%</b>
Вчера: 2.9М ₸ из 0.9М нормы (316%)

<b>📡 Откуда записи</b>
• Прямая запись — 58 зап. (62%)
• Online widget — 28 зап. (30%)
• Altegio.me App — 5 зап. (5%)
• Partners: Яндекс Карты — 2 зап. (3%)

<b>🏆 Топ-3 мастера</b>
1. Оксана Гарифзянова — 450 000 ₸ (2 визита)
2. Гульнара — 293 880 ₸ (11 визитов)
3. Насиба — 226 799 ₸ (5 визитов)

💡 Главный инсайт
<blockquote>Воскресенье показало пик выручки за последние 2 недели. Стоит повторить промо.</blockquote>"
`);
  });

  it('omits Отменили when cancelled = 0', () => {
    const txt = renderYesterdayMessage(withY({ cancelled: 0 }));
    expect(txt).not.toContain('Отменили');
  });

  it('omits План месяца when monthlyGoalPct is null', () => {
    const txt = renderYesterdayMessage(
      withY({ monthlyGoalPct: null, monthlyGoalMtd: null, monthlyGoalTarget: null, monthlyGoalExpectedMtd: null }),
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

  it('escapes HTML-dangerous characters in names', () => {
    const data = makeData({ salonName: 'Brow & Up <VIP>' });
    const msg = renderYesterdayMessage(data);
    expect(msg).toContain('Brow &amp; Up &lt;VIP&gt;');
    expect(msg).not.toContain('<VIP>');
  });

  it('wraps the AI insight in a blockquote', () => {
    const data = makeData({});
    data.yesterday.aiInsight = 'Совет: догрузите среду';
    const msg = renderYesterdayMessage(data);
    expect(msg).toContain('<blockquote>');
    expect(msg).toContain('Совет: догрузите среду');
  });
});

// ─── Today ───────────────────────────────────────────────────────────────────

describe('renderTodayMessage', () => {
  it('renders top-5 categories', () => {
    const txt = renderTodayMessage(baseFixture);
    expect(txt).toMatchInlineSnapshot(`
"<i>📅 Сегодня · Пн, 20 апр</i>

• Записей: 59
• Загрузка: <b>82%</b>

<b>📊 Заполненность по категориям</b>
• Маникюр — 68% (12 зап.)
• Аппараты — 45% (8 зап.)
• Макияж — 30% (4 зап.)
• Депиляция — 20% (3 зап.)
• Окрашивание — 15% (2 зап.)"
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
