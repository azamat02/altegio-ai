import { DataSource } from 'typeorm';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';

describe('CreateTenantChats1700000011000', () => {
  let container: StartedPostgreSqlContainer;
  let ds: DataSource;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16').start();
    ds = new DataSource({
      type: 'postgres',
      url: container.getConnectionUri(),
      entities: [],
      migrations: [__dirname + '/../../src/db/migrations/*.{ts,js}'],
      migrationsRun: false,
    });
    await ds.initialize();
    await ds.runMigrations();
  }, 120000);

  afterAll(async () => {
    await ds.destroy();
    await container.stop();
  });

  it('creates tenant_chats table with correct columns', async () => {
    const columns = await ds.query(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'tenant_chats' ORDER BY ordinal_position
    `);
    expect(columns.map((c: any) => c.column_name)).toEqual([
      'tenant_id', 'chat_id', 'role', 'subscribed', 'created_at',
    ]);
  });

  it('creates tenant_chats table with correct composite primary key', async () => {
    const pk = await ds.query(`
      SELECT a.attname FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = 'tenant_chats'::regclass AND i.indisprimary
      ORDER BY a.attname
    `);
    expect(pk.map((r: any) => r.attname).sort()).toEqual(['chat_id', 'tenant_id']);
  });

  it('backfills tenant_chats from tenants.telegram_chat_id on migration up', async () => {
    // Roll back past migration 11 (undo 14, 13, 12, 11).
    await ds.undoLastMigration();
    await ds.undoLastMigration();
    await ds.undoLastMigration();
    await ds.undoLastMigration();

    // Seed a tenant with telegram_chat_id set.
    await ds.query(`
      INSERT INTO tenants (salon_name, location_id, altegio_token_encrypted, timezone, telegram_chat_id)
      VALUES ('Test', 999999, decode('00', 'hex'), 'Asia/Almaty', 123456)
    `);

    // Re-run pending migrations (11 through 14).
    await ds.runMigrations();

    // Migration 11 must have backfilled tenant_chats.
    const rows = await ds.query(`
      SELECT chat_id, role, subscribed FROM tenant_chats WHERE chat_id = 123456
    `);
    expect(rows.length).toBe(1);
    expect(Number(rows[0].chat_id)).toBe(123456);
    expect(rows[0].role).toBe('owner');
    expect(rows[0].subscribed).toBe(true);
  });
});
