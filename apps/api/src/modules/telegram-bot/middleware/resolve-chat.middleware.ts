import type { BotContext } from '../utils/context';
import type { TenantChatsService } from '../tenant-chats.service';

export function resolveChatMiddleware(tenantChats: TenantChatsService) {
  return async (ctx: BotContext, next: () => Promise<void>): Promise<void> => {
    const chatId = ctx.chat?.id;
    if (!chatId) return next();
    const tenants = await tenantChats.listTenantsForChat(chatId);
    ctx.state = { ...(ctx.state || {}), chatId, tenants } as any;
    return next();
  };
}
