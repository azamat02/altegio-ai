import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantChatEntity, TenantChatRole } from './entities/tenant-chat.entity';

@Injectable()
export class TenantChatsService {
  constructor(
    @InjectRepository(TenantChatEntity)
    private readonly repo: Repository<TenantChatEntity>,
  ) {}

  listTenantsForChat(chatId: number): Promise<TenantChatEntity[]> {
    return this.repo.find({ where: { chatId } });
  }

  listSubscribedChats(tenantId: string): Promise<TenantChatEntity[]> {
    return this.repo.find({ where: { tenantId, subscribed: true } });
  }

  async linkMember(tenantId: string, chatId: number): Promise<void> {
    await this.repo.save({ tenantId, chatId, role: 'member', subscribed: true } as TenantChatEntity);
  }

  async linkOwner(tenantId: string, chatId: number): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .insert()
      .values({ tenantId, chatId, role: 'owner', subscribed: true })
      .orUpdate(['role', 'subscribed'], ['tenant_id', 'chat_id'])
      .execute();
  }

  async setSubscribed(tenantId: string, chatId: number, subscribed: boolean): Promise<void> {
    await this.repo.update({ tenantId, chatId }, { subscribed });
  }

  async findRole(tenantId: string, chatId: number): Promise<TenantChatRole | null> {
    const row = await this.repo.findOne({ where: { tenantId, chatId } });
    return row ? row.role : null;
  }
}
