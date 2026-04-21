import type { BotContext } from '../utils/context';
import type { BotLogsService } from '../bot-logs.service';

export interface RateLimitConfig {
  command: string;
  max: number;
  windowMs: number;
  perTenant?: boolean;
}

export function rateLimitMiddleware(logs: BotLogsService, cfg: RateLimitConfig) {
  return async (ctx: BotContext, next: () => Promise<void>): Promise<void> => {
    const chatId = ctx.state?.chatId;
    if (!chatId) return next();
    const tenantId = cfg.perTenant ? ctx.state?.tenants?.[0]?.tenantId : undefined;
    const ok = await logs.isAllowed({ chatId, command: cfg.command, max: cfg.max, windowMs: cfg.windowMs, tenantId });
    if (!ok) {
      const seconds = Math.ceil(cfg.windowMs / 1000);
      await ctx.reply(`Слишком часто. Подожди ~${seconds} сек и попробуй снова.`);
      return;
    }
    return next();
  };
}
