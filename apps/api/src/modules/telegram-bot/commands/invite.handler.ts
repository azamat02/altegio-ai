import type { Telegraf } from 'telegraf';
import type { BotContext } from '../utils/context';
import type { InviteCodeService } from '../invite-code.service';
import type { BotLogsService } from '../bot-logs.service';
import type { TenantsService } from '../../tenants/tenants.service';
import type { TenantChatEntity } from '../entities/tenant-chat.entity';
import { buildTenantPickerKeyboard } from '../utils/tenant-picker';

export type InviteDeps = { codes: InviteCodeService; tenants: TenantsService; logs: BotLogsService };

export async function handleInviteCommand(
  ctx: BotContext,
  deps: InviteDeps,
): Promise<void> {
  await deps.logs.log({ chatId: ctx.state.chatId, tenantId: null, command: '/invite' });
  const ownerLinks = ctx.state.tenants.filter((t: TenantChatEntity) => t.role === 'owner');
  if (ownerLinks.length === 1) {
    return handle(ctx, deps, ownerLinks[0].tenantId);
  }
  const options = await Promise.all(ownerLinks.map(async (l: TenantChatEntity) => ({
    tenantId: l.tenantId,
    label: (await deps.tenants.findById(l.tenantId))?.salonName ?? l.tenantId,
  })));
  await ctx.reply('Выбери салон для инвайта:', {
    reply_markup: { inline_keyboard: buildTenantPickerKeyboard(options, 'invite') },
  });
}

export function registerInvite(
  bot: Telegraf<BotContext>,
  deps: InviteDeps,
): void {
  bot.command('invite', async (ctx) => handleInviteCommand(ctx as unknown as BotContext, deps));

  bot.action(/^invite:(\S+)$/, async (ctx) => {
    const [, tenantId] = ctx.match;
    await ctx.answerCbQuery();
    await handle(ctx as unknown as BotContext, deps, tenantId);
  });
}

async function handle(ctx: BotContext, deps: any, tenantId: string) {
  const { code, expiresAt } = await deps.codes.generate(tenantId, ctx.state?.chatId ?? ctx.chat?.id);
  const hours = Math.round((expiresAt.getTime() - Date.now()) / 3600_000);
  await ctx.reply(
    `Код: *${code}*\n\nПерешли второму чату и пусть введут:\n\`/link ${code}\`\n\nИстекает через ~${hours} ч.`,
    { parse_mode: 'Markdown' },
  );
}
