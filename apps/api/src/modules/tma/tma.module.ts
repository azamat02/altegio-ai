import { Module } from '@nestjs/common';
import { TmaController } from './tma.controller';
import { TmaService } from './tma.service';
import { TmaAuthGuard } from './tma-auth.guard';
import { MetricsModule } from '../metrics/metrics.module';
import { TenantsModule } from '../tenants/tenants.module';
import { TelegramBotModule } from '../telegram-bot/telegram-bot.module';

@Module({
  imports: [MetricsModule, TenantsModule, TelegramBotModule],
  controllers: [TmaController],
  providers: [TmaService, TmaAuthGuard],
})
export class TmaModule {}
