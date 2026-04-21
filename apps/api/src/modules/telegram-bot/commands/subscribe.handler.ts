// subscribe.handler.ts
import type { Telegraf } from 'telegraf';
import type { BotContext } from '../utils/context';
import type { TenantChatsService } from '../tenant-chats.service';
import type { BotLogsService } from '../bot-logs.service';
import type { TenantsService } from '../../tenants/tenants.service';
import type { TenantChatEntity } from '../entities/tenant-chat.entity';
import { buildTenantPickerKeyboard } from '../utils/tenant-picker';

export function registerSubscribe(
  bot: Telegraf<BotContext>,
  deps: { chats: TenantChatsService; tenants: TenantsService; logs: BotLogsService },
): void {
  for (const [cmd, value, verb] of [['subscribe', true, 'включён'], ['unsubscribe', false, 'выключен']] as const) {
    bot.command(cmd, async (ctx) => {
      await deps.logs.log({ chatId: ctx.state.chatId, tenantId: null, command: `/${cmd}` });
      const links = ctx.state.tenants;
      if (links.length === 0) return;
      if (links.length === 1) {
        await deps.chats.setSubscribed(links[0].tenantId, ctx.state.chatId, value);
        await ctx.reply(`Автоотчёт ${verb}.`);
        return;
      }
      const options = await Promise.all(links.map(async (l: TenantChatEntity) => ({
        tenantId: l.tenantId, label: (await deps.tenants.findById(l.tenantId))?.salonName ?? l.tenantId,
      })));
      await ctx.reply(`Выбери салон чтобы ${cmd}:`, {
        reply_markup: { inline_keyboard: buildTenantPickerKeyboard(options, `sub:${value ? '1' : '0'}`) },
      });
    });
  }

  bot.action(/^sub:([01]):(\S+)$/, async (ctx) => {
    const [, flag, tenantId] = ctx.match;
    const subscribed = flag === '1';
    await ctx.answerCbQuery();
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    await deps.chats.setSubscribed(tenantId, chatId, subscribed);
    await ctx.reply(`Автоотчёт ${subscribed ? 'включён' : 'выключен'}.`);
  });
}
