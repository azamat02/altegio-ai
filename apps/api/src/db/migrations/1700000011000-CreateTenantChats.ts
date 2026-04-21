import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTenantChats1700000011000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE tenant_chats (
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        chat_id bigint NOT NULL,
        role text NOT NULL,
        subscribed boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (tenant_id, chat_id),
        CONSTRAINT chk_tenant_chats_role CHECK (role IN ('owner','member'))
      )
    `);
    await qr.query(`CREATE INDEX idx_tenant_chats_chat_id ON tenant_chats (chat_id)`);
    await qr.query(`
      INSERT INTO tenant_chats (tenant_id, chat_id, role, subscribed)
      SELECT id, telegram_chat_id, 'owner', true
      FROM tenants
      WHERE telegram_chat_id IS NOT NULL
      ON CONFLICT DO NOTHING
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query('DROP TABLE IF EXISTS tenant_chats');
  }
}
