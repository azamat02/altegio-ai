import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantTargetUtilization1700000017000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE tenants ADD COLUMN target_utilization_pct int NOT NULL DEFAULT 80`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE tenants DROP COLUMN IF EXISTS target_utilization_pct`);
  }
}
