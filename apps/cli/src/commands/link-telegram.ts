import { Command } from 'commander';
import { bootstrapApp } from '../bootstrap';
import { TenantsService } from '../../../api/src/modules/tenants/tenants.service';
import { TenantChatsService } from '../../../api/src/modules/telegram-bot/tenant-chats.service';

export function linkTelegramCommand(): Command {
  return new Command('link-telegram')
    .description('Attach a Telegram chat to a tenant as owner')
    .requiredOption('--tenant <id>', 'Tenant UUID')
    .requiredOption('--chat <id>', 'Telegram chat/user ID', (v) => Number(v))
    .option('--enable', 'Enable report_enabled', false)
    .action(async (opts) => {
      const app = await bootstrapApp();
      const tenants = app.get(TenantsService);
      const chats = app.get(TenantChatsService);
      await tenants.setTelegramChat(opts.tenant, opts.chat);
      await chats.linkOwner(opts.tenant, opts.chat);
      if (opts.enable) await tenants.setReportEnabled(opts.tenant, true);
      console.log(`Linked chat ${opts.chat} to tenant ${opts.tenant} as owner, enabled=${Boolean(opts.enable)}`);
      await app.close();
    });
}
