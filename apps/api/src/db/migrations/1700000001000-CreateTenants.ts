import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTenants1700000001000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE tenants (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        salon_name text NOT NULL,
        location_id bigint NOT NULL,
        chain_id bigint,
        altegio_token_encrypted bytea NOT NULL,
        timezone text NOT NULL DEFAULT 'Asia/Almaty',
        telegram_chat_id bigint,
        report_enabled boolean NOT NULL DEFAULT false,
        report_time time NOT NULL DEFAULT '09:00',
        working_hours_per_day integer NOT NULL DEFAULT 10,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (location_id)
      )
    `);
    await qr.query('CREATE INDEX idx_tenants_report_enabled ON tenants (report_enabled) WHERE report_enabled = true');
  }
  async down(qr: QueryRunner): Promise<void> {
    await qr.query('DROP TABLE tenants');
  }
}
