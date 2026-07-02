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
}
