import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './db/database.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { AltegioModule } from './modules/altegio/altegio.module';
import { SyncModule } from './modules/sync/sync.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    TenantsModule,
    AltegioModule,
    SyncModule,
  ],
})
export class AppModule {}
