import type { Telegraf } from 'telegraf';
import type { BotContext } from '../utils/context';
import type { BotLogsService } from '../bot-logs.service';
import { buildMainReplyKeyboard } from '../utils/keyboards';

export function registerStart(bot: Telegraf<BotContext>, deps: { logs: BotLogsService; tmaUrl?: string }): void {
  bot.start(async (ctx) => {
    await deps.logs.log({ chatId: ctx.state.chatId, tenantId: null, command: '/start' });
    const linked = ctx.state.tenants.length > 0;
    if (linked) {
      await ctx.reply(
        'С возвращением! Управляйте салоном кнопками ниже 👇',
        { parse_mode: 'HTML', reply_markup: buildMainReplyKeyboard(deps.tmaUrl) },
      );
    } else {
      await ctx.reply(
        'Привет! Это бот аналитики салона.\n\n' +
        'Если владелец салона прислал вам код — введите:\n<code>/link 123456</code>\n\n' +
        '/help — список команд.',
        { parse_mode: 'HTML' },
      );
    }
  });
}
