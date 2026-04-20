import { Command } from 'commander';
import { bootstrapApp } from '../bootstrap';
import { SyncService } from '../../../api/src/modules/sync/sync.service';

export function triggerSyncCommand(): Command {
  return new Command('trigger-sync')
    .description('Run a sync for a tenant (bypasses queue)')
    .requiredOption('--tenant <id>', 'Tenant UUID')
    .option('--days <n>', 'Backfill window', (v) => Number(v), 3)
    .action(async (opts) => {
      const app = await bootstrapApp();
      const sync = app.get(SyncService);
      console.log(`Syncing tenant ${opts.tenant} (${opts.days} days)...`);
      await sync.syncTenant(opts.tenant, { days: opts.days });
      console.log('Done.');
      await app.close();
    });
}
