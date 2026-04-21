import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import { randomBytes } from 'node:crypto';

export interface TestDb {
  container: StartedPostgreSqlContainer;
  ds: DataSource;
  stop: () => Promise<void>;
}

export async function startTestDb(): Promise<TestDb> {
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('altegio_test')
    .withUsername('test')
    .withPassword('test')
    .start();

  process.env.DATABASE_URL = container.getConnectionUri();
  process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  process.env.ALTEGIO_PARTNER_TOKEN = 'test_token';
  process.env.ALTEGIO_USER_TOKEN = 'test_user';
  process.env.REDIS_URL = 'redis://localhost:6379';

  const ds = new DataSource({
    type: 'postgres',
    url: container.getConnectionUri(),
    entities: [__dirname + '/../../src/modules/**/*.entity.{ts,js}'],
    migrations: [__dirname + '/../../src/db/migrations/*.{ts,js}'],
    migrationsRun: true,
  });
  await ds.initialize();
  return {
    container,
    ds,
    stop: async () => {
      await ds.destroy();
      await container.stop();
    },
  };
}
