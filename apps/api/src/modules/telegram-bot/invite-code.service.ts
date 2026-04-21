import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { randomInt } from 'crypto';
import { TelegramInviteCodeEntity } from './entities/telegram-invite-code.entity';

const TTL_MS = 24 * 3600 * 1000;
const MAX_COLLISION_RETRIES = 5;

@Injectable()
export class InviteCodeService {
  private readonly log = new Logger(InviteCodeService.name);

  constructor(
    @InjectRepository(TelegramInviteCodeEntity)
    private readonly repo: Repository<TelegramInviteCodeEntity>,
  ) {}

  async generate(tenantId: string, createdByChatId: number): Promise<{ code: string; expiresAt: Date }> {
    for (let i = 0; i < MAX_COLLISION_RETRIES; i++) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const existing = await this.repo.findOne({ where: { code } });
      if (existing) continue;
      const expiresAt = new Date(Date.now() + TTL_MS);
      await this.repo.save({
        code,
        tenantId,
        createdByChatId,
        expiresAt,
        usedByChatId: null,
        usedAt: null,
      } as TelegramInviteCodeEntity);
      return { code, expiresAt };
    }
    throw new Error('Failed to generate unique invite code after retries');
  }

  async consume(code: string, chatId: number): Promise<{ tenantId: string } | null> {
    const row = await this.repo.findOne({ where: { code } });
    if (!row) return null;
    if (row.expiresAt.getTime() <= Date.now()) return null;
    if (row.usedByChatId != null) return null;

    const result = await this.repo.update(
      { code, usedByChatId: IsNull() as any },
      { usedByChatId: chatId, usedAt: new Date() },
    );
    if (!result.affected) return null;
    return { tenantId: row.tenantId };
  }
}
