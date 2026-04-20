import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { loadConfig } from '../config/app.config';

const cfg = loadConfig();

export const dataSource = new DataSource({
  type: 'postgres',
  url: cfg.DATABASE_URL,
  entities: [__dirname + '/../modules/**/*.entity.{ts,js}'],
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  migrationsRun: false,
  synchronize: false,
  logging: cfg.LOG_LEVEL === 'debug',
});
