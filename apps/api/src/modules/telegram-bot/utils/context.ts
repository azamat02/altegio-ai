import type { Context } from 'telegraf';
import type { TenantChatEntity } from '../entities/tenant-chat.entity';

export interface BotContext extends Context {
  state: {
    chatId: number;
    tenants: TenantChatEntity[];
  };
}

export function hasLinkedTenants(ctx: BotContext): boolean {
  return ctx.state.tenants.length > 0;
}

export function isOwner(ctx: BotContext, tenantId: string): boolean {
  return ctx.state.tenants.some((t) => t.tenantId === tenantId && t.role === 'owner');
}
