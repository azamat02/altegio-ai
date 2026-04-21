import { DailyReportData } from '@altegio/shared';

/**
 * Full Phase 1.1 fixture — all optional fields populated.
 *
 * Matches the spec example:
 *   yesterday date: 2026-04-19 (Sun)
 *   today date:     2026-04-20 (Mon)
 *   timezone:       Asia/Almaty
 */
export const baseFixture: DailyReportData = {
  salonName: 'Салон №1, Алматы',
  timezone: 'Asia/Almaty',
  yesterday: {
    date: '2026-04-19',
    revenue: 2_899_953,
    avg7: 2_710_236,
    deltaPct: 7,
    came: 93,
    cancelled: 4,
    avgCheck: 31_182,
    utilizationPct: 64,
    monthlyGoalPct: 71,
    monthlyGoalTarget: 27_500_000,
    monthlyGoalMtd: 19_500_000,
    topStaff: [
      { name: 'Оксана Гарифзянова', revenue: 450_000, visits: 2 },
      { name: 'Гульнара', revenue: 293_880, visits: 11 },
      { name: 'Насиба', revenue: 226_799, visits: 5 },
    ],
    aiInsight: 'Воскресенье показало пик выручки за последние 2 недели. Стоит повторить промо.',
  },
  today: {
    date: '2026-04-20',
    scheduled: 59,
    utilizationPct: 82,
    categories: [
      { name: 'Маникюр', fillPct: 68, visits: 12 },
      { name: 'Аппараты', fillPct: 45, visits: 8 },
      { name: 'Макияж', fillPct: 30, visits: 4 },
      { name: 'Депиляция', fillPct: 20, visits: 3 },
      { name: 'Окрашивание', fillPct: 15, visits: 2 },
    ],
  },
};
