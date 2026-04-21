import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExtendReportDeliveriesPk1700000014000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE report_deliveries ADD COLUMN chat_id bigint NULL`);
    await qr.query(`
      UPDATE report_deliveries rd
      SET chat_id = t.telegram_chat_id
      FROM tenants t
      WHERE rd.tenant_id = t.id
    `);
    await qr.query(`DELETE FROM report_deliveries WHERE chat_id IS NULL`);
    await qr.query(`ALTER TABLE report_deliveries ALTER COLUMN chat_id SET NOT NULL`);
    await qr.query(`ALTER TABLE report_deliveries DROP CONSTRAINT IF EXISTS report_deliveries_pkey`);
    await qr.query(`
      ALTER TABLE report_deliveries
      ADD CONSTRAINT report_deliveries_pkey
      PRIMARY KEY (tenant_id, date, message_kind, chat_id)
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`
      DELETE FROM report_deliveries rd
      USING tenants t
      WHERE rd.tenant_id = t.id
        AND rd.chat_id IS DISTINCT FROM t.telegram_chat_id
    `);
    await qr.query(`ALTER TABLE report_deliveries DROP CONSTRAINT IF EXISTS report_deliveries_pkey`);
    await qr.query(`
      ALTER TABLE report_deliveries
      ADD CONSTRAINT report_deliveries_pkey
      PRIMARY KEY (tenant_id, date, message_kind)
    `);
    await qr.query(`ALTER TABLE report_deliveries DROP COLUMN IF EXISTS chat_id`);
  }
}
