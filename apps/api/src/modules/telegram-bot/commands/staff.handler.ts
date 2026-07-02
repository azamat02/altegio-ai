import type { Telegraf } from 'telegraf';
import type { BotContext } from '../utils/context';
import type { MetricsService } from '../../metrics/metrics.service';
import type { TenantsService } from '../../tenants/tenants.service';
import type { BotLogsService } from '../bot-logs.service';
import type { TenantChatEntity } from '../entities/tenant-chat.entity';
import { buildTenantPickerKeyboard } from '../utils/tenant-picker';
import { buildNavFooter } from '../utils/keyboards';
import { escapeHtml } from '../../../common/html';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type Deps = { metrics: MetricsService; tenants: TenantsService; logs: BotLogsService; tmaUrl?: string };

export function registerStaff(
  bot: Telegraf<BotContext>,
  deps: Deps,
): void {
  bot.command('staff', async (ctx) => {
    const parts = ((ctx.message && 'text' in ctx.message ? ctx.message.text : '') as string).trim().split(/\s+/);
    const arg = parts[1];
    await handleStaffCommand(ctx as unknown as BotContext, deps, arg);
  });

  bot.hears('👥 Мастера', async (ctx) => {
    await handleStaffCommand(ctx as unknown as BotContext, deps, undefined, { via: 'button' });
  });

  // Nav action MUST be registered BEFORE picker to avoid overlap
  bot.action(/^staff:nav:(\d{4}-\d{2}-\d{2}):(\S+)$/, async (ctx) => {
    const [, date, tenantId] = ctx.match;
    await ctx.answerCbQuery();
    const tenant = await deps.tenants.findById(tenantId);
    if (!tenant) return;
    const todayInTz = nowInTz(tenant.timezone);
    const maxDate = subtractDays(todayInTz, 1);
    const createdDay = tenant.createdAt.toISOString().slice(0, 10);
    if (date > maxDate || date < createdDay) return;
    const rows = await deps.metrics.staffDailyBreakdown(tenantId, date, tenant.timezone);
    const text = rows.length ? buildStaffMessage(rows, date) : `Нет визитов за ${date}.`;
    const footer = buildNavFooter({ kind: 'staff', date, tenantId, minDate: createdDay, maxDate, tmaUrl: deps.tmaUrl });
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: { inline_keyboard: footer } })
      .catch(() => undefined);
  });

  // Tightened regex: negative lookahead ensures nav: prefix never matches here
  bot.action(/^staff:((?!nav:)\S*):(\S+)$/, async (ctx) => {
    const [, arg, tenantId] = ctx.match;
    await ctx.answerCbQuery();
    await runStaff(ctx as unknown as BotContext, deps, tenantId, arg || undefined);
  });
}

async function handleStaffCommand(
  ctx: BotContext,
  deps: Deps,
  arg?: string,
  logArgs?: Record<string, unknown>,
): Promise<void> {
  const chatId = ctx.state.chatId;
  await deps.logs.log({ chatId, tenantId: null, command: '/staff', args: logArgs ?? { arg: arg ?? null } });

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
  await runStaff(ctx, deps, tenantId, arg);
}

function buildStaffMessage(
  rows: Array<{ name: string; revenue: number; visits: number; avgCheck: number }>,
  date: string,
): string {
  const lines: string[] = [`<b>👥 Мастера · ${date}</b>`, ''];
  rows.forEach((r, i) => {
    lines.push(`${i + 1}. ${escapeHtml(r.name)}`);
    lines.push(`   <b>${fmtMoney(r.revenue)}</b> · ${r.visits} визитов · ср.чек ${fmtMoney(r.avgCheck)}`);
  });
  return lines.join('\n');
}

async function runStaff(
  ctx: BotContext,
  deps: Deps,
  tenantId: string,
  dateArg?: string,
): Promise<void> {
  const tenant = await deps.tenants.findById(tenantId);
  if (!tenant) { await ctx.reply('Салон не найден.'); return; }

  const todayInTz = nowInTz(tenant.timezone);
  const maxDate = subtractDays(todayInTz, 1);
  const date = dateArg ?? maxDate;
  if (!ISO_DATE.test(date)) {
    await ctx.reply('Формат даты: YYYY-MM-DD. Пример: /staff 2026-04-20');
    return;
  }
  const createdDay = tenant.createdAt.toISOString().slice(0, 10);
  if (date > maxDate || date < createdDay) {
    await ctx.reply(`Нет данных на эту дату. Доступно: ${createdDay} – ${maxDate}.`);
    return;
  }

  const rows = await deps.metrics.staffDailyBreakdown(tenantId, date, tenant.timezone);
  const text = rows.length ? buildStaffMessage(rows, date) : `Нет визитов за ${date}.`;
  const footer = buildNavFooter({ kind: 'staff', date, tenantId, minDate: createdDay, maxDate, tmaUrl: deps.tmaUrl });
  await ctx.reply(text, { parse_mode: 'HTML', reply_markup: { inline_keyboard: footer } });
}

function fmtMoney(n: number): string {
  return `${new Intl.NumberFormat('ru-RU').format(n)} ₸`;
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
