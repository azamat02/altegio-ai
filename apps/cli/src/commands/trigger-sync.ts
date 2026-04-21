import { Command } from 'commander';
import { bootstrapApp } from '../bootstrap';
import { SyncService } from '../../../api/src/modules/sync/sync.service';

export function triggerSyncCommand(): Command {
  return new Command('trigger-sync')
    .description('Run a sync for a tenant (bypasses queue)')
    .requiredOption('--tenant <id>', 'Tenant UUID')
    .option('--days <n>', 'Backfill window', (v) => Number(v), 3)
    .option('--onboard', 'Use 120-day backfill window (first sync of a new tenant)')
    .action(async (opts) => {
      const days = opts.onboard ? 120 : Number(opts.days);
      const app = await bootstrapApp();
      const sync = app.get(SyncService);
      console.log(`Syncing tenant ${opts.tenant} (${days} days)...`);
      await sync.syncTenant(opts.tenant, { days });
      console.log('Done.');
      await app.close();
    });
}
