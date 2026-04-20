import type { DailyReportData } from '@altegio/shared';

export const baseFixture: DailyReportData = {
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
