import type { Telegraf } from 'telegraf';
import type { BotContext } from '../utils/context';
import type { ReportsService } from '../../reports/reports.service';
import type { TenantsService } from '../../tenants/tenants.service';
import type { BotLogsService } from '../bot-logs.service';
import type { TenantChatEntity } from '../entities/tenant-chat.entity';
import { buildTenantPickerKeyboard } from '../utils/tenant-picker';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function registerReport(
  bot: Telegraf<BotContext>,
  deps: { reports: ReportsService; tenants: TenantsService; logs: BotLogsService },
): void {
  bot.command('report', async (ctx) => {
    const chatId = ctx.state.chatId;
    const parts = ((ctx.message && 'text' in ctx.message ? ctx.message.text : '') as string).trim().split(/\s+/);
    const arg = parts[1];
    await deps.logs.log({ chatId, tenantId: null, command: '/report', args: { arg: arg ?? null } });

    if (ctx.state.tenants.length > 1) {
      const options = await Promise.all(
        ctx.state.tenants.map(async (t: TenantChatEntity) => ({
          tenantId: t.tenantId,
          label: (await deps.tenants.findById(t.tenantId))?.salonName ?? t.tenantId,
        })),
      );
      await ctx.reply('Выбери салон:', {
        reply_markup: { inline_keyboard: buildTenantPickerKeyboard(options, `report:${arg ?? ''}`) },
      });
      return;
    }

    const tenantId = ctx.state.tenants[0].tenantId;
    await runReport(ctx as unknown as BotContext, deps, tenantId, arg);
  });

  bot.action(/^report:(\S*):(\S+)$/, async (ctx) => {
    const [, arg, tenantId] = ctx.match;
    await ctx.answerCbQuery();
    await runReport(ctx as unknown as BotContext, deps, tenantId, arg || undefined);
  });
}

async function runReport(
  ctx: BotContext,
  deps: { reports: ReportsService; tenants: TenantsService },
  tenantId: string,
  dateArg?: string,
): Promise<void> {
  const tenant = await deps.tenants.findById(tenantId);
  if (!tenant) { await ctx.reply('Салон не найден.'); return; }

  const todayInTz = nowInTz(tenant.timezone);
  const reportDate = dateArg ?? todayInTz;
  if (!ISO_DATE.test(reportDate)) {
    await ctx.reply('Формат даты: YYYY-MM-DD. Пример: /report 2026-04-20');
    return;
  }
  const createdDay = tenant.createdAt.toISOString().slice(0, 10);
  if (reportDate > todayInTz || reportDate < createdDay) {
    await ctx.reply(`Нет данных на эту дату. Доступно: ${createdDay} – ${todayInTz}.`);
    return;
  }

  await ctx.reply('⏳ Готовлю отчёт…');
  try {
    // Manual /report: используем buildMessages (без записи в deliveries),
    // отправляем только в инициатор — fan-out не нужен.
    const msgs = await deps.reports.buildMessages(tenantId, reportDate);
    await ctx.reply(msgs.yesterday);
    await ctx.reply(msgs.today);
  } catch (err: any) {
    await ctx.reply(`Ошибка: ${String(err?.message ?? err).slice(0, 200)}`);
  }
}

function nowInTz(tz: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(new Date()); // YYYY-MM-DD
}
