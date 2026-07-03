import type { TmaLosses } from '@altegio/shared';

export interface LossIngredients {
  revenue: number; visits: number; cancelled: number;
  noShowCount: number; noShowLost: number;
  bookedMin: number; capacityMin: number;
  sleepingCount: number; avgCheck: number;
}

export const CHURN_RETURN_RATE = 0.3;
export const DEFAULT_TARGET_UTILIZATION_PCT = 80;

export function composeLosses(
  i: LossIngredients,
  periodDays: number,
  targetUtilizationPct: number = DEFAULT_TARGET_UTILIZATION_PCT,
): TmaLosses {
  const annual = (period: number) => Math.round((period * 365) / periodDays);
  const block = (period: number) => ({ period: Math.round(period), annual: annual(period) });

  const cancellations = { count: i.cancelled, ...block(i.cancelled * i.avgCheck) };
  const noShow = { count: i.noShowCount, ...block(i.noShowLost) };

  // Idle is measured against a realistic target utilization, not 100% of capacity —
  // a fully-booked salon never exists, so raw free hours grossly overstate the loss.
  let idleHours = 0;
  let idlePeriod = 0;
  if (i.bookedMin > 0 && i.capacityMin > 0) {
    const targetMin = i.capacityMin * (targetUtilizationPct / 100);
    const exactIdleHours = Math.max(0, targetMin - i.bookedMin) / 60;
    idleHours = Math.round(exactIdleHours);
    const revenuePerHour = i.revenue / (i.bookedMin / 60);
    idlePeriod = exactIdleHours * revenuePerHour;
  }
  const idle = { idleHours, targetUtilizationPct, ...block(idlePeriod) };

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
