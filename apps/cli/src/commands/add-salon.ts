import { Command } from 'commander';
import { bootstrapApp } from '../bootstrap';
import { TenantsService } from '../../../api/src/modules/tenants/tenants.service';

export function addSalonCommand(): Command {
  return new Command('add-salon')
    .description('Create a new tenant')
    .requiredOption('--name <name>', 'Salon display name')
    .requiredOption('--location-id <id>', 'Altegio location ID', (v) => Number(v))
    .requiredOption('--token <token>', 'Altegio partner token')
    .option('--chain-id <id>', 'Altegio chain ID', (v) => Number(v))
    .option('--timezone <tz>', 'IANA timezone', 'Asia/Almaty')
    .option('--telegram-chat-id <id>', 'Telegram chat/user ID', (v) => Number(v))
    .option('--working-hours <n>', 'Working hours/day', (v) => Number(v), 10)
    .action(async (opts) => {
      const app = await bootstrapApp();
      const tenants = app.get(TenantsService);
      const t = await tenants.create({
        salonName: opts.name,
        locationId: opts.locationId,
        chainId: opts.chainId,
        altegioToken: opts.token,
        timezone: opts.timezone,
        telegramChatId: opts.telegramChatId,
        workingHoursPerDay: opts.workingHours,
      });
      console.log(`Created tenant ${t.id} (${t.salonName})`);
      await app.close();
    });
}
