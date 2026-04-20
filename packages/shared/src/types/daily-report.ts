export interface DailyReportData {
  tenant: {
    id: string;
    salonName: string;
    timezone: string;
  };
  date: string; // YYYY-MM-DD (yesterday)

  yesterday: {
    revenue: number;
    visitsCompleted: number;
    visitsCancelled: number;
    avgCheck: number;
    cancelRate: number;       // 0..1
    cancellationLoss: number; // sum of cancelled records' cost
  };

  baseline7d: {
    avgRevenue: number;
    avgVisits: number;
    avgCancelRate: number;
  };

  topStaff: Array<{
    staffId: number;
    name: string;
    revenue: number;
    visits: number;
  }>;

  strugglingStaff: Array<{
    staffId: number;
    name: string;
    consecutiveDaysBelowAvg: number;
  }>;

  today: {
    bookedCount: number;
    occupancyPct: number;
    emptySlots: string[]; // ["14:00", "18:00", "19:00"]
  };

  cancelClusters: Array<{
    staffName: string;
    hour: number; // 0..23
    count: number;
  }>;
}
