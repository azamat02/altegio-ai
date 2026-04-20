import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './db/database.module';
import { QueuesModule } from './queues/queues.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { AltegioModule } from './modules/altegio/altegio.module';
import { SyncModule } from './modules/sync/sync.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { ReportsModule } from './modules/reports/reports.module';
import { TelegramModule } from './modules/telegram/telegram.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    QueuesModule,
    TenantsModule,
    AltegioModule,
    SyncModule,
    MetricsModule,
    ReportsModule,
    TelegramModule,
    SchedulerModule.forRoot(),
    HealthModule,
  ],
})
export class AppModule {}
