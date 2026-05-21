export type TopStaff = { name: string; revenue: number; visits: number };
export type CategoryFill = { name: string; fillPct: number; visits: number };

export type NoShow = { count: number; lostRevenue: number };

export type Retention = {
  newClients: number;
  returningClients: number;
  newPct: number | null;
  returningPct: number | null;
};

export type RevenueWindow = { value: number; prev: number; deltaPct: number | null };
export type RevenueDynamics = { week: RevenueWindow; month: RevenueWindow };

export type YesterdayBlock = {
  date: string;              // 'YYYY-MM-DD'
  revenue: number;
  avg7: number | null;
  deltaPct: number | null;
  came: number;
  cancelled: number;
  avgCheck: number | null;
  utilizationPct: number | null;
  monthlyGoalPct: number | null;
  monthlyGoalTarget: number | null;
  monthlyGoalMtd: number | null;
  monthlyGoalExpectedMtd: number | null;
  monthlyGoalManual: boolean;
  topStaff: TopStaff[];
  noShow: NoShow;
  retention: Retention;
  dynamics: RevenueDynamics;
  aiInsight: string | null;
};

export type TodayBlock = {
  date: string;
  scheduled: number;
  utilizationPct: number | null;
  categories: CategoryFill[]; // top-5 by capacity desc, may be empty
};

export type DailyReportData = {
  salonName: string;
  timezone: string;
  yesterday: YesterdayBlock;
  today: TodayBlock;
};
