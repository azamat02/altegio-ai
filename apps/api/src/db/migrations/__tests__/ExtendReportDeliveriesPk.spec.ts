import { DataSource } from 'typeorm';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';

describe('ExtendReportDeliveriesPk1700000014000', () => {
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

  it('report_deliveries has chat_id column (bigint, not null)', async () => {
    const columns = await ds.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'report_deliveries' AND column_name = 'chat_id'
    `);
    expect(columns.length).toBe(1);
    expect(columns[0].data_type).toBe('bigint');
    expect(columns[0].is_nullable).toBe('NO');
  });

  it('report_deliveries primary key includes chat_id', async () => {
    const pk = await ds.query(`
      SELECT a.attname FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = 'report_deliveries'::regclass AND i.indisprimary
      ORDER BY a.attname
    `);
    expect(pk.map((r: any) => r.attname).sort()).toEqual([
      'chat_id', 'date', 'message_kind', 'tenant_id',
    ]);
  });
});
