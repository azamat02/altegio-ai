import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReportDeliveryKind1700000008000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE report_deliveries
      ADD COLUMN message_kind text NOT NULL DEFAULT 'yesterday'
    `);
    // Drop old unique (tenant, date) if present, add per-kind unique.
    await qr.query(`
      ALTER TABLE report_deliveries
      DROP CONSTRAINT IF EXISTS uq_report_deliveries_tenant_date
    `);
    await qr.query(`
      ALTER TABLE report_deliveries
      ADD CONSTRAINT uq_report_deliveries_tenant_date_kind
      UNIQUE (tenant_id, date, message_kind)
    `);
    await qr.query(`
      ALTER TABLE report_deliveries
      ADD CONSTRAINT chk_report_deliveries_kind
      CHECK (message_kind IN ('yesterday','today'))
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query('ALTER TABLE report_deliveries DROP CONSTRAINT IF EXISTS chk_report_deliveries_kind');
    await qr.query('ALTER TABLE report_deliveries DROP CONSTRAINT IF EXISTS uq_report_deliveries_tenant_date_kind');
    await qr.query('ALTER TABLE report_deliveries DROP COLUMN IF EXISTS message_kind');
  }
}
