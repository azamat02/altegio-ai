import type { BotContext } from '../utils/context';

export function requireOwnerMiddleware() {
  return async (ctx: BotContext, next: () => Promise<void>): Promise<void> => {
    const hasOwner = ctx.state?.tenants?.some((t) => t.role === 'owner');
    if (hasOwner) return next();
    await ctx.reply('Эту команду может использовать только владелец салона.');
  };
}
