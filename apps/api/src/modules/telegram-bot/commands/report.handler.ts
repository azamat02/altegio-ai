import type { Telegraf } from 'telegraf';
import type { BotContext } from '../utils/context';
import type { ReportsService } from '../../reports/reports.service';
import type { TenantsService } from '../../tenants/tenants.service';
import type { BotLogsService } from '../bot-logs.service';
import type { TenantChatEntity } from '../entities/tenant-chat.entity';
import { buildTenantPickerKeyboard } from '../utils/tenant-picker';
import { buildNavFooter } from '../utils/keyboards';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type Deps = { reports: ReportsService; tenants: TenantsService; logs: BotLogsService; tmaUrl?: string };

export function registerReport(
  bot: Telegraf<BotContext>,
  deps: Deps,
): void {
  bot.command('report', async (ctx) => {
    const parts = ((ctx.message && 'text' in ctx.message ? ctx.message.text : '') as string).trim().split(/\s+/);
    const arg = parts[1];
    await handleReportCommand(ctx as unknown as BotContext, deps, arg);
  });

  bot.hears('📊 Отчёт', async (ctx) => {
    await handleReportCommand(ctx as unknown as BotContext, deps, undefined, { via: 'button' });
  });

  // Nav action MUST be registered BEFORE picker to avoid overlap
  bot.action(/^report:nav:(\d{4}-\d{2}-\d{2}):(\S+)$/, async (ctx) => {
    const [, date, tenantId] = ctx.match;
    await ctx.answerCbQuery();
    const tenant = await deps.tenants.findById(tenantId);
    if (!tenant) return;
    const todayInTz = nowInTz(tenant.timezone);
    const createdDay = tenant.createdAt.toISOString().slice(0, 10);
    if (date > todayInTz || date < createdDay) return;
    const msgs = await deps.reports.buildMessages(tenantId, date);
    const footer = buildNavFooter({ kind: 'report', date, tenantId, minDate: createdDay, maxDate: todayInTz, tmaUrl: deps.tmaUrl });
    await ctx.editMessageText(msgs.yesterday, { parse_mode: 'HTML', reply_markup: { inline_keyboard: footer } })
      .catch(() => undefined);
  });

  // Tightened regex: negative lookahead ensures nav: prefix never matches here
  bot.action(/^report:((?!nav:)\S*):(\S+)$/, async (ctx) => {
    const [, arg, tenantId] = ctx.match;
    await ctx.answerCbQuery();
    await runReport(ctx as unknown as BotContext, deps, tenantId, arg || undefined);
  });
}

async function handleReportCommand(
  ctx: BotContext,
  deps: Deps,
  arg?: string,
  logArgs?: Record<string, unknown>,
): Promise<void> {
  const chatId = ctx.state.chatId;
  await deps.logs.log({ chatId, tenantId: null, command: '/report', args: logArgs ?? { arg: arg ?? null } });

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
  await runReport(ctx, deps, tenantId, arg);
}

async function runReport(
  ctx: BotContext,
  deps: Deps,
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
    const msgs = await deps.reports.buildMessages(tenantId, reportDate);
    const footer = buildNavFooter({
      kind: 'report', date: reportDate, tenantId,
      minDate: createdDay, maxDate: todayInTz, tmaUrl: deps.tmaUrl,
    });
    await ctx.reply(msgs.yesterday, { parse_mode: 'HTML', reply_markup: { inline_keyboard: footer } });
    await ctx.reply(msgs.today, { parse_mode: 'HTML' });
  } catch (err: any) {
    await ctx.reply(`Ошибка: ${String(err?.message ?? err).slice(0, 200)}`);
  }
}

function nowInTz(tz: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(new Date());
}
