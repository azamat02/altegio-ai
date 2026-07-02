import { Injectable } from '@nestjs/common';
import { MetricsService } from '../metrics/metrics.service';
import { TenantsService } from '../tenants/tenants.service';
import type { TmaSummary, StaffTableRow, TrendPoint } from '@altegio/shared';

@Injectable()
export class TmaService {
  constructor(
    private readonly metrics: MetricsService,
    private readonly tenants: TenantsService,
  ) {}

  private subtractDays(date: string, n: number): string {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d) - n * 86400000).toISOString().slice(0, 10);
  }

  private todayInTz(tz: string): string {
    return new Date().toLocaleDateString('en-CA', { timeZone: tz }); // 'YYYY-MM-DD' in tenant tz
  }

  private async tz(tenantId: string): Promise<string> {
    const t = await this.tenants.findById(tenantId);
    if (!t) throw new Error(`Tenant ${tenantId} not found`);
    return t.timezone;
  }

  async summary(tenantId: string, date?: string): Promise<TmaSummary> {
    const t = await this.tenants.findById(tenantId);
    if (!t) throw new Error(`Tenant ${tenantId} not found`);
    const tz = t.timezone;
    const summarizedDay = date ?? this.subtractDays(this.todayInTz(tz), 1);
    // buildDailyReportData reports on (arg - 1), so pass summarizedDay + 1
    const reportDate = this.subtractDays(summarizedDay, -1);
    const data = await this.metrics.buildDailyReportData(tenantId, reportDate);
    const y = data.yesterday; // == summarizedDay
    const revenue30d = await this.metrics.revenueSeries(tenantId, 30, y.date, tz);
    return {
      salonName: data.salonName,
      date: y.date,
      revenue: y.revenue,
      deltaPct: y.deltaPct,
      avgCheck: y.avgCheck,
      came: y.came,
      cancelled: y.cancelled,
      utilizationPct: y.utilizationPct,
      topStaff: y.topStaff?.[0] ?? null,
      revenue30d,
    };
  }

  async staff(tenantId: string, from: string, to: string): Promise<StaffTableRow[]> {
    return this.metrics.staffTable(tenantId, from, to, await this.tz(tenantId));
  }

  async staffTrend(tenantId: string, staffId: number, days: number): Promise<TrendPoint[]> {
    const tz = await this.tz(tenantId);
    const endDate = this.subtractDays(this.todayInTz(tz), 1);
    return this.metrics.staffRevenueTrend(tenantId, staffId, days, endDate, tz);
  }
}
