import type { Telegraf } from 'telegraf';
import type { BotContext } from '../utils/context';
import type { BotLogsService } from '../bot-logs.service';

export function registerStart(bot: Telegraf<BotContext>, logs: BotLogsService): void {
  bot.start(async (ctx) => {
    await logs.log({ chatId: ctx.state.chatId, tenantId: null, command: '/start' });
    const linked = ctx.state.tenants.length > 0;
    if (linked) {
      await ctx.reply(
        'С возвращением. Бот активен. /help — список команд.',
      );
    } else {
      await ctx.reply(
        'Привет! Это бот аналитики салона.\n\n' +
        'Если владелец салона прислал тебе код — введи:\n`/link 123456`\n\n' +
        '/help — список команд.',
        { parse_mode: 'Markdown' },
      );
    }
  });
}
