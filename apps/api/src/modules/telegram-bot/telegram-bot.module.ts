import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantChatsService } from './tenant-chats.service';
import { InviteCodeService } from './invite-code.service';
import { BotLogsService } from './bot-logs.service';
import { TelegramBotService } from './telegram-bot.service';
import { TenantChatEntity } from './entities/tenant-chat.entity';
import { TelegramInviteCodeEntity } from './entities/telegram-invite-code.entity';
import { TelegramBotLogEntity } from './entities/telegram-bot-log.entity';
import { ReportDeliveryEntity } from '../reports/entities/report-delivery.entity';
import { TenantsModule } from '../tenants/tenants.module';
import { TelegramModule } from '../telegram/telegram.module';
import { SyncModule } from '../sync/sync.module';
import { ReportsModule } from '../reports/reports.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TenantChatEntity, TelegramInviteCodeEntity, TelegramBotLogEntity, ReportDeliveryEntity,
    ]),
    TenantsModule,
    TelegramModule,
    SyncModule,
    forwardRef(() => ReportsModule),
  ],
  providers: [TenantChatsService, InviteCodeService, BotLogsService, TelegramBotService],
  exports: [TenantChatsService, InviteCodeService, BotLogsService],
})
export class TelegramBotModule {}
