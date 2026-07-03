import type { TmaLosses } from '@altegio/shared';

export interface LossIngredients {
  revenue: number; visits: number; cancelled: number;
  noShowCount: number; noShowLost: number;
  bookedMin: number; capacityMin: number;
  newSleeping: number; avgCheck: number;
}

export const CHURN_RETURN_RATE = 0.3;
export const DEFAULT_TARGET_UTILIZATION_PCT = 80;
// Below this, ×365/days extrapolation is noise (2 days into a month → ×182).
export const MIN_ANNUALIZE_DAYS = 7;

export function composeLosses(
  i: LossIngredients,
  periodDays: number,
  targetUtilizationPct: number = DEFAULT_TARGET_UTILIZATION_PCT,
): TmaLosses {
  const annualized = periodDays >= MIN_ANNUALIZE_DAYS;
  const annual = (period: number) => (annualized ? Math.round((period * 365) / periodDays) : null);
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

  // Churn must be a FLOW (clients who fell asleep during the period), never the
  // whole sleeping stock: a stock multiplied by 365/periodDays produces absurd
  // period-dependent billions (observed on real data).
  const churn = {
    newSleeping: i.newSleeping,
    returnRatePct: CHURN_RETURN_RATE * 100,
    ...block(i.newSleeping * i.avgCheck * CHURN_RETURN_RATE),
  };

  const totalPeriod = cancellations.period + noShow.period + idle.period + churn.period;
  return {
    periodDays,
    annualized,
    cancellations, noShow, idle, churn,
    totalPeriod,
    totalAnnual: annualized
      ? cancellations.annual! + noShow.annual! + idle.annual! + churn.annual!
      : null,
  };
}
