import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantsService } from '../tenants/tenants.service';
import { CategoryFill, DailyReportData, TopStaff } from '@altegio/shared';

@Injectable()
export class MetricsService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly tenants: TenantsService,
  ) {}

  // ---------------------------------------------------------------------------
  // Legacy method — kept for backward compat with existing Phase 1 reports
  // ---------------------------------------------------------------------------

  async getDailyReportData(tenantId: string, reportDate: string): Promise<any> {
    const tenant = await this.tenants.findById(tenantId);
    if (!tenant) throw new Error(`Tenant ${tenantId} not found`);

    const yesterday = this.subtractDays(reportDate, 1);
    const weekStart = this.subtractDays(reportDate, 8);
    const weekEnd = this.subtractDays(reportDate, 2);

    const [yStats] = await this.ds.query(
      `SELECT revenue_total, visits_completed, visits_cancelled, avg_check, occupancy_pct
       FROM daily_metrics WHERE tenant_id = $1 AND date = $2`,
      [tenantId, yesterday],
    );

    const [baseline] = await this.ds.query(
      `SELECT
        COALESCE(AVG(revenue_total), 0)::numeric       AS avg_revenue,
        COALESCE(AVG(visits_completed), 0)::numeric    AS avg_visits,
        COALESCE(
          AVG(visits_cancelled::numeric
            / NULLIF(visits_completed + visits_cancelled, 0)),
          0
        )::numeric                                    AS avg_cancel_rate
       FROM daily_metrics
       WHERE tenant_id = $1 AND date BETWEEN $2 AND $3`,
      [tenantId, weekStart, weekEnd],
    );

    const topStaff = await this.ds.query(
      `SELECT sd.altegio_staff_id AS staff_id, s.name, sd.revenue::numeric AS revenue, sd.visits
       FROM staff_daily sd
       JOIN staff s ON s.tenant_id = sd.tenant_id AND s.altegio_staff_id = sd.altegio_staff_id
       WHERE sd.tenant_id = $1 AND sd.date = $2 AND sd.visits > 0
       ORDER BY sd.revenue DESC LIMIT 3`,
      [tenantId, yesterday],
    );

    const strugglingStaff = await this.ds.query(
      `WITH w AS (
         SELECT altegio_staff_id, AVG(revenue::numeric) AS avg_7d
         FROM staff_daily
         WHERE tenant_id = $1 AND date BETWEEN $2 AND $3
         GROUP BY altegio_staff_id
       ),
       yest AS (
         SELECT altegio_staff_id, revenue::numeric AS rev
         FROM staff_daily WHERE tenant_id = $1 AND date = $4
       ),
       prev AS (
         SELECT altegio_staff_id, revenue::numeric AS rev
         FROM staff_daily WHERE tenant_id = $1 AND date = $5
       )
       SELECT y.altegio_staff_id AS staff_id, s.name,
              2 AS consecutive_days_below_avg
       FROM yest y
       JOIN w ON w.altegio_staff_id = y.altegio_staff_id
       LEFT JOIN prev p ON p.altegio_staff_id = y.altegio_staff_id
       JOIN staff s ON s.tenant_id = $1 AND s.altegio_staff_id = y.altegio_staff_id
       WHERE y.rev < w.avg_7d * 0.6
         AND COALESCE(p.rev, 0) < w.avg_7d * 0.6
       LIMIT 2`,
      [tenantId, weekStart, weekEnd, yesterday, this.subtractDays(yesterday, 1)],
    );

    const [cancelLoss] = await this.ds.query(
      `SELECT COALESCE(SUM(cost), 0)::numeric AS loss
       FROM records
       WHERE tenant_id = $1 AND attendance = -1 AND NOT deleted
         AND (datetime AT TIME ZONE $2)::date = $3`,
      [tenantId, tenant.timezone, yesterday],
    );

    const [todayLoad] = await this.ds.query(
      `SELECT
         COUNT(*) FILTER (WHERE NOT deleted) AS booked,
         COALESCE(SUM(seance_length) FILTER (WHERE NOT deleted), 0) AS total_seconds
       FROM records
       WHERE tenant_id = $1 AND (datetime AT TIME ZONE $2)::date = $3`,
      [tenantId, tenant.timezone, reportDate],
    );

    const [staffCountRow] = await this.ds.query(
      `SELECT COUNT(*)::int AS n FROM staff WHERE tenant_id = $1 AND NOT fired AND bookable`,
      [tenantId],
    );
    const staffCount = staffCountRow.n || 1;
    const workingSeconds = tenant.workingHoursPerDay * 3600;
    const occToday = Math.min(100, (Number(todayLoad.total_seconds) / (staffCount * workingSeconds)) * 100);

    const emptySlots = await this.computeEmptySlots(tenantId, reportDate, tenant.timezone);

    const clusters = await this.ds.query(
      `SELECT s.name AS staff_name, EXTRACT(HOUR FROM r.datetime AT TIME ZONE $2)::int AS hour, COUNT(*)::int AS count
       FROM records r
       JOIN staff s ON s.tenant_id = r.tenant_id AND s.altegio_staff_id = r.altegio_staff_id
       WHERE r.tenant_id = $1 AND r.attendance = -1 AND NOT r.deleted
         AND (r.datetime AT TIME ZONE $2)::date = $3
       GROUP BY s.name, hour
       ORDER BY count DESC LIMIT 3`,
      [tenantId, tenant.timezone, yesterday],
    );

    const completed = yStats ? Number(yStats.visits_completed) : 0;
    const cancelled = yStats ? Number(yStats.visits_cancelled) : 0;
    const cancelRate = completed + cancelled > 0 ? cancelled / (completed + cancelled) : 0;

    return {
      tenant: { id: tenant.id, salonName: tenant.salonName, timezone: tenant.timezone },
      date: yesterday,
      yesterday: {
        revenue: yStats ? Number(yStats.revenue_total) : 0,
        visitsCompleted: completed,
        visitsCancelled: cancelled,
        avgCheck: yStats ? Number(yStats.avg_check) : 0,
        cancelRate,
        cancellationLoss: Number(cancelLoss.loss),
      },
      baseline7d: {
        avgRevenue: Number(baseline.avg_revenue),
        avgVisits: Number(baseline.avg_visits),
        avgCancelRate: Number(baseline.avg_cancel_rate),
      },
      topStaff: topStaff.map((r: any) => ({
        staffId: Number(r.staff_id), name: r.name,
        revenue: Number(r.revenue), visits: Number(r.visits),
      })),
      strugglingStaff: strugglingStaff.map((r: any) => ({
        staffId: Number(r.staff_id), name: r.name,
        consecutiveDaysBelowAvg: Number(r.consecutive_days_below_avg),
      })),
      today: {
        bookedCount: Number(todayLoad.booked),
        occupancyPct: Math.round(occToday * 10) / 10,
        emptySlots,
      },
      cancelClusters: clusters.map((r: any) => ({
        staffName: r.staff_name, hour: Number(r.hour), count: Number(r.count),
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // Task 17 — yesterdayUtilization
  // ---------------------------------------------------------------------------

  async yesterdayUtilization(tenantId: string, date: string): Promise<number | null> {
    const [cap] = await this.ds.query(
      `SELECT COALESCE(SUM(working_minutes), 0)::int AS capacity_min
       FROM resource_schedule
       WHERE tenant_id = $1 AND date = $2`,
      [tenantId, date],
    );
    const capacityMin = Number(cap.capacity_min);
    if (capacityMin === 0) return null;

    const [booked] = await this.ds.query(
      `SELECT COALESCE(SUM(seance_length), 0)::int AS booked_min
       FROM records
       WHERE tenant_id = $1 AND datetime::date = $2 AND attendance = 1`,
      [tenantId, date],
    );
    const bookedMin = Number(booked.booked_min);
    return Math.round((bookedMin / capacityMin) * 100);
  }

  // ---------------------------------------------------------------------------
  // Task 18 — monthlyGoal
  // ---------------------------------------------------------------------------

  async monthlyGoal(
    tenantId: string,
    referenceDate: string,
  ): Promise<{ target: number; mtd: number; pct: number } | null> {
    // referenceDate's month start
    const refD = new Date(referenceDate + 'T00:00:00Z');
    const refYear = refD.getUTCFullYear();
    const refMonth = refD.getUTCMonth() + 1; // 1-based

    // The 3 calendar months immediately before refDate's month
    const prevMonths: Array<{ start: string; end: string }> = [];
    for (let i = 1; i <= 3; i++) {
      let y = refYear;
      let m = refMonth - i;
      if (m <= 0) { m += 12; y -= 1; }
      const start = `${y}-${String(m).padStart(2, '0')}-01`;
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate(); // day 0 of next month = last day of m
      const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      prevMonths.push({ start, end });
    }

    // Check how many of those months have any records
    const historyCounts = await Promise.all(
      prevMonths.map(({ start, end }) =>
        this.ds.query(
          `SELECT COUNT(*)::int AS cnt FROM records
           WHERE tenant_id = $1 AND attendance = 1
             AND datetime::date BETWEEN $2 AND $3`,
          [tenantId, start, end],
        ),
      ),
    );
    const fullMonths = historyCounts.filter((r) => Number(r[0].cnt) > 0).length;
    if (fullMonths < 3) return null;

    // Monthly revenue for each of the 3 prior months
    const monthRevenues = await Promise.all(
      prevMonths.map(({ start, end }) =>
        this.ds.query(
          `SELECT COALESCE(SUM(cost), 0)::numeric AS rev
           FROM records
           WHERE tenant_id = $1 AND attendance = 1
             AND datetime::date BETWEEN $2 AND $3`,
          [tenantId, start, end],
        ),
      ),
    );
    const avgPrev =
      monthRevenues.reduce((sum, r) => sum + Number(r[0].rev), 0) / 3;
    const target = Math.round(avgPrev * 1.1);

    // MTD: from first day of refDate's month up to (exclusive) referenceDate
    const mtdStart = `${refYear}-${String(refMonth).padStart(2, '0')}-01`;
    const [mtdRow] = await this.ds.query(
      `SELECT COALESCE(SUM(cost), 0)::numeric AS mtd
       FROM records
       WHERE tenant_id = $1 AND attendance = 1
         AND datetime::date >= $2 AND datetime::date < $3`,
      [tenantId, mtdStart, referenceDate],
    );
    const mtd = Math.round(Number(mtdRow.mtd));
    const pct = Math.round((mtd / target) * 100);
    return { target, mtd, pct };
  }

  // ---------------------------------------------------------------------------
  // Task 19 — todayCategoryFillRates
  // ---------------------------------------------------------------------------

  async todayCategoryFillRates(tenantId: string, date: string): Promise<CategoryFill[]> {
    const rows = await this.ds.query(
      `WITH capacity AS (
        SELECT a.category_altegio_id AS cat,
               SUM(rs.working_minutes * a.share)::int AS cap_min
        FROM resource_schedule rs
        JOIN resource_category_affinity a
          ON a.tenant_id = rs.tenant_id AND a.resource_altegio_id = rs.resource_altegio_id
        WHERE rs.tenant_id = $1 AND rs.date = $2
        GROUP BY a.category_altegio_id
      ),
      booked AS (
        SELECT s.category_id AS cat,
               SUM(r.seance_length)::int AS b_min,
               COUNT(*)::int AS visits
        FROM records r
        JOIN services s
          ON s.tenant_id = r.tenant_id AND s.altegio_service_id = r.altegio_service_id
        WHERE r.tenant_id = $1
          AND r.datetime::date = $2
          AND r.attendance IN (0, 1)
          AND s.category_id IS NOT NULL
        GROUP BY s.category_id
      ),
      names AS (
        SELECT category_id AS cat,
               MIN(title) AS category_title
        FROM services
        WHERE tenant_id = $1 AND category_id IS NOT NULL
        GROUP BY category_id
      )
      SELECT n.category_title AS name,
             COALESCE(b.visits, 0) AS visits,
             CASE WHEN c.cap_min > 0
                  THEN round(100.0 * COALESCE(b.b_min, 0) / c.cap_min)::int
                  ELSE 0 END AS fillpct,
             c.cap_min
      FROM capacity c
      LEFT JOIN booked b ON b.cat = c.cat
      LEFT JOIN names n ON n.cat = c.cat
      WHERE c.cap_min >= 30
      ORDER BY c.cap_min DESC
      LIMIT 5`,
      [tenantId, date],
    );

    return rows.map((r: any): CategoryFill => ({
      name: r.name ?? 'Прочее',
      fillPct: Number(r.fillpct),
      visits: Number(r.visits),
    }));
  }

  // ---------------------------------------------------------------------------
  // Task 20 helpers — scheduledToday, yesterdayRevenue, avg7Revenue,
  // yesterdayVisits, yesterdayTopStaff
  // ---------------------------------------------------------------------------

  async scheduledToday(tenantId: string, date: string): Promise<number> {
    const [row] = await this.ds.query(
      `SELECT COUNT(*)::int AS cnt
       FROM records
       WHERE tenant_id = $1 AND datetime::date = $2 AND attendance IN (0, 1)`,
      [tenantId, date],
    );
    return Number(row.cnt);
  }

  private async yesterdayRevenue(tenantId: string, date: string): Promise<number> {
    const [row] = await this.ds.query(
      `SELECT COALESCE(SUM(cost), 0)::numeric AS rev
       FROM records
       WHERE tenant_id = $1 AND attendance = 1 AND datetime::date = $2`,
      [tenantId, date],
    );
    return Number(row.rev);
  }

  private async avg7Revenue(tenantId: string, date: string): Promise<number | null> {
    // Average daily revenue over the 7 days ending on (date - 1 day), i.e. NOT including date itself
    const weekEnd = this.subtractDays(date, 1);
    const weekStart = this.subtractDays(date, 7);
    const rows = await this.ds.query(
      `SELECT datetime::date AS day, SUM(cost)::numeric AS rev
       FROM records
       WHERE tenant_id = $1 AND attendance = 1
         AND datetime::date BETWEEN $2 AND $3
       GROUP BY datetime::date`,
      [tenantId, weekStart, weekEnd],
    );
    if (rows.length === 0) return null;
    const total = rows.reduce((s: number, r: any) => s + Number(r.rev), 0);
    return total / rows.length;
  }

  private async yesterdayVisits(
    tenantId: string,
    date: string,
  ): Promise<{ came: number; cancelled: number }> {
    const [row] = await this.ds.query(
      `SELECT
         COUNT(*) FILTER (WHERE attendance = 1)::int  AS came,
         COUNT(*) FILTER (WHERE attendance = -1)::int AS cancelled
       FROM records
       WHERE tenant_id = $1 AND datetime::date = $2`,
      [tenantId, date],
    );
    return { came: Number(row.came), cancelled: Number(row.cancelled) };
  }

  private async yesterdayTopStaff(
    tenantId: string,
    date: string,
    limit: number,
  ): Promise<TopStaff[]> {
    const rows = await this.ds.query(
      `SELECT s.name,
              COALESCE(SUM(r.cost), 0)::numeric AS revenue,
              COUNT(*)::int AS visits
       FROM records r
       JOIN staff s ON s.tenant_id = r.tenant_id AND s.altegio_staff_id = r.altegio_staff_id
       WHERE r.tenant_id = $1 AND r.datetime::date = $2 AND r.attendance = 1
       GROUP BY s.name
       ORDER BY revenue DESC
       LIMIT $3`,
      [tenantId, date, limit],
    );
    return rows.map((r: any): TopStaff => ({
      name: r.name,
      revenue: Number(r.revenue),
      visits: Number(r.visits),
    }));
  }

  // ---------------------------------------------------------------------------
  // Task 20 — buildDailyReportData
  // ---------------------------------------------------------------------------

  async buildDailyReportData(tenantId: string, reportDate: string): Promise<DailyReportData> {
    const yesterday = this.subtractDays(reportDate, 1);
    const today = reportDate;
    const tenant = await this.tenants.findById(tenantId);
    if (!tenant) throw new Error(`Tenant ${tenantId} not found`);

    const [revenue, avg7, visits, topStaff, utilY, goal] = await Promise.all([
      this.yesterdayRevenue(tenantId, yesterday),
      this.avg7Revenue(tenantId, yesterday),
      this.yesterdayVisits(tenantId, yesterday),
      this.yesterdayTopStaff(tenantId, yesterday, 3),
      this.yesterdayUtilization(tenantId, yesterday),
      this.monthlyGoal(tenantId, yesterday),
    ]);

    const [scheduledToday, utilT, categories] = await Promise.all([
      this.scheduledToday(tenantId, today),
      this.yesterdayUtilization(tenantId, today),
      this.todayCategoryFillRates(tenantId, today),
    ]);

    return {
      salonName: tenant.salonName,
      timezone: tenant.timezone,
      yesterday: {
        date: yesterday,
        revenue,
        avg7: avg7 ?? null,
        deltaPct: avg7 ? Math.round(((revenue - avg7) / avg7) * 100) : null,
        came: visits.came,
        cancelled: visits.cancelled,
        avgCheck: visits.came ? Math.round(revenue / visits.came) : null,
        utilizationPct: utilY,
        monthlyGoalPct: goal?.pct ?? null,
        monthlyGoalTarget: goal?.target ?? null,
        monthlyGoalMtd: goal?.mtd ?? null,
        topStaff,
        aiInsight: null,
      },
      today: {
        date: today,
        scheduled: scheduledToday,
        utilizationPct: utilT,
        categories,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  private subtractDays(date: string, n: number): string {
    const d = new Date(date + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  }

  private async computeEmptySlots(tenantId: string, date: string, tz: string): Promise<string[]> {
    const rows = await this.ds.query(
      `SELECT DISTINCT EXTRACT(HOUR FROM datetime AT TIME ZONE $2)::int AS hour
       FROM records
       WHERE tenant_id = $1 AND NOT deleted
         AND (datetime AT TIME ZONE $2)::date = $3`,
      [tenantId, tz, date],
    );
    const busy = new Set(rows.map((r: any) => Number(r.hour)));
    const hours: string[] = [];
    for (let h = 10; h <= 19; h++) {
      if (!busy.has(h)) hours.push(`${String(h).padStart(2, '0')}:00`);
    }
    return hours;
  }
}
