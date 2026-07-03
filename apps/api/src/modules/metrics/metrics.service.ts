import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantsService } from '../tenants/tenants.service';
import { CategoryFill, DailyReportData, TopStaff, StaffTableRow, TrendPoint, TmaClients } from '@altegio/shared';

@Injectable()
export class MetricsService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly tenants: TenantsService,
  ) {}

  // ---------------------------------------------------------------------------
  // yesterdayUtilization (attendance = 1: completed visits only)
  // ---------------------------------------------------------------------------

  async yesterdayUtilization(tenantId: string, date: string, tz: string): Promise<number | null> {
    const [cap] = await this.ds.query(
      `SELECT COALESCE(SUM(working_minutes), 0)::int AS capacity_min
       FROM resource_schedule
       WHERE tenant_id = $1 AND date = $2`,
      [tenantId, date],
    );
    const capacityMin = Number(cap.capacity_min);
    if (capacityMin === 0) return null;

    const [booked] = await this.ds.query(
      `SELECT COALESCE(SUM(seance_length), 0)::int / 60 AS booked_min
       FROM records
       WHERE tenant_id = $1 AND (datetime AT TIME ZONE $3)::date = $2 AND attendance = 1`,
      [tenantId, date, tz],
    );
    const bookedMin = Number(booked.booked_min);
    return Math.round((bookedMin / capacityMin) * 100);
  }

  // ---------------------------------------------------------------------------
  // todayUtilization (attendance IN (0,1): including scheduled)
  // ---------------------------------------------------------------------------

  async todayUtilization(tenantId: string, date: string, tz: string): Promise<number | null> {
    const [cap] = await this.ds.query(
      `SELECT COALESCE(SUM(working_minutes), 0)::int AS capacity_min
       FROM resource_schedule
       WHERE tenant_id = $1 AND date = $2`,
      [tenantId, date],
    );
    const capacityMin = Number(cap.capacity_min);
    if (capacityMin === 0) return null;

    const [booked] = await this.ds.query(
      `SELECT COALESCE(SUM(seance_length), 0)::int / 60 AS booked_min
       FROM records
       WHERE tenant_id = $1 AND (datetime AT TIME ZONE $3)::date = $2 AND attendance IN (0, 1)`,
      [tenantId, date, tz],
    );
    const bookedMin = Number(booked.booked_min);
    return Math.round((bookedMin / capacityMin) * 100);
  }

  // ---------------------------------------------------------------------------
  // monthlyGoal (60-day history gate + NaN/Infinity guard)
  // ---------------------------------------------------------------------------

  async monthlyGoal(
    tenantId: string,
    referenceDate: string,
    tz: string,
  ): Promise<{ target: number; mtd: number; pct: number; expectedMtd: number; manual: boolean } | null> {
    const refD = new Date(referenceDate + 'T00:00:00Z');
    const refYear = refD.getUTCFullYear();
    const refMonth = refD.getUTCMonth() + 1; // 1-based
    const refDay = refD.getUTCDate();
    const daysInMonth = new Date(Date.UTC(refYear, refMonth, 0)).getUTCDate();

    // MTD: from 1st of refDate's month THROUGH referenceDate inclusive (yesterday is fully closed).
    const mtdStart = `${refYear}-${String(refMonth).padStart(2, '0')}-01`;
    const [mtdRow] = await this.ds.query(
      `SELECT COALESCE(SUM(cost), 0)::numeric AS mtd
       FROM records
       WHERE tenant_id = $1 AND attendance = 1
         AND (datetime AT TIME ZONE $4)::date >= $2
         AND (datetime AT TIME ZONE $4)::date <= $3`,
      [tenantId, mtdStart, referenceDate, tz],
    );
    const mtd = Math.round(Number(mtdRow.mtd));

    // Prefer tenant's manually-set monthly_goal.
    const [tenantRow] = await this.ds.query(
      `SELECT monthly_goal FROM tenants WHERE id = $1`,
      [tenantId],
    );
    const manualGoal = tenantRow?.monthly_goal != null ? Number(tenantRow.monthly_goal) : null;

    if (manualGoal && manualGoal > 0) {
      const expectedMtd = Math.round(manualGoal * (refDay / daysInMonth));
      if (expectedMtd <= 0) return null;
      const pct = Math.round((mtd / expectedMtd) * 100);
      if (!isFinite(pct)) return null;
      return { target: manualGoal, mtd, pct, expectedMtd, manual: true };
    }

    // Fallback: auto-target from 3-month average × 1.1, 60-day history gate.
    const cutoff = new Date(refD.getTime() - 60 * 86_400_000);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const [earliest] = await this.ds.query(
      `SELECT MIN((datetime AT TIME ZONE $2)::date)::text AS first_day
       FROM records
       WHERE tenant_id = $1`,
      [tenantId, tz],
    );
    if (!earliest.first_day || earliest.first_day > cutoffStr) return null;

    const prevMonths: Array<{ start: string; end: string }> = [];
    for (let i = 1; i <= 3; i++) {
      let y = refYear;
      let m = refMonth - i;
      if (m <= 0) { m += 12; y -= 1; }
      const start = `${y}-${String(m).padStart(2, '0')}-01`;
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      prevMonths.push({ start, end });
    }

    const monthRevenues = await Promise.all(
      prevMonths.map(({ start, end }) =>
        this.ds.query(
          `SELECT COALESCE(SUM(cost), 0)::numeric AS rev
           FROM records
           WHERE tenant_id = $1 AND attendance = 1
             AND (datetime AT TIME ZONE $4)::date BETWEEN $2 AND $3`,
          [tenantId, start, end, tz],
        ),
      ),
    );
    const avgPrev = monthRevenues.reduce((sum, r) => sum + Number(r[0].rev), 0) / 3;
    const target = Math.round(avgPrev * 1.1);
    if (!target || !isFinite(target)) return null;

    const expectedMtd = Math.round(target * (refDay / daysInMonth));
    if (expectedMtd <= 0) return null;
    const pct = Math.round((mtd / expectedMtd) * 100);
    if (!isFinite(pct)) return null;
    return { target, mtd, pct, expectedMtd, manual: false };
  }

  // ---------------------------------------------------------------------------
  // todayCategoryFillRates (TZ-aware date filter)
  // ---------------------------------------------------------------------------

  async todayCategoryFillRates(tenantId: string, date: string, tz: string): Promise<CategoryFill[]> {
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
               SUM(r.seance_length)::int / 60 AS b_min,
               COUNT(*)::int AS visits
        FROM records r
        JOIN services s
          ON s.tenant_id = r.tenant_id AND s.altegio_service_id = r.altegio_service_id
        WHERE r.tenant_id = $1
          AND (r.datetime AT TIME ZONE $3)::date = $2
          AND r.attendance IN (0, 1)
          AND s.category_id IS NOT NULL
        GROUP BY s.category_id
      )
      SELECT sc.title AS name,
             COALESCE(b.visits, 0) AS visits,
             CASE WHEN c.cap_min > 0
                  THEN round(100.0 * COALESCE(b.b_min, 0) / c.cap_min)::int
                  ELSE 0 END AS fillpct,
             c.cap_min
      FROM capacity c
      LEFT JOIN booked b ON b.cat = c.cat
      LEFT JOIN service_categories sc
        ON sc.tenant_id = $1 AND sc.altegio_category_id = c.cat
      WHERE c.cap_min >= 30
      ORDER BY c.cap_min DESC
      LIMIT 5`,
      [tenantId, date, tz],
    );

    return rows.map((r: any): CategoryFill => ({
      name: r.name ?? 'Прочее',
      fillPct: Number(r.fillpct),
      visits: Number(r.visits),
    }));
  }

  // ---------------------------------------------------------------------------
  // Report helpers — scheduledToday, yesterdayRevenue, avg7Revenue,
  // yesterdayVisits, yesterdayTopStaff
  // ---------------------------------------------------------------------------

  async scheduledToday(tenantId: string, date: string, tz: string): Promise<number> {
    const [row] = await this.ds.query(
      `SELECT COUNT(*)::int AS cnt
       FROM records
       WHERE tenant_id = $1 AND (datetime AT TIME ZONE $3)::date = $2 AND attendance IN (0, 1)`,
      [tenantId, date, tz],
    );
    return Number(row.cnt);
  }

  private async yesterdayRevenue(tenantId: string, date: string, tz: string): Promise<number> {
    const [row] = await this.ds.query(
      `SELECT COALESCE(SUM(cost), 0)::numeric AS rev
       FROM records
       WHERE tenant_id = $1 AND attendance = 1 AND (datetime AT TIME ZONE $3)::date = $2`,
      [tenantId, date, tz],
    );
    return Number(row.rev);
  }

  private async avg7Revenue(tenantId: string, date: string, tz: string): Promise<number | null> {
    // Average daily revenue over the 7 days ending on (date - 1 day), NOT including date itself
    // Gate: return null when there isn't at least 7 full prior days of history
    const weekEnd = this.subtractDays(date, 1);
    const weekStart = this.subtractDays(date, 7);

    // Check if earliest record is at or before weekStart
    const [earliest] = await this.ds.query(
      `SELECT MIN((datetime AT TIME ZONE $2)::date)::text AS first_day
       FROM records
       WHERE tenant_id = $1`,
      [tenantId, tz],
    );
    if (!earliest.first_day || earliest.first_day > weekStart) return null;

    const rows = await this.ds.query(
      `SELECT (datetime AT TIME ZONE $4)::date AS day, SUM(cost)::numeric AS rev
       FROM records
       WHERE tenant_id = $1 AND attendance = 1
         AND (datetime AT TIME ZONE $4)::date BETWEEN $2 AND $3
       GROUP BY (datetime AT TIME ZONE $4)::date`,
      [tenantId, weekStart, weekEnd, tz],
    );
    if (rows.length === 0) return null;
    const total = rows.reduce((s: number, r: any) => s + Number(r.rev), 0);
    // divide by 7 (not rows.length) for a true 7-day average
    return total / 7;
  }

  private async yesterdayVisits(
    tenantId: string,
    date: string,
    tz: string,
  ): Promise<{ came: number; cancelled: number }> {
    const [row] = await this.ds.query(
      `SELECT
         COUNT(*) FILTER (WHERE attendance = 1)::int  AS came,
         COUNT(*) FILTER (WHERE attendance = -1)::int AS cancelled
       FROM records
       WHERE tenant_id = $1 AND (datetime AT TIME ZONE $3)::date = $2`,
      [tenantId, date, tz],
    );
    return { came: Number(row.came), cancelled: Number(row.cancelled) };
  }

  private async yesterdayTopStaff(
    tenantId: string,
    date: string,
    tz: string,
    limit: number,
  ): Promise<TopStaff[]> {
    const rows = await this.ds.query(
      `SELECT s.name,
              COALESCE(SUM(r.cost), 0)::numeric AS revenue,
              COUNT(*)::int AS visits
       FROM records r
       JOIN staff s ON s.tenant_id = r.tenant_id AND s.altegio_staff_id = r.altegio_staff_id
       WHERE r.tenant_id = $1 AND (r.datetime AT TIME ZONE $3)::date = $2 AND r.attendance = 1
       GROUP BY s.name
       ORDER BY revenue DESC
       LIMIT $4`,
      [tenantId, date, tz, limit],
    );
    return rows.map((r: any): TopStaff => ({
      name: r.name,
      revenue: Number(r.revenue),
      visits: Number(r.visits),
    }));
  }

  // ---------------------------------------------------------------------------
  // staffTable: per-staff aggregates over a date range
  // ---------------------------------------------------------------------------

  async staffTable(tenantId: string, from: string, to: string, tz: string): Promise<StaffTableRow[]> {
    const rows = await this.ds.query(
      `WITH first_visit AS (
         SELECT altegio_client_id, MIN((datetime AT TIME ZONE $4)::date) AS first_date
         FROM records
         WHERE tenant_id = $1 AND attendance = 1 AND altegio_client_id IS NOT NULL AND deleted = false
         GROUP BY altegio_client_id
       ),
       new_clients AS (
         SELECT r.altegio_staff_id, COUNT(DISTINCT r.altegio_client_id) AS new_clients
         FROM records r
         JOIN first_visit fv ON fv.altegio_client_id = r.altegio_client_id
         WHERE r.tenant_id = $1 AND r.attendance = 1 AND r.deleted = false
           AND (r.datetime AT TIME ZONE $4)::date = fv.first_date
           AND fv.first_date BETWEEN $2 AND $3
         GROUP BY r.altegio_staff_id
       ),
       cap AS (
         SELECT resource_altegio_id AS staff_id, SUM(working_minutes)::int AS capacity_min
         FROM resource_schedule
         WHERE tenant_id = $1 AND date BETWEEN $2 AND $3
         GROUP BY resource_altegio_id
       )
       SELECT s.altegio_staff_id::bigint AS staff_id,
              s.name,
              COALESCE(SUM(r.cost) FILTER (WHERE r.attendance = 1), 0)::numeric AS revenue,
              COUNT(*) FILTER (WHERE r.attendance = 1)::int AS visits,
              COUNT(*) FILTER (WHERE r.attendance = -1)::int AS cancelled,
              COALESCE(SUM(r.seance_length) FILTER (WHERE r.attendance = 1), 0)::int AS booked_sec,
              cap.capacity_min,
              COALESCE(MAX(nc.new_clients), 0)::int AS new_clients
       FROM records r
       JOIN staff s ON s.tenant_id = r.tenant_id AND s.altegio_staff_id = r.altegio_staff_id
       LEFT JOIN cap ON cap.staff_id = s.altegio_staff_id
       LEFT JOIN new_clients nc ON nc.altegio_staff_id = s.altegio_staff_id
       WHERE r.tenant_id = $1 AND r.deleted = false
         AND (r.datetime AT TIME ZONE $4)::date BETWEEN $2 AND $3
       GROUP BY s.altegio_staff_id, s.name, cap.capacity_min
       HAVING COUNT(*) FILTER (WHERE r.attendance IN (1, -1)) > 0
       ORDER BY revenue DESC`,
      [tenantId, from, to, tz],
    );
    return rows.map((r: any): StaffTableRow => {
      const revenue = Number(r.revenue);
      const visits = Number(r.visits);
      const cancelled = Number(r.cancelled);
      const bookedMin = Number(r.booked_sec) / 60;
      const capacity = r.capacity_min == null ? null : Number(r.capacity_min);
      return {
        staffId: Number(r.staff_id),
        name: r.name,
        revenue: Math.round(revenue),
        visits,
        avgCheck: visits ? Math.round(revenue / visits) : 0,
        cancelPct: visits + cancelled ? Math.round((cancelled / (visits + cancelled)) * 100) : 0,
        utilizationPct: capacity ? Math.round((bookedMin / capacity) * 100) : null,
        newClients: Number(r.new_clients),
        revenuePerHour: bookedMin ? Math.round(revenue / (bookedMin / 60)) : 0,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // buildDailyReportData
  // ---------------------------------------------------------------------------

  async buildDailyReportData(tenantId: string, reportDate: string): Promise<DailyReportData> {
    const yesterday = this.subtractDays(reportDate, 1);
    const today = reportDate;
    const tenant = await this.tenants.findById(tenantId);
    if (!tenant) throw new Error(`Tenant ${tenantId} not found`);
    const tz = tenant.timezone;

    const [revenue, avg7, visits, topStaff, utilY, goal, noShow, retention, dynamics, sources] = await Promise.all([
      this.yesterdayRevenue(tenantId, yesterday, tz),
      this.avg7Revenue(tenantId, yesterday, tz),
      this.yesterdayVisits(tenantId, yesterday, tz),
      this.yesterdayTopStaff(tenantId, yesterday, tz, 3),
      this.yesterdayUtilization(tenantId, yesterday, tz),
      this.monthlyGoal(tenantId, yesterday, tz),
      this.noShowForDate(tenantId, yesterday, tz),
      this.retentionForDate(tenantId, yesterday, tz),
      this.revenueDynamics(tenantId, yesterday, tz),
      this.sourceBreakdown(tenantId, yesterday, tz),
    ]);

    const [scheduledToday, utilT, categories] = await Promise.all([
      this.scheduledToday(tenantId, today, tz),
      this.todayUtilization(tenantId, today, tz),
      this.todayCategoryFillRates(tenantId, today, tz),
    ]);

    return {
      salonName: tenant.salonName,
      timezone: tz,
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
        monthlyGoalExpectedMtd: goal?.expectedMtd ?? null,
        monthlyGoalManual: goal?.manual ?? false,
        topStaff,
        noShow,
        retention,
        dynamics: { week: dynamics.week, month: dynamics.month },
        sources,
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
  // No-show count + lost revenue (attendance = 2)
  // ---------------------------------------------------------------------------

  async noShowForDate(
    tenantId: string,
    date: string,
    tz: string,
  ): Promise<{ count: number; lostRevenue: number }> {
    const [row] = await this.ds.query(
      `SELECT COUNT(*)::int AS cnt,
              COALESCE(SUM(cost), 0)::numeric AS lost
       FROM records
       WHERE tenant_id = $1 AND attendance = 2
         AND (datetime AT TIME ZONE $3)::date = $2`,
      [tenantId, date, tz],
    );
    return { count: Number(row.cnt), lostRevenue: Math.round(Number(row.lost)) };
  }

  // ---------------------------------------------------------------------------
  // Per-staff daily breakdown (attendance = 1)
  // ---------------------------------------------------------------------------

  async staffDailyBreakdown(
    tenantId: string,
    date: string,
    tz: string,
  ): Promise<Array<{
    altegioStaffId: number;
    name: string;
    revenue: number;
    visits: number;
    avgCheck: number;
    bookedMinutes: number;
  }>> {
    const rows = await this.ds.query(
      `SELECT s.altegio_staff_id::bigint AS staff_id,
              s.name,
              COALESCE(SUM(r.cost) FILTER (WHERE r.attendance = 1), 0)::numeric AS revenue,
              COUNT(*) FILTER (WHERE r.attendance = 1)::int AS visits,
              COALESCE(SUM(r.seance_length) FILTER (WHERE r.attendance = 1), 0)::int / 60 AS booked_min
       FROM records r
       JOIN staff s ON s.tenant_id = r.tenant_id AND s.altegio_staff_id = r.altegio_staff_id
       WHERE r.tenant_id = $1 AND (r.datetime AT TIME ZONE $3)::date = $2
       GROUP BY s.altegio_staff_id, s.name
       HAVING COUNT(*) FILTER (WHERE r.attendance = 1) > 0
       ORDER BY revenue DESC`,
      [tenantId, date, tz],
    );
    return rows.map((r: any) => {
      const revenue = Number(r.revenue);
      const visits = Number(r.visits);
      return {
        altegioStaffId: Number(r.staff_id),
        name: r.name,
        revenue: Math.round(revenue),
        visits,
        avgCheck: visits ? Math.round(revenue / visits) : 0,
        bookedMinutes: Number(r.booked_min),
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Retention: new vs returning clients on a given date
  // A client is "new" if their first ever attended visit is the given date.
  // ---------------------------------------------------------------------------

  async retentionForDate(
    tenantId: string,
    date: string,
    tz: string,
  ): Promise<{
    newClients: number;
    returningClients: number;
    totalClients: number;
    newPct: number | null;
    returningPct: number | null;
  }> {
    const [row] = await this.ds.query(
      `WITH today_clients AS (
         SELECT DISTINCT altegio_client_id
         FROM records
         WHERE tenant_id = $1
           AND attendance = 1
           AND altegio_client_id IS NOT NULL
           AND (datetime AT TIME ZONE $3)::date = $2
       ),
       first_visit AS (
         SELECT r.altegio_client_id,
                MIN((r.datetime AT TIME ZONE $3)::date) AS first_date
         FROM records r
         JOIN today_clients t ON t.altegio_client_id = r.altegio_client_id
         WHERE r.tenant_id = $1 AND r.attendance = 1
         GROUP BY r.altegio_client_id
       )
       SELECT
         COUNT(*) FILTER (WHERE first_date = $2::date)::int AS new_clients,
         COUNT(*) FILTER (WHERE first_date < $2::date)::int AS returning_clients
       FROM first_visit`,
      [tenantId, date, tz],
    );
    const newClients = Number(row?.new_clients ?? 0);
    const returningClients = Number(row?.returning_clients ?? 0);
    const total = newClients + returningClients;
    return {
      newClients,
      returningClients,
      totalClients: total,
      newPct: total ? Math.round((newClients / total) * 100) : null,
      returningPct: total ? Math.round((returningClients / total) * 100) : null,
    };
  }

  // ---------------------------------------------------------------------------
  // Revenue dynamics: day/week/month vs previous comparable period
  // ---------------------------------------------------------------------------

  async revenueDynamics(
    tenantId: string,
    referenceDate: string,
    tz: string,
  ): Promise<{
    day: { value: number; prev: number; deltaPct: number | null };
    week: { value: number; prev: number; deltaPct: number | null };
    month: { value: number; prev: number; deltaPct: number | null };
  }> {
    const ref = new Date(referenceDate + 'T00:00:00Z');
    const refY = ref.getUTCFullYear();
    const refM = ref.getUTCMonth() + 1;
    const refD = ref.getUTCDate();

    // Day windows
    const dayPrev = this.subtractDays(referenceDate, 7);

    // Week: 7 days ending on referenceDate inclusive
    const weekStart = this.subtractDays(referenceDate, 6);
    const weekPrevEnd = this.subtractDays(referenceDate, 7);
    const weekPrevStart = this.subtractDays(referenceDate, 13);

    // Month: MTD this month, same number of days in prev month
    const mtdStart = `${refY}-${String(refM).padStart(2, '0')}-01`;
    let pY = refY;
    let pM = refM - 1;
    if (pM <= 0) { pM += 12; pY -= 1; }
    const prevMonthStart = `${pY}-${String(pM).padStart(2, '0')}-01`;
    const prevMonthLastDay = new Date(Date.UTC(pY, pM, 0)).getUTCDate();
    const prevMonthSameDay = Math.min(refD, prevMonthLastDay);
    const prevMonthEnd = `${pY}-${String(pM).padStart(2, '0')}-${String(prevMonthSameDay).padStart(2, '0')}`;

    const rangeSum = async (start: string, end: string): Promise<number> => {
      const [r] = await this.ds.query(
        `SELECT COALESCE(SUM(cost), 0)::numeric AS rev
         FROM records
         WHERE tenant_id = $1 AND attendance = 1
           AND (datetime AT TIME ZONE $4)::date BETWEEN $2 AND $3`,
        [tenantId, start, end, tz],
      );
      return Math.round(Number(r.rev));
    };

    const [dayVal, dayPrevVal, weekVal, weekPrevVal, monthVal, monthPrevVal] = await Promise.all([
      rangeSum(referenceDate, referenceDate),
      rangeSum(dayPrev, dayPrev),
      rangeSum(weekStart, referenceDate),
      rangeSum(weekPrevStart, weekPrevEnd),
      rangeSum(mtdStart, referenceDate),
      rangeSum(prevMonthStart, prevMonthEnd),
    ]);

    const delta = (cur: number, prev: number): number | null =>
      prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null;

    return {
      day: { value: dayVal, prev: dayPrevVal, deltaPct: delta(dayVal, dayPrevVal) },
      week: { value: weekVal, prev: weekPrevVal, deltaPct: delta(weekVal, weekPrevVal) },
      month: { value: monthVal, prev: monthPrevVal, deltaPct: delta(monthVal, monthPrevVal) },
    };
  }

  // ---------------------------------------------------------------------------
  // Source breakdown: visits + revenue by record_from (NULL → "Прямая запись")
  // ---------------------------------------------------------------------------

  async sourceBreakdown(
    tenantId: string,
    date: string,
    tz: string,
  ): Promise<Array<{ source: string; visits: number; revenue: number; sharePct: number }>> {
    const rows = await this.ds.query(
      `SELECT COALESCE(record_source, 'Прямая запись') AS source,
              COUNT(*)::int AS visits,
              COALESCE(SUM(cost), 0)::numeric AS revenue
       FROM records
       WHERE tenant_id = $1 AND attendance = 1
         AND (datetime AT TIME ZONE $3)::date = $2
       GROUP BY COALESCE(record_source, 'Прямая запись')
       ORDER BY visits DESC, revenue DESC`,
      [tenantId, date, tz],
    );
    const totalVisits = rows.reduce((s: number, r: any) => s + Number(r.visits), 0);
    return rows.map((r: any) => ({
      source: r.source,
      visits: Number(r.visits),
      revenue: Math.round(Number(r.revenue)),
      sharePct: totalVisits > 0 ? Math.round((Number(r.visits) / totalVisits) * 100) : 0,
    }));
  }

  // ---------------------------------------------------------------------------
  // staffRevenueTrend + revenueSeries daily series
  // ---------------------------------------------------------------------------

  private buildDateAxis(endDate: string, days: number): string[] {
    const out: string[] = [];
    const [y, m, d] = endDate.split('-').map(Number);
    const end = Date.UTC(y, m - 1, d);
    for (let i = days - 1; i >= 0; i--) out.push(new Date(end - i * 86400000).toISOString().slice(0, 10));
    return out;
  }

  private zeroFill(axis: string[], rows: Array<{ date: string; revenue: number }>): TrendPoint[] {
    const map = new Map(rows.map((r) => [r.date, Math.round(Number(r.revenue))]));
    return axis.map((date) => ({ date, revenue: map.get(date) ?? 0 }));
  }

  async staffRevenueTrend(tenantId: string, staffId: number, days: number, endDate: string, tz: string): Promise<TrendPoint[]> {
    const axis = this.buildDateAxis(endDate, days);
    const rows = await this.ds.query(
      `SELECT (datetime AT TIME ZONE $4)::date::text AS date,
              COALESCE(SUM(cost), 0)::numeric AS revenue
       FROM records
       WHERE tenant_id = $1 AND altegio_staff_id = $2 AND attendance = 1 AND deleted = false
         AND (datetime AT TIME ZONE $4)::date BETWEEN $3 AND $5
       GROUP BY 1`,
      [tenantId, staffId, axis[0], tz, endDate],
    );
    return this.zeroFill(axis, rows);
  }

  async revenueSeries(tenantId: string, days: number, endDate: string, tz: string): Promise<TrendPoint[]> {
    const axis = this.buildDateAxis(endDate, days);
    const rows = await this.ds.query(
      `SELECT (datetime AT TIME ZONE $3)::date::text AS date,
              COALESCE(SUM(cost), 0)::numeric AS revenue
       FROM records
       WHERE tenant_id = $1 AND attendance = 1 AND deleted = false
         AND (datetime AT TIME ZONE $3)::date BETWEEN $2 AND $4
       GROUP BY 1`,
      [tenantId, axis[0], tz, endDate],
    );
    return this.zeroFill(axis, rows);
  }

  // ---------------------------------------------------------------------------
  // staffDetail: per-master header, services, clients, cancels
  // ---------------------------------------------------------------------------

  async staffDetail(tenantId: string, staffId: number, from: string, to: string, tz: string) {
    const [staff] = await this.ds.query(
      `SELECT name FROM staff WHERE tenant_id = $1 AND altegio_staff_id = $2`,
      [tenantId, staffId],
    );
    if (!staff) return null;

    const [head] = await this.ds.query(
      `SELECT COALESCE(SUM(r.cost) FILTER (WHERE r.attendance = 1), 0)::numeric AS revenue,
              COUNT(*) FILTER (WHERE r.attendance = 1)::int AS visits,
              COUNT(*) FILTER (WHERE r.attendance = -1)::int AS cancelled,
              COUNT(*) FILTER (WHERE r.attendance = 2)::int AS no_show,
              COALESCE(SUM(r.seance_length) FILTER (WHERE r.attendance = 1), 0)::int AS booked_sec
       FROM records r
       WHERE r.tenant_id = $1 AND r.altegio_staff_id = $2 AND r.deleted = false
         AND (r.datetime AT TIME ZONE $5)::date BETWEEN $3 AND $4`,
      [tenantId, staffId, from, to, tz],
    );

    const [cap] = await this.ds.query(
      `SELECT COALESCE(SUM(working_minutes), 0)::int AS capacity_min
       FROM resource_schedule
       WHERE tenant_id = $1 AND resource_altegio_id = $2 AND date BETWEEN $3 AND $4`,
      [tenantId, staffId, from, to],
    );

    const services = await this.ds.query(
      `SELECT s.title, COUNT(*)::int AS visits, COALESCE(SUM(r.cost), 0)::numeric AS revenue
       FROM records r
       JOIN services s ON s.tenant_id = r.tenant_id AND s.altegio_service_id = r.altegio_service_id
       WHERE r.tenant_id = $1 AND r.altegio_staff_id = $2 AND r.attendance = 1 AND r.deleted = false
         AND (r.datetime AT TIME ZONE $5)::date BETWEEN $3 AND $4
       GROUP BY s.title
       ORDER BY revenue DESC
       LIMIT 10`,
      [tenantId, staffId, from, to, tz],
    );

    const [clients] = await this.ds.query(
      `WITH first_visit AS (
         SELECT altegio_client_id, MIN((datetime AT TIME ZONE $5)::date) AS first_date
         FROM records
         WHERE tenant_id = $1 AND attendance = 1 AND altegio_client_id IS NOT NULL AND deleted = false
         GROUP BY altegio_client_id
       ),
       in_range AS (
         SELECT DISTINCT r.altegio_client_id
         FROM records r
         WHERE r.tenant_id = $1 AND r.altegio_staff_id = $2 AND r.attendance = 1
           AND r.altegio_client_id IS NOT NULL AND r.deleted = false
           AND (r.datetime AT TIME ZONE $5)::date BETWEEN $3 AND $4
       )
       SELECT COUNT(*) FILTER (WHERE fv.first_date BETWEEN $3 AND $4)::int AS new_clients,
              COUNT(*) FILTER (WHERE fv.first_date < $3)::int AS returning_clients
       FROM in_range ir
       JOIN first_visit fv ON fv.altegio_client_id = ir.altegio_client_id`,
      [tenantId, staffId, from, to, tz],
    );

    const revenue = Math.round(Number(head.revenue));
    const visits = Number(head.visits);
    const bookedMin = Number(head.booked_sec) / 60;
    const capacity = Number(cap.capacity_min);
    return {
      staffId,
      name: staff.name,
      revenue,
      visits,
      avgCheck: visits ? Math.round(revenue / visits) : 0,
      utilizationPct: capacity ? Math.round((bookedMin / capacity) * 100) : null,
      newClients: Number(clients?.new_clients ?? 0),
      returningClients: Number(clients?.returning_clients ?? 0),
      cancelled: Number(head.cancelled),
      noShow: Number(head.no_show),
      services: services.map((s: any) => ({
        title: s.title, visits: Number(s.visits), revenue: Math.round(Number(s.revenue)),
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // lossesData: SQL ingredients for the losses screen
  // ---------------------------------------------------------------------------

  async lossesData(tenantId: string, from: string, to: string, tz: string, sleepingDays = 60) {
    const [rec] = await this.ds.query(
      `SELECT COALESCE(SUM(cost) FILTER (WHERE attendance = 1), 0)::numeric AS revenue,
              COUNT(*) FILTER (WHERE attendance = 1)::int AS visits,
              COUNT(*) FILTER (WHERE attendance = -1)::int AS cancelled,
              COUNT(*) FILTER (WHERE attendance = 2)::int AS no_show_count,
              COALESCE(SUM(cost) FILTER (WHERE attendance = 2), 0)::numeric AS no_show_lost,
              COALESCE(SUM(seance_length) FILTER (WHERE attendance = 1), 0)::int AS booked_sec
       FROM records
       WHERE tenant_id = $1 AND deleted = false
         AND (datetime AT TIME ZONE $4)::date BETWEEN $2 AND $3`,
      [tenantId, from, to, tz],
    );
    const [cap] = await this.ds.query(
      `SELECT COALESCE(SUM(working_minutes), 0)::int AS capacity_min
       FROM resource_schedule
       WHERE tenant_id = $1 AND date BETWEEN $2 AND $3`,
      [tenantId, from, to],
    );
    // Churn flow: clients whose sleeping threshold (last visit + sleepingDays)
    // falls INSIDE [from..to]. A client who visited again since has a fresher
    // last_visit_date and correctly drops out of the window.
    const [sleep] = await this.ds.query(
      `SELECT COUNT(*)::int AS newly_sleeping
       FROM clients
       WHERE tenant_id = $1 AND visits_count >= 1
         AND last_visit_date IS NOT NULL
         AND last_visit_date BETWEEN ($2::date - $4::int) AND ($3::date - $4::int)`,
      [tenantId, from, to, sleepingDays],
    );
    const revenue = Math.round(Number(rec.revenue));
    const visits = Number(rec.visits);
    return {
      revenue,
      visits,
      cancelled: Number(rec.cancelled),
      noShowCount: Number(rec.no_show_count),
      noShowLost: Math.round(Number(rec.no_show_lost)),
      bookedMin: Number(rec.booked_sec) / 60,
      capacityMin: Number(cap.capacity_min),
      newSleeping: Number(sleep.newly_sleeping),
      avgCheck: visits ? Math.round(revenue / visits) : 0,
    };
  }

  // ---------------------------------------------------------------------------
  // clientsAnalytics: sleeping list, LTV top, counters
  // ---------------------------------------------------------------------------

  async clientsAnalytics(tenantId: string, today: string, sleepingCutoff: string, almostLostCutoff: string): Promise<TmaClients> {
    const [counts] = await this.ds.query(
      `SELECT COUNT(*) FILTER (WHERE visits_count >= 1)::int AS total,
              COUNT(*) FILTER (WHERE visits_count >= 1 AND last_visit_date IS NOT NULL AND last_visit_date < $2)::int AS sleeping,
              COUNT(*) FILTER (WHERE visits_count >= 1 AND last_visit_date IS NOT NULL AND last_visit_date < $3)::int AS almost_lost
       FROM clients WHERE tenant_id = $1`,
      [tenantId, sleepingCutoff, almostLostCutoff],
    );
    const sleeping = await this.ds.query(
      `SELECT name, phone, ($2::date - last_visit_date)::int AS days_since,
              COALESCE(visits_count, 0)::int AS visits, COALESCE(spent, 0)::numeric AS spent
       FROM clients
       WHERE tenant_id = $1 AND visits_count >= 1
         AND last_visit_date IS NOT NULL AND last_visit_date < $3
       ORDER BY spent DESC NULLS LAST
       LIMIT 30`,
      [tenantId, today, sleepingCutoff],
    );
    const top = await this.ds.query(
      `SELECT name, phone, COALESCE(visits_count, 0)::int AS visits, COALESCE(spent, 0)::numeric AS spent
       FROM clients
       WHERE tenant_id = $1 AND visits_count >= 1
       ORDER BY spent DESC NULLS LAST
       LIMIT 10`,
      [tenantId],
    );
    return {
      totalClients: Number(counts.total),
      sleepingCount: Number(counts.sleeping),
      almostLostCount: Number(counts.almost_lost),
      sleeping: sleeping.map((r: any) => ({
        name: r.name, phone: r.phone, daysSince: Number(r.days_since),
        visits: Number(r.visits), spent: Math.round(Number(r.spent)),
      })),
      top: top.map((r: any) => ({
        name: r.name, phone: r.phone, visits: Number(r.visits), spent: Math.round(Number(r.spent)),
      })),
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
}
