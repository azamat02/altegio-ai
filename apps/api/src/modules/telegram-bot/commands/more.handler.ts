import type { Telegraf } from 'telegraf';
import type { BotContext } from '../utils/context';
import type { TenantChatEntity } from '../entities/tenant-chat.entity';
import { buildMoreMenu } from '../utils/keyboards';
import { handleStatusCommand, type StatusDeps } from './status.handler';
import { handleSubscribeCommand, type SubscribeDeps } from './subscribe.handler';
import { handleSyncCommand, type SyncDeps } from './sync.handler';
import { handleInviteCommand, type InviteDeps } from './invite.handler';

export type MoreDeps = StatusDeps & SubscribeDeps & SyncDeps & InviteDeps;

export function registerMore(bot: Telegraf<BotContext>, deps: MoreDeps): void {
  bot.hears('⚙️ Ещё', async (ctx) => {
    await deps.logs.log({ chatId: ctx.state.chatId, tenantId: null, command: '/more' });
    const owner = ctx.state.tenants.some((t: TenantChatEntity) => t.role === 'owner');
    await ctx.reply('Дополнительно:', { reply_markup: { inline_keyboard: buildMoreMenu(owner) } });
  });

  bot.action('more:status', async (ctx) => {
    await ctx.answerCbQuery();
    await handleStatusCommand(ctx as unknown as BotContext, deps);
  });

  bot.action(/^more:sub:(0|1)$/, async (ctx) => {
    await ctx.answerCbQuery();
    await handleSubscribeCommand(ctx as unknown as BotContext, deps, ctx.match[1] === '1');
  });

  bot.action('more:sync', async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.state.tenants.some((t: TenantChatEntity) => t.role === 'owner')) {
      await ctx.reply('Только для владельца.');
      return;
    }
    await handleSyncCommand(ctx as unknown as BotContext, deps);
  });

  bot.action('more:invite', async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.state.tenants.some((t: TenantChatEntity) => t.role === 'owner')) {
      await ctx.reply('Только для владельца.');
      return;
    }
    await handleInviteCommand(ctx as unknown as BotContext, deps);
  });
}
