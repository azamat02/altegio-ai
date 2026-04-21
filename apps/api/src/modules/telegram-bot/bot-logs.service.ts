import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TelegramBotLogEntity } from './entities/telegram-bot-log.entity';

export interface RateLimitQuery {
  chatId: number;
  command: string;
  max: number;
  windowMs: number;
  tenantId?: string;
}

@Injectable()
export class BotLogsService {
  constructor(
    @InjectRepository(TelegramBotLogEntity)
    private readonly repo: Repository<TelegramBotLogEntity>,
  ) {}

  async log(entry: { chatId: number; tenantId: string | null; command: string; args?: Record<string, unknown> }): Promise<void> {
    await this.repo.save({
      chatId: entry.chatId,
      tenantId: entry.tenantId,
      command: entry.command,
      args: entry.args ?? {},
    } as TelegramBotLogEntity);
  }

  async isAllowed(q: RateLimitQuery): Promise<boolean> {
    const since = new Date(Date.now() - q.windowMs);
    const qb = this.repo
      .createQueryBuilder('l')
      .where('l.chat_id = :chatId', { chatId: q.chatId })
      .andWhere('l.command = :command', { command: q.command })
      .andWhere('l.responded_at >= :since', { since });
    if (q.tenantId) qb.andWhere('l.tenant_id = :tenantId', { tenantId: q.tenantId });
    const count = await qb.getCount();
    return count < q.max;
  }
}
