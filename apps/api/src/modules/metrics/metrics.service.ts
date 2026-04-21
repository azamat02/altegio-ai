import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantsService } from '../tenants/tenants.service';
import { DailyReportData } from '@altegio/shared';

@Injectable()
export class MetricsService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly tenants: TenantsService,
  ) {}

  async getDailyReportData(tenantId: string, reportDate: string): Promise<DailyReportData> {
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
