import type { TmaLosses } from '@altegio/shared';

export interface LossIngredients {
  revenue: number; visits: number; cancelled: number;
  noShowCount: number; noShowLost: number;
  bookedMin: number; capacityMin: number;
  sleepingCount: number; avgCheck: number;
}

export const CHURN_RETURN_RATE = 0.3;

export function composeLosses(i: LossIngredients, periodDays: number): TmaLosses {
  const annual = (period: number) => Math.round((period * 365) / periodDays);
  const block = (period: number) => ({ period: Math.round(period), annual: annual(period) });

  const cancellations = { count: i.cancelled, ...block(i.cancelled * i.avgCheck) };
  const noShow = { count: i.noShowCount, ...block(i.noShowLost) };

  let idleHours = 0;
  let idlePeriod = 0;
  if (i.bookedMin > 0 && i.capacityMin > 0) {
    idleHours = Math.round(Math.max(0, i.capacityMin - i.bookedMin) / 60);
    const revenuePerHour = i.revenue / (i.bookedMin / 60);
    idlePeriod = idleHours * revenuePerHour;
  }
  const idle = { idleHours, ...block(idlePeriod) };

  const churn = {
    sleepingCount: i.sleepingCount,
    returnRatePct: CHURN_RETURN_RATE * 100,
    ...block(i.sleepingCount * i.avgCheck * CHURN_RETURN_RATE),
  };

  return {
    periodDays,
    cancellations, noShow, idle, churn,
    totalAnnual: cancellations.annual + noShow.annual + idle.annual + churn.annual,
  };
}
