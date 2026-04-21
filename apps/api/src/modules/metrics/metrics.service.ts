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
  // Task 17 — yesterdayUtilization (attendance = 1: completed visits only)
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
  // Task 20 (C3 fix) — todayUtilization (attendance IN (0,1): including scheduled)
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
  // Task 18 — monthlyGoal (I6: 60-day history gate + NaN/Infinity guard)
  // ---------------------------------------------------------------------------

  async monthlyGoal(
    tenantId: string,
    referenceDate: string,
    tz: string,
  ): Promise<{ target: number; mtd: number; pct: number } | null> {
    // Gate: earliest record must be at least 60 days before referenceDate
    const refD = new Date(referenceDate + 'T00:00:00Z');
    const cutoff = new Date(refD.getTime() - 60 * 86_400_000);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const [earliest] = await this.ds.query(
      `SELECT MIN((datetime AT TIME ZONE $2)::date)::text AS first_day
       FROM records
       WHERE tenant_id = $1`,
      [tenantId, tz],
    );
    if (!earliest.first_day || earliest.first_day > cutoffStr) return null;

    const refYear = refD.getUTCFullYear();
    const refMonth = refD.getUTCMonth() + 1; // 1-based

    // The 3 calendar months immediately before refDate's month
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

    // Monthly revenue for each of the 3 prior months (TZ-aware)
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
    const avgPrev =
      monthRevenues.reduce((sum, r) => sum + Number(r[0].rev), 0) / 3;
    const target = Math.round(avgPrev * 1.1);

    // Guard against zero/NaN target
    if (!target || !isFinite(target)) return null;

    // MTD: from first day of refDate's month up to (exclusive) referenceDate (TZ-aware)
    const mtdStart = `${refYear}-${String(refMonth).padStart(2, '0')}-01`;
    const [mtdRow] = await this.ds.query(
      `SELECT COALESCE(SUM(cost), 0)::numeric AS mtd
       FROM records
       WHERE tenant_id = $1 AND attendance = 1
         AND (datetime AT TIME ZONE $4)::date >= $2
         AND (datetime AT TIME ZONE $4)::date < $3`,
      [tenantId, mtdStart, referenceDate, tz],
    );
    const mtd = Math.round(Number(mtdRow.mtd));
    const pct = Math.round((mtd / target) * 100);
    if (!isFinite(pct)) return null;
    return { target, mtd, pct };
  }

  // ---------------------------------------------------------------------------
  // Task 19 — todayCategoryFillRates (C2 fix: TZ-aware date filter)
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
      [tenantId, date, tz],
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
    // I7: divide by 7 (not rows.length) for a true 7-day average
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
  // Task 20 — buildDailyReportData
  // ---------------------------------------------------------------------------

  async buildDailyReportData(tenantId: string, reportDate: string): Promise<DailyReportData> {
    const yesterday = this.subtractDays(reportDate, 1);
    const today = reportDate;
    const tenant = await this.tenants.findById(tenantId);
    if (!tenant) throw new Error(`Tenant ${tenantId} not found`);
    const tz = tenant.timezone;

    const [revenue, avg7, visits, topStaff, utilY, goal] = await Promise.all([
      this.yesterdayRevenue(tenantId, yesterday, tz),
      this.avg7Revenue(tenantId, yesterday, tz),
      this.yesterdayVisits(tenantId, yesterday, tz),
      this.yesterdayTopStaff(tenantId, yesterday, tz, 3),
      this.yesterdayUtilization(tenantId, yesterday, tz),
      this.monthlyGoal(tenantId, yesterday, tz),
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
}
