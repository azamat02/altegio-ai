import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFactsLayer1700000003000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE staff (
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        altegio_staff_id bigint NOT NULL,
        name text NOT NULL,
        specialization text,
        position_title text,
        fired boolean NOT NULL DEFAULT false,
        bookable boolean NOT NULL DEFAULT true,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (tenant_id, altegio_staff_id)
      )
    `);

    await qr.query(`
      CREATE TABLE services (
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        altegio_service_id bigint NOT NULL,
        title text NOT NULL,
        category_id bigint,
        price_min numeric(12,2),
        price_max numeric(12,2),
        active boolean NOT NULL DEFAULT true,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (tenant_id, altegio_service_id)
      )
    `);

    await qr.query(`
      CREATE TABLE clients (
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        altegio_client_id bigint NOT NULL,
        name text,
        phone text,
        visits_count int,
        last_visit_date date,
        spent numeric(14,2),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (tenant_id, altegio_client_id)
      )
    `);

    await qr.query(`
      CREATE TABLE records (
        id bigserial PRIMARY KEY,
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        altegio_record_id bigint NOT NULL,
        altegio_staff_id bigint,
        altegio_client_id bigint,
        datetime timestamptz NOT NULL,
        seance_length int,
        cost numeric(12,2) NOT NULL DEFAULT 0,
        attendance smallint NOT NULL DEFAULT 0,
        paid_full smallint NOT NULL DEFAULT 0,
        is_online boolean NOT NULL DEFAULT false,
        deleted boolean NOT NULL DEFAULT false,
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, altegio_record_id)
      )
    `);
    await qr.query('CREATE INDEX idx_records_tenant_datetime ON records (tenant_id, datetime)');
    await qr.query('CREATE INDEX idx_records_tenant_staff_datetime ON records (tenant_id, altegio_staff_id, datetime)');
  }
  async down(qr: QueryRunner): Promise<void> {
    await qr.query('DROP TABLE records');
    await qr.query('DROP TABLE clients');
    await qr.query('DROP TABLE services');
    await qr.query('DROP TABLE staff');
  }
}
