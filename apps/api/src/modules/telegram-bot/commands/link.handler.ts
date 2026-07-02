import type { Telegraf } from 'telegraf';
import type { BotContext } from '../utils/context';
import type { InviteCodeService } from '../invite-code.service';
import type { TenantChatsService } from '../tenant-chats.service';
import type { TenantsService } from '../../tenants/tenants.service';
import type { BotLogsService } from '../bot-logs.service';
import { buildMainReplyKeyboard } from '../utils/keyboards';

export function registerLink(
  bot: Telegraf<BotContext>,
  deps: {
    codes: InviteCodeService;
    chats: TenantChatsService;
    tenants: TenantsService;
    logs: BotLogsService;
    tmaUrl?: string;
  },
): void {
  bot.command('link', async (ctx) => {
    const chatId = ctx.state.chatId;
    const text = (ctx.message && 'text' in ctx.message ? ctx.message.text : '') as string;
    const parts = text.trim().split(/\s+/);
    const code = parts[1];

    await deps.logs.log({ chatId, tenantId: null, command: '/link', args: { code: code ?? null } });

    if (!code || !/^\d{6}$/.test(code)) {
      await ctx.reply('Формат: /link 123456 (6 цифр)');
      return;
    }

    const result = await deps.codes.consume(code, chatId);
    if (!result) {
      await ctx.reply('Код не найден, истёк или уже использован.');
      return;
    }

    const tenant = await deps.tenants.findById(result.tenantId);
    await deps.chats.linkMember(result.tenantId, chatId);
    await ctx.reply(
      `Подключено к салону «${tenant?.salonName ?? result.tenantId}». Автоотчёт включён, /unsubscribe чтобы выключить.`,
      { reply_markup: buildMainReplyKeyboard(deps.tmaUrl) },
    );
  });
}
