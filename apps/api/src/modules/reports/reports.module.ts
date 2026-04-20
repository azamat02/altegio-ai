import { Module } from '@nestjs/common';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MetricsModule } from '../metrics/metrics.module';
import { ReportsService } from './reports.service';
import { AiInsightService, AnthropicAdapter, IAnthropicAdapter } from './ai-insight.service';
import { AiInsightLogEntity } from './entities/ai-insight-log.entity';
import { ReportDeliveryEntity } from './entities/report-delivery.entity';
import { TelegramModule } from '../telegram/telegram.module';
import { TenantsModule } from '../tenants/tenants.module';
import { loadConfig } from '../../config/app.config';

const ANTHROPIC_ADAPTER = 'ANTHROPIC_ADAPTER';

@Module({
  imports: [
    MetricsModule,
    TelegramModule,
    TenantsModule,
    TypeOrmModule.forFeature([AiInsightLogEntity, ReportDeliveryEntity]),
  ],
  providers: [
    ReportsService,
    {
      provide: ANTHROPIC_ADAPTER,
      useFactory: (): IAnthropicAdapter => {
        const cfg = loadConfig();
        if (!cfg.ANTHROPIC_API_KEY) {
          return { generate: async () => { throw new Error('ANTHROPIC_API_KEY not set'); } };
        }
        return new AnthropicAdapter(cfg.ANTHROPIC_API_KEY);
      },
    },
    {
      provide: AiInsightService,
      inject: [ANTHROPIC_ADAPTER, getRepositoryToken(AiInsightLogEntity)],
      useFactory: (adapter: IAnthropicAdapter, logs: Repository<AiInsightLogEntity>) => {
        const cfg = loadConfig();
        return new AiInsightService(adapter, logs, {
          enabled: Boolean(cfg.ANTHROPIC_API_KEY),
          timeoutMs: 3000,
          model: cfg.ANTHROPIC_MODEL,
        });
      },
    },
  ],
  exports: [ReportsService, AiInsightService],
})
export class ReportsModule {}
