import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTelegramBotLogs1700000013000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE telegram_bot_logs (
        id bigserial PRIMARY KEY,
        chat_id bigint NOT NULL,
        tenant_id uuid NULL REFERENCES tenants(id) ON DELETE SET NULL,
        command varchar(32) NOT NULL,
        args jsonb NOT NULL DEFAULT '{}'::jsonb,
        responded_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await qr.query(`
      CREATE INDEX idx_telegram_bot_logs_chat_command_time
        ON telegram_bot_logs (chat_id, command, responded_at DESC)
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query('DROP TABLE IF EXISTS telegram_bot_logs');
  }
}
