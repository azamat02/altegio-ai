import { Command } from 'commander';
import { bootstrapApp } from '../bootstrap';
import { TenantsService } from '../../../api/src/modules/tenants/tenants.service';

export function linkTelegramCommand(): Command {
  return new Command('link-telegram')
    .description('Attach a Telegram chat to a tenant and enable reports')
    .requiredOption('--tenant <id>', 'Tenant UUID')
    .requiredOption('--chat <id>', 'Telegram chat/user ID', (v) => Number(v))
    .option('--enable', 'Enable report_enabled', false)
    .action(async (opts) => {
      const app = await bootstrapApp();
      const tenants = app.get(TenantsService);
      await tenants.setTelegramChat(opts.tenant, opts.chat);
      if (opts.enable) await tenants.setReportEnabled(opts.tenant, true);
      console.log(`Linked chat ${opts.chat} to tenant ${opts.tenant}, enabled=${Boolean(opts.enable)}`);
      await app.close();
    });
}
