import type { Telegraf } from 'telegraf';
import type { BotContext } from '../utils/context';
import type { SyncService } from '../../sync/sync.service';
import type { TelegramService } from '../../telegram/telegram.service';
import type { BotLogsService } from '../bot-logs.service';
import { Logger } from '@nestjs/common';

const log = new Logger('SyncHandler');
const inFlight = new Map<string, Promise<any>>(); // per tenantId

export type SyncDeps = { sync: SyncService; telegram: TelegramService; logs: BotLogsService };

export async function handleSyncCommand(
  ctx: BotContext,
  deps: SyncDeps,
): Promise<void> {
  await deps.logs.log({ chatId: ctx.state.chatId, tenantId: null, command: '/sync' });
  const ownerLinks = ctx.state.tenants.filter((t: import('../entities/tenant-chat.entity').TenantChatEntity) => t.role === 'owner');
  if (ownerLinks.length === 0) return; // middleware должен был отрезать; defensive
  // Multi-tenant owner — в MVP берём первый; при нескольких — TODO отдельный picker.
  const tenantId = ownerLinks[0].tenantId;
  const chatId = ctx.state.chatId;

  if (inFlight.has(tenantId)) {
    await ctx.reply('⏳ Синк уже идёт для этого салона. Дождись завершения.');
    return;
  }

  await ctx.reply('⏳ Синхронизация запущена. Пришлю сообщение когда закончится.');

  const task = (async () => {
    try {
      const { recordsFetched } = await deps.sync.syncTenant(tenantId);
      await deps.telegram.sendReport(chatId, `✅ Синк готов. Записей получено: ${recordsFetched ?? 0}.`);
    } catch (err: any) {
      log.error(`Sync failed for ${tenantId}: ${err?.message}`);
      await deps.telegram.sendReport(chatId, `❌ Синк упал: ${String(err?.message ?? err).slice(0, 200)}`);
    } finally {
      inFlight.delete(tenantId);
    }
  })();
  inFlight.set(tenantId, task);
}

export function registerSync(
  bot: Telegraf<BotContext>,
  deps: SyncDeps,
): void {
  bot.command('sync', async (ctx) => handleSyncCommand(ctx as unknown as BotContext, deps));
}
