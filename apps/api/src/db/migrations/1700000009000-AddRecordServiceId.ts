import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRecordServiceId1700000009000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE records ADD COLUMN altegio_service_id bigint
    `);
    await qr.query(`
      CREATE INDEX idx_records_tenant_service_datetime
      ON records (tenant_id, altegio_service_id, datetime)
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query('DROP INDEX IF EXISTS idx_records_tenant_service_datetime');
    await qr.query('ALTER TABLE records DROP COLUMN IF EXISTS altegio_service_id');
  }
}
