import type { Telegraf } from 'telegraf';
import type { BotContext } from '../utils/context';
import type { BotLogsService } from '../bot-logs.service';
import { buildMainReplyKeyboard } from '../utils/keyboards';

export function registerStart(bot: Telegraf<BotContext>, deps: { logs: BotLogsService; tmaUrl?: string }): void {
  // The reply-keyboard dashboard key is plain text (SimpleWebView buttons get
  // no initData) — answer it with an inline web_app button, which does.
  if (deps.tmaUrl) {
    const tmaUrl = deps.tmaUrl;
    bot.hears('📱 Дашборд', async (ctx) => {
      await deps.logs.log({ chatId: ctx.state.chatId, tenantId: null, command: '/dashboard' });
      await ctx.reply('Дашборд салона:', {
        reply_markup: { inline_keyboard: [[{ text: '📱 Открыть дашборд', web_app: { url: tmaUrl } }]] },
      });
    });
  }

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
