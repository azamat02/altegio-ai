import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';

@Injectable()
export class AggregatorService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /**
   * Recompute daily_metrics + staff_daily for a given (tenant, date).
   * Destructive-and-replace strategy — simpler than partial updates.
   */
  async recomputeDay(tenantId: string, date: string /* YYYY-MM-DD */): Promise<void> {
    await this.ds.transaction(async (mgr) => {
      await mgr.query(
        `DELETE FROM daily_metrics WHERE tenant_id = $1 AND date = $2`,
        [tenantId, date],
      );
      await mgr.query(
        `DELETE FROM staff_daily WHERE tenant_id = $1 AND date = $2`,
        [tenantId, date],
      );
      await mgr.query(
        `
        INSERT INTO daily_metrics
          (tenant_id, date, revenue_total, visits_completed, visits_cancelled, avg_check, occupancy_pct, computed_at)
        SELECT
          $1::uuid,
          $2::date,
          COALESCE(SUM(cost) FILTER (WHERE attendance = 1 AND NOT deleted), 0),
          COUNT(*) FILTER (WHERE attendance = 1 AND NOT deleted),
          COUNT(*) FILTER (WHERE attendance = -1 AND NOT deleted),
          CASE
            WHEN COUNT(*) FILTER (WHERE attendance = 1 AND NOT deleted) = 0 THEN 0
            ELSE SUM(cost) FILTER (WHERE attendance = 1 AND NOT deleted) /
                 COUNT(*) FILTER (WHERE attendance = 1 AND NOT deleted)
          END,
          CASE
            WHEN (SELECT working_hours_per_day FROM tenants WHERE id = $1) = 0 THEN 0
            ELSE LEAST(100.0,
              COALESCE(SUM(seance_length) FILTER (WHERE attendance = 1 AND NOT deleted), 0)::numeric
              / NULLIF(
                  (SELECT COUNT(*) FROM staff
                    WHERE tenant_id = $1 AND NOT fired AND bookable)
                  * (SELECT working_hours_per_day FROM tenants WHERE id = $1)
                  * 3600, 0)
              * 100.0
            )
          END,
          now()
        FROM records
        WHERE tenant_id = $1 AND (datetime AT TIME ZONE (SELECT timezone FROM tenants WHERE id = $1))::date = $2
        `,
        [tenantId, date],
      );
      await mgr.query(
        `
        INSERT INTO staff_daily
          (tenant_id, altegio_staff_id, date, revenue, visits, cancelled, avg_check, computed_at)
        SELECT
          $1::uuid,
          altegio_staff_id,
          $2::date,
          COALESCE(SUM(cost) FILTER (WHERE attendance = 1 AND NOT deleted), 0),
          COUNT(*) FILTER (WHERE attendance = 1 AND NOT deleted),
          COUNT(*) FILTER (WHERE attendance = -1 AND NOT deleted),
          CASE
            WHEN COUNT(*) FILTER (WHERE attendance = 1 AND NOT deleted) = 0 THEN 0
            ELSE SUM(cost) FILTER (WHERE attendance = 1 AND NOT deleted) /
                 COUNT(*) FILTER (WHERE attendance = 1 AND NOT deleted)
          END,
          now()
        FROM records
        WHERE tenant_id = $1
          AND altegio_staff_id IS NOT NULL
          AND (datetime AT TIME ZONE (SELECT timezone FROM tenants WHERE id = $1))::date = $2
        GROUP BY altegio_staff_id
        `,
        [tenantId, date],
      );
    });
  }
}
