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
});
