import type { Telegraf } from 'telegraf';
import type { BotContext } from '../utils/context';
import type { TenantsService } from '../../tenants/tenants.service';
import type { Repository } from 'typeorm';
import type { ReportDeliveryEntity } from '../../reports/entities/report-delivery.entity';
import type { BotLogsService } from '../bot-logs.service';

export function registerStatus(
  bot: Telegraf<BotContext>,
  deps: { tenants: TenantsService; deliveries: Repository<ReportDeliveryEntity>; logs: BotLogsService },
): void {
  bot.command('status', async (ctx) => {
    await deps.logs.log({ chatId: ctx.state.chatId, tenantId: null, command: '/status' });
    const lines: string[] = [];
    for (const link of ctx.state.tenants) {
      const t = await deps.tenants.findById(link.tenantId);
      if (!t) continue;
      const last = await deps.deliveries.findOne({
        where: { tenantId: link.tenantId, chatId: ctx.state.chatId, status: 'sent' },
        order: { sentAt: 'DESC' } as any,
      });
      lines.push(
        `*${t.salonName}*\n` +
        `• роль: ${link.role}\n` +
        `• автоотчёт: ${link.subscribed ? 'включён' : 'выключен'}\n` +
        `• время рассылки: ${t.reportTime} (${t.timezone})\n` +
        `• последняя доставка: ${last?.sentAt?.toISOString() ?? 'нет'}`,
      );
    }
    await ctx.reply(lines.join('\n\n'), { parse_mode: 'Markdown' });
  });
}
