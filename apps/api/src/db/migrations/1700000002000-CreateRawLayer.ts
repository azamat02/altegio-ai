import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRawLayer1700000002000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE altegio_raw_records (
        id bigserial PRIMARY KEY,
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        altegio_record_id bigint NOT NULL,
        payload jsonb NOT NULL,
        fetched_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, altegio_record_id)
      )
    `);
    await qr.query('CREATE INDEX idx_raw_records_tenant_fetched ON altegio_raw_records (tenant_id, fetched_at DESC)');

    await qr.query(`
      CREATE TABLE altegio_raw_clients (
        id bigserial PRIMARY KEY,
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        altegio_client_id bigint NOT NULL,
        payload jsonb NOT NULL,
        fetched_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, altegio_client_id)
      )
    `);

    await qr.query(`
      CREATE TABLE altegio_raw_staff (
        id bigserial PRIMARY KEY,
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        altegio_staff_id bigint NOT NULL,
        payload jsonb NOT NULL,
        fetched_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, altegio_staff_id)
      )
    `);

    await qr.query(`
      CREATE TABLE altegio_raw_services (
        id bigserial PRIMARY KEY,
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        altegio_service_id bigint NOT NULL,
        payload jsonb NOT NULL,
        fetched_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, altegio_service_id)
      )
    `);
  }
  async down(qr: QueryRunner): Promise<void> {
    await qr.query('DROP TABLE altegio_raw_services');
    await qr.query('DROP TABLE altegio_raw_staff');
    await qr.query('DROP TABLE altegio_raw_clients');
    await qr.query('DROP TABLE altegio_raw_records');
  }
}
