import type { BotContext } from '../utils/context';

export function requireLinkedMiddleware() {
  return async (ctx: BotContext, next: () => Promise<void>): Promise<void> => {
    if (ctx.state?.tenants && ctx.state.tenants.length > 0) return next();
    await ctx.reply(
      'Чат не привязан к салону. Попроси владельца команду /invite и пришли сюда /link <код>.',
    );
  };
}
