import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class ResourceAffinityService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /**
   * Recompute resource_category_affinity for a tenant using the last 90 days
   * of records with attendance=1.
   *
   * Algorithm:
   *  1. Explode resource_instance_ids via unnest, join services to get category_id.
   *  2. Group by (resource_id, category_id), keep pairs with n >= 3.
   *  3. Compute share = n / sum(n over resource).
   *  4. Upsert into resource_category_affinity.
   *  5. Delete stale rows (anything not touched in this run) via the RETURNING set.
   *
   * All done in a single SQL statement using CTEs so there is no TOCTOU race.
   */
  async recompute(tenantId: string): Promise<void> {
    await this.ds.query(
      `
      WITH exploded AS (
        SELECT r.tenant_id,
               unnested.resource_id,
               s.category_id AS category_altegio_id
        FROM records r
        CROSS JOIN LATERAL unnest(r.resource_instance_ids) AS unnested(resource_id)
        JOIN services s
          ON s.tenant_id = r.tenant_id AND s.altegio_service_id = r.altegio_service_id
        WHERE r.tenant_id = $1
          AND r.datetime >= now() - interval '90 days'
          AND r.attendance = 1
          AND cardinality(r.resource_instance_ids) > 0
          AND s.category_id IS NOT NULL
      ),
      counts AS (
        SELECT tenant_id, resource_id, category_altegio_id, COUNT(*)::int AS n
        FROM exploded
        GROUP BY tenant_id, resource_id, category_altegio_id
        HAVING COUNT(*) >= 3
      ),
      totals AS (
        SELECT tenant_id, resource_id, SUM(n)::int AS total
        FROM counts
        GROUP BY tenant_id, resource_id
      ),
      upserted AS (
        INSERT INTO resource_category_affinity
          (tenant_id, resource_altegio_id, category_altegio_id, share, computed_at)
        SELECT c.tenant_id,
               c.resource_id,
               c.category_altegio_id,
               (c.n::numeric / t.total)::numeric(5,4),
               now()
        FROM counts c
        JOIN totals t USING (tenant_id, resource_id)
        ON CONFLICT (tenant_id, resource_altegio_id, category_altegio_id)
        DO UPDATE SET share = EXCLUDED.share, computed_at = now()
        RETURNING tenant_id, resource_altegio_id, category_altegio_id
      )
      DELETE FROM resource_category_affinity a
      WHERE a.tenant_id = $1
        AND NOT EXISTS (
          SELECT 1 FROM upserted u
          WHERE u.tenant_id = a.tenant_id
            AND u.resource_altegio_id = a.resource_altegio_id
            AND u.category_altegio_id = a.category_altegio_id
        )
      `,
      [tenantId],
    );
  }
}
