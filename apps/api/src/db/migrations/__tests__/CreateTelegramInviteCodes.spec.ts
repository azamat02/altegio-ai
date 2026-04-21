import { DataSource } from 'typeorm';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';

describe('CreateTelegramInviteCodes1700000012000', () => {
  let container: StartedPostgreSqlContainer;
  let ds: DataSource;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16').start();
    ds = new DataSource({
      type: 'postgres',
      url: container.getConnectionUri(),
      entities: [],
      migrations: [__dirname + '/../*.{ts,js}'],
      migrationsRun: false,
    });
    await ds.initialize();
    await ds.runMigrations();
  }, 120000);

  afterAll(async () => {
    await ds.destroy();
    await container.stop();
  });

  it('creates telegram_invite_codes table with correct columns', async () => {
    const columns = await ds.query(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'telegram_invite_codes' ORDER BY ordinal_position
    `);
    expect(columns.map((c: any) => c.column_name)).toEqual([
      'code', 'tenant_id', 'created_by_chat_id', 'created_at', 'expires_at',
      'used_by_chat_id', 'used_at',
    ]);
  });

  it('creates telegram_invite_codes with code as primary key', async () => {
    const pk = await ds.query(`
      SELECT a.attname FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = 'telegram_invite_codes'::regclass AND i.indisprimary
    `);
    expect(pk.map((r: any) => r.attname)).toEqual(['code']);
  });

  it('creates idx_telegram_invite_codes_tenant_expires index', async () => {
    const idx = await ds.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'telegram_invite_codes'
        AND indexname = 'idx_telegram_invite_codes_tenant_expires'
    `);
    expect(idx.length).toBe(1);
  });
});
