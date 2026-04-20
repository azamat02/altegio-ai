import { Module } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { TenantsModule } from '../tenants/tenants.module';

@Module({
  imports: [TenantsModule],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
