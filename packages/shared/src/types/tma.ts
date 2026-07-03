import type { RevenueDynamics } from './daily-report';

export interface TrendPoint { date: string; revenue: number }

export interface StaffTableRow {
  staffId: number;
  name: string;
  revenue: number;
  visits: number;
  avgCheck: number;
  cancelPct: number;
  utilizationPct: number | null;
  newClients: number;
  revenuePerHour: number;
}

export interface TmaSummary {
  salonName: string;
  date: string;
  revenue: number;
  deltaPct: number | null;
  avgCheck: number | null;
  came: number;
  cancelled: number;
  utilizationPct: number | null;
  topStaff: { name: string; revenue: number; visits: number } | null;
  revenue30d: TrendPoint[];
  dynamics: RevenueDynamics | null;
}

export interface StaffCompareRow extends StaffTableRow {
  prevRevenue: number;
  deltaPct: number | null; // null when prevRevenue === 0 («новый»)
}
export interface StaffCompareResponse {
  rows: StaffCompareRow[];
  totals: { revenue: number; prevRevenue: number; deltaPct: number | null };
}
export interface StaffServiceRow { title: string; visits: number; revenue: number }
export interface StaffDetail {
  staffId: number;
  name: string;
  revenue: number;
  visits: number;
  avgCheck: number;
  utilizationPct: number | null;
  newClients: number;
  returningClients: number;
  cancelled: number;
  noShow: number;
  services: StaffServiceRow[]; // top by revenue, max 10
  trend: TrendPoint[];         // 30d
}

// annual is null when the period is too short to extrapolate honestly (<7 days)
export interface LossBlock { period: number; annual: number | null }
export interface TmaLosses {
  periodDays: number;
  annualized: boolean;
  cancellations: LossBlock & { count: number };
  noShow: LossBlock & { count: number };
  idle: LossBlock & { idleHours: number; targetUtilizationPct: number };
  // churn is a flow: clients who crossed the sleeping threshold DURING the period
  churn: LossBlock & { newSleeping: number; returnRatePct: number };
  totalPeriod: number;
  totalAnnual: number | null;
}
export interface SleepingClient { name: string | null; phone: string | null; daysSince: number; visits: number; spent: number }
export interface TopClient { name: string | null; phone: string | null; visits: number; spent: number }
export interface TmaClients {
  totalClients: number;
  sleepingCount: number;
  almostLostCount: number;
  sleeping: SleepingClient[];
  top: TopClient[];
}
