import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantMonthlyGoal1700000015000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE tenants ADD COLUMN monthly_goal bigint NULL`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE tenants DROP COLUMN IF EXISTS monthly_goal`);
  }
}
