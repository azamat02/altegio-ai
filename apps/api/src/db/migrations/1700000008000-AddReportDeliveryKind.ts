import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReportDeliveryKind1700000008000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    // Add the message_kind column with default value 'yesterday'.
    await qr.query(`
      ALTER TABLE report_deliveries
      ADD COLUMN message_kind text NOT NULL DEFAULT 'yesterday'
    `);

    // Drop the existing primary key on (tenant_id, date).
    await qr.query(`
      ALTER TABLE report_deliveries
      DROP CONSTRAINT report_deliveries_pkey
    `);

    // Drop old unique constraint if present (fallback).
    await qr.query(`
      ALTER TABLE report_deliveries
      DROP CONSTRAINT IF EXISTS uq_report_deliveries_tenant_date
    `);

    // Add new primary key on (tenant_id, date, message_kind).
    await qr.query(`
      ALTER TABLE report_deliveries
      ADD CONSTRAINT report_deliveries_pkey
      PRIMARY KEY (tenant_id, date, message_kind)
    `);

    // Add check constraint on message_kind values.
    await qr.query(`
      ALTER TABLE report_deliveries
      ADD CONSTRAINT chk_report_deliveries_kind
      CHECK (message_kind IN ('yesterday','today'))
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    // Reverse in opposite order: drop check constraint first.
    await qr.query('ALTER TABLE report_deliveries DROP CONSTRAINT IF EXISTS chk_report_deliveries_kind');

    // Drop the new primary key.
    await qr.query('ALTER TABLE report_deliveries DROP CONSTRAINT IF EXISTS report_deliveries_pkey');

    // Restore the original primary key on (tenant_id, date).
    await qr.query(`
      ALTER TABLE report_deliveries
      ADD CONSTRAINT report_deliveries_pkey
      PRIMARY KEY (tenant_id, date)
    `);

    // Drop the message_kind column.
    await qr.query('ALTER TABLE report_deliveries DROP COLUMN IF EXISTS message_kind');
  }
}
