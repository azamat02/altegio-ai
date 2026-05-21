import type { Telegraf } from 'telegraf';
import type { BotContext } from '../utils/context';
import type { BotLogsService } from '../bot-logs.service';
import type { TenantChatEntity } from '../entities/tenant-chat.entity';

export function registerHelp(bot: Telegraf<BotContext>, logs: BotLogsService): void {
  bot.help(async (ctx) => {
    await logs.log({ chatId: ctx.state.chatId, tenantId: null, command: '/help' });
    const tenants = ctx.state.tenants;
    const isLinked = tenants.length > 0;
    const isOwner = tenants.some((t: TenantChatEntity) => t.role === 'owner');

    const lines: string[] = ['*Команды*', ''];
    lines.push('/start — приветствие');
    lines.push('/help — эта справка');
    lines.push('/link <код> — подключить чат к салону');
    if (isLinked) {
      lines.push('/report [YYYY-MM-DD] — отчёт (по умолчанию сегодня)');
      lines.push('/staff [YYYY-MM-DD] — мастера за день');
      lines.push('/status — статус подписки');
      lines.push('/subscribe — включить автоотчёт');
      lines.push('/unsubscribe — выключить автоотчёт');
    }
    if (isOwner) {
      lines.push('/invite — сгенерировать код для второго чата');
      lines.push('/sync — запустить синхронизацию с Altegio');
    }
    await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
  });
}
