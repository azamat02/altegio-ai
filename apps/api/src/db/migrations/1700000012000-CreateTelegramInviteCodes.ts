import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTelegramInviteCodes1700000012000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE telegram_invite_codes (
        code varchar(6) PRIMARY KEY,
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        created_by_chat_id bigint NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL,
        used_by_chat_id bigint NULL,
        used_at timestamptz NULL
      )
    `);
    await qr.query(`
      CREATE INDEX idx_telegram_invite_codes_tenant_expires
        ON telegram_invite_codes (tenant_id, expires_at)
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query('DROP TABLE IF EXISTS telegram_invite_codes');
  }
}
