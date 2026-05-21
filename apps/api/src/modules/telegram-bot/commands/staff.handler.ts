import type { Telegraf } from 'telegraf';
import type { BotContext } from '../utils/context';
import type { MetricsService } from '../../metrics/metrics.service';
import type { TenantsService } from '../../tenants/tenants.service';
import type { BotLogsService } from '../bot-logs.service';
import type { TenantChatEntity } from '../entities/tenant-chat.entity';
import { buildTenantPickerKeyboard } from '../utils/tenant-picker';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function registerStaff(
  bot: Telegraf<BotContext>,
  deps: { metrics: MetricsService; tenants: TenantsService; logs: BotLogsService },
): void {
  bot.command('staff', async (ctx) => {
    const chatId = ctx.state.chatId;
    const parts = ((ctx.message && 'text' in ctx.message ? ctx.message.text : '') as string).trim().split(/\s+/);
    const arg = parts[1];
    await deps.logs.log({ chatId, tenantId: null, command: '/staff', args: { arg: arg ?? null } });

    if (ctx.state.tenants.length > 1) {
      const options = await Promise.all(
        ctx.state.tenants.map(async (t: TenantChatEntity) => ({
          tenantId: t.tenantId,
          label: (await deps.tenants.findById(t.tenantId))?.salonName ?? t.tenantId,
        })),
      );
      await ctx.reply('Выбери салон:', {
        reply_markup: { inline_keyboard: buildTenantPickerKeyboard(options, `staff:${arg ?? ''}`) },
      });
      return;
    }

    const tenantId = ctx.state.tenants[0].tenantId;
    await runStaff(ctx as unknown as BotContext, deps, tenantId, arg);
  });

  bot.action(/^staff:(\S*):(\S+)$/, async (ctx) => {
    const [, arg, tenantId] = ctx.match;
    await ctx.answerCbQuery();
    await runStaff(ctx as unknown as BotContext, deps, tenantId, arg || undefined);
  });
}

async function runStaff(
  ctx: BotContext,
  deps: { metrics: MetricsService; tenants: TenantsService },
  tenantId: string,
  dateArg?: string,
): Promise<void> {
  const tenant = await deps.tenants.findById(tenantId);
  if (!tenant) { await ctx.reply('Салон не найден.'); return; }

  const todayInTz = nowInTz(tenant.timezone);
  const date = dateArg ?? subtractDays(todayInTz, 1);
  if (!ISO_DATE.test(date)) {
    await ctx.reply('Формат даты: YYYY-MM-DD. Пример: /staff 2026-04-20');
    return;
  }
  const createdDay = tenant.createdAt.toISOString().slice(0, 10);
  if (date > todayInTz || date < createdDay) {
    await ctx.reply(`Нет данных на эту дату. Доступно: ${createdDay} – ${todayInTz}.`);
    return;
  }

  const rows = await deps.metrics.staffDailyBreakdown(tenantId, date, tenant.timezone);
  if (rows.length === 0) {
    await ctx.reply(`Нет визитов за ${formatDate(date)}.`);
    return;
  }

  const lines: string[] = [`👥 Мастера · ${formatDate(date)}`, ''];
  rows.forEach((r, i) => {
    lines.push(`${i + 1}. ${r.name}`);
    lines.push(`   ${fmtMoney(r.revenue)} · ${r.visits} визитов · ср.чек ${fmtMoney(r.avgCheck)}`);
  });
  await ctx.reply(lines.join('\n'));
}

function fmtMoney(n: number): string {
  return `${new Intl.NumberFormat('ru-RU').format(n)} ₸`;
}

function formatDate(ymd: string): string {
  return ymd;
}

function nowInTz(tz: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(new Date());
}

function subtractDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
