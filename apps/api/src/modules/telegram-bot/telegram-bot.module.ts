import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantChatsService } from './tenant-chats.service';
import { InviteCodeService } from './invite-code.service';
import { BotLogsService } from './bot-logs.service';
import { TenantChatEntity } from './entities/tenant-chat.entity';
import { TelegramInviteCodeEntity } from './entities/telegram-invite-code.entity';
import { TelegramBotLogEntity } from './entities/telegram-bot-log.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TenantChatEntity, TelegramInviteCodeEntity, TelegramBotLogEntity])],
  providers: [TenantChatsService, InviteCodeService, BotLogsService],
  exports: [TenantChatsService, InviteCodeService, BotLogsService],
})
export class TelegramBotModule {}
