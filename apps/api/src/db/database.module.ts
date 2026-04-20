import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { loadConfig } from '../config/app.config';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => {
        const cfg = loadConfig();
        return {
          type: 'postgres',
          url: cfg.DATABASE_URL,
          entities: [__dirname + '/../modules/**/*.entity.{ts,js}'],
          migrations: [__dirname + '/migrations/*.{ts,js}'],
          migrationsRun: true,
          synchronize: false,
          logging: cfg.LOG_LEVEL === 'debug',
        };
      },
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
