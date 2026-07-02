import type { Telegraf } from 'telegraf';
import type { BotContext } from '../utils/context';
import type { BotLogsService } from '../bot-logs.service';

export function registerHelp(bot: Telegraf<BotContext>, logs: BotLogsService): void {
  bot.help(async (ctx) => {
    await logs.log({ chatId: ctx.state.chatId, tenantId: null, command: '/help' });
    const lines = [
      '<b>Основное</b>',
      '📊 Отчёт — /report [YYYY-MM-DD]',
      '👥 Мастера — /staff [YYYY-MM-DD]',
      '📈 Статус доставки — /status',
      '🔔 Подписка — /subscribe on|off',
      '',
      '<b>Для владельца</b>',
      '🎟 Инвайт сотрудника — /invite',
      '🔄 Синк данных — /sync',
      '',
      '<b>Прочее</b>',
      '🔗 Привязка по коду — /link <code>код</code>',
      'Кнопки внизу чата дублируют главные действия.',
    ];
    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
  });
}
