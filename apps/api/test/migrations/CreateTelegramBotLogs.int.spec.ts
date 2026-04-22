import { DataSource } from 'typeorm';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';

describe('CreateTelegramBotLogs1700000013000', () => {
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

  it('creates telegram_bot_logs table with correct columns', async () => {
    const columns = await ds.query(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'telegram_bot_logs' ORDER BY ordinal_position
    `);
    expect(columns.map((c: any) => c.column_name)).toEqual([
      'id', 'chat_id', 'tenant_id', 'command', 'args', 'responded_at',
    ]);
  });

  it('creates telegram_bot_logs with id as primary key (bigserial)', async () => {
    const pk = await ds.query(`
      SELECT a.attname FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = 'telegram_bot_logs'::regclass AND i.indisprimary
    `);
    expect(pk.map((r: any) => r.attname)).toEqual(['id']);
  });

  it('creates idx_telegram_bot_logs_chat_command_time index', async () => {
    const idx = await ds.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'telegram_bot_logs'
        AND indexname = 'idx_telegram_bot_logs_chat_command_time'
    `);
    expect(idx.length).toBe(1);
  });
});
