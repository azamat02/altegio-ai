import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRecordResourceInstanceIds1700000007000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE records
      ADD COLUMN resource_instance_ids bigint[] NOT NULL DEFAULT '{}'
    `);
    await qr.query(`
      CREATE INDEX idx_records_resource_gin
      ON records USING gin (resource_instance_ids)
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query('DROP INDEX IF EXISTS idx_records_resource_gin');
    await qr.query('ALTER TABLE records DROP COLUMN IF EXISTS resource_instance_ids');
  }
}
