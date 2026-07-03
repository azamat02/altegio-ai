import { Injectable } from '@nestjs/common';
import { MetricsService } from '../metrics/metrics.service';
import { TenantsService } from '../tenants/tenants.service';
import type { TmaSummary, StaffTableRow, TrendPoint, StaffCompareResponse, StaffDetail, TmaLosses, TmaClients } from '@altegio/shared';
import { previousWindow, inclusiveDays } from './period';
import { composeLosses, type LossIngredients } from './losses';

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
      dynamics: y.dynamics ?? null,
    };
  }

  async staff(tenantId: string, from: string, to: string): Promise<StaffTableRow[]> {
    return this.metrics.staffTable(tenantId, from, to, await this.tz(tenantId));
  }

  async staffCompare(tenantId: string, from: string, to: string): Promise<StaffCompareResponse> {
    const tz = await this.tz(tenantId);
    const prev = previousWindow(from, to);
    const [cur, prevRows] = await Promise.all([
      this.metrics.staffTable(tenantId, from, to, tz),
      this.metrics.staffTable(tenantId, prev.from, prev.to, tz),
    ]);
    const prevBy = new Map(prevRows.map((r) => [r.staffId, r.revenue]));
    const pct = (curV: number, prevV: number): number | null =>
      prevV > 0 ? Math.round(((curV - prevV) / prevV) * 100) : null;
    const rows = cur.map((r) => {
      const prevRevenue = prevBy.get(r.staffId) ?? 0;
      return { ...r, prevRevenue, deltaPct: pct(r.revenue, prevRevenue) };
    });
    const revenue = cur.reduce((s, r) => s + r.revenue, 0);
    const prevRevenue = prevRows.reduce((s, r) => s + r.revenue, 0);
    return { rows, totals: { revenue, prevRevenue, deltaPct: pct(revenue, prevRevenue) } };
  }

  async staffTrend(tenantId: string, staffId: number, days: number): Promise<TrendPoint[]> {
    const tz = await this.tz(tenantId);
    const endDate = this.subtractDays(this.todayInTz(tz), 1);
    return this.metrics.staffRevenueTrend(tenantId, staffId, days, endDate, tz);
  }

  async staffDetailFull(tenantId: string, staffId: number, from: string, to: string): Promise<StaffDetail | null> {
    const tz = await this.tz(tenantId);
    const base = await this.metrics.staffDetail(tenantId, staffId, from, to, tz);
    if (!base) return null;
    const endDate = this.subtractDays(this.todayInTz(tz), 1);
    const trend = await this.metrics.staffRevenueTrend(tenantId, staffId, 30, endDate, tz);
    return { ...base, trend };
  }

  async losses(tenantId: string, from: string, to: string): Promise<TmaLosses> {
    const tz = await this.tz(tenantId);
    const sleepingCutoff = this.subtractDays(this.todayInTz(tz), 60);
    const ingredients: LossIngredients = await this.metrics.lossesData(tenantId, from, to, tz, sleepingCutoff);
    return composeLosses(ingredients, inclusiveDays(from, to));
  }

  async clients(tenantId: string, sleepingDays: 30 | 60 | 90): Promise<TmaClients> {
    const tz = await this.tz(tenantId);
    const today = this.todayInTz(tz);
    return this.metrics.clientsAnalytics(
      tenantId,
      today,
      this.subtractDays(today, sleepingDays),
      this.subtractDays(today, 90),
    );
  }
}
