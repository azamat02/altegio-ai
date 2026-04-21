export type TopStaff = { name: string; revenue: number; visits: number };
export type CategoryFill = { name: string; fillPct: number; visits: number };

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
  topStaff: TopStaff[];
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
