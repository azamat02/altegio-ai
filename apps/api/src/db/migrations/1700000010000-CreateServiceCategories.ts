import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateServiceCategories1700000010000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE service_categories (
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        altegio_category_id bigint NOT NULL,
        title text NOT NULL,
        fetched_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (tenant_id, altegio_category_id)
      )
    `);
  }
  async down(qr: QueryRunner): Promise<void> {
    await qr.query('DROP TABLE IF EXISTS service_categories');
  }
}
