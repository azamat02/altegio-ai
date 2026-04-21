import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateResourceTables1700000006000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE resources (
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        altegio_id int NOT NULL,
        title text NOT NULL,
        fetched_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (tenant_id, altegio_id)
      )
    `);

    await qr.query(`
      CREATE TABLE resource_schedule (
        tenant_id uuid NOT NULL,
        resource_altegio_id int NOT NULL,
        date date NOT NULL,
        working_minutes int NOT NULL,
        fetched_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (tenant_id, resource_altegio_id, date)
      )
    `);

    await qr.query(`
      CREATE INDEX idx_resource_schedule_tenant_date
      ON resource_schedule (tenant_id, date)
    `);

    await qr.query(`
      CREATE TABLE resource_category_affinity (
        tenant_id uuid NOT NULL,
        resource_altegio_id int NOT NULL,
        category_altegio_id int NOT NULL,
        share numeric(5,4) NOT NULL,
        computed_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (tenant_id, resource_altegio_id, category_altegio_id)
      )
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query('DROP TABLE IF EXISTS resource_category_affinity');
    await qr.query('DROP TABLE IF EXISTS resource_schedule');
    await qr.query('DROP TABLE IF EXISTS resources');
  }
}
