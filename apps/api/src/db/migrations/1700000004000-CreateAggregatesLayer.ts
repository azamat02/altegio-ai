import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAggregatesLayer1700000004000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE daily_metrics (
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        date date NOT NULL,
        revenue_total numeric(14,2) NOT NULL DEFAULT 0,
        visits_completed int NOT NULL DEFAULT 0,
        visits_cancelled int NOT NULL DEFAULT 0,
        avg_check numeric(12,2) NOT NULL DEFAULT 0,
        occupancy_pct numeric(5,2) NOT NULL DEFAULT 0,
        computed_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (tenant_id, date)
      )
    `);
    await qr.query(`
      CREATE TABLE staff_daily (
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        altegio_staff_id bigint NOT NULL,
        date date NOT NULL,
        revenue numeric(14,2) NOT NULL DEFAULT 0,
        visits int NOT NULL DEFAULT 0,
        cancelled int NOT NULL DEFAULT 0,
        avg_check numeric(12,2) NOT NULL DEFAULT 0,
        computed_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (tenant_id, altegio_staff_id, date)
      )
    `);
  }
  async down(qr: QueryRunner): Promise<void> {
    await qr.query('DROP TABLE staff_daily');
    await qr.query('DROP TABLE daily_metrics');
  }
}
