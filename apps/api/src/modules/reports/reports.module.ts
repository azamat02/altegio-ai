import { Module } from '@nestjs/common';
import { MetricsModule } from '../metrics/metrics.module';
import { ReportsService } from './reports.service';

@Module({
  imports: [MetricsModule],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
