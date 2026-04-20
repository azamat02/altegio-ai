import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './db/database.module';
import { QueuesModule } from './queues/queues.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { AltegioModule } from './modules/altegio/altegio.module';
import { SyncModule } from './modules/sync/sync.module';
import { MetricsModule } from './modules/metrics/metrics.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    QueuesModule,
    TenantsModule,
    AltegioModule,
    SyncModule,
    MetricsModule,
  ],
})
export class AppModule {}
