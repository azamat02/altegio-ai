import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInfraTables1700000005000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE sync_jobs (
        id bigserial PRIMARY KEY,
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        status text NOT NULL,
        started_at timestamptz NOT NULL DEFAULT now(),
        finished_at timestamptz,
        records_fetched int NOT NULL DEFAULT 0,
        error text
      )
    `);
    await qr.query('CREATE INDEX idx_sync_jobs_tenant_started ON sync_jobs (tenant_id, started_at DESC)');

    await qr.query(`
      CREATE TABLE report_deliveries (
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        date date NOT NULL,
        message_id bigint,
        sent_at timestamptz,
        status text NOT NULL,
        error text,
        PRIMARY KEY (tenant_id, date)
      )
    `);

    await qr.query(`
      CREATE TABLE ai_insight_logs (
        id bigserial PRIMARY KEY,
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        date date NOT NULL,
        prompt_hash text NOT NULL,
        response text,
        ms integer,
        status text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
  }
  async down(qr: QueryRunner): Promise<void> {
    await qr.query('DROP TABLE ai_insight_logs');
    await qr.query('DROP TABLE report_deliveries');
    await qr.query('DROP TABLE sync_jobs');
  }
}
