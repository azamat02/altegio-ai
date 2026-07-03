import { Command } from 'commander';
import { bootstrapApp } from '../bootstrap';
import { TenantsService } from '../../../api/src/modules/tenants/tenants.service';

export function setTargetUtilizationCommand(): Command {
  return new Command('set-target-utilization')
    .description('Set the target utilization %% used by the idle-loss estimate (default 80)')
    .requiredOption('--tenant <id>', 'Tenant UUID')
    .requiredOption('--pct <n>', 'Target utilization percent (integer 1..100)', (v) => Number(v))
    .action(async (opts) => {
      if (!Number.isInteger(opts.pct) || opts.pct < 1 || opts.pct > 100) {
        console.error('Provide --pct as an integer between 1 and 100');
        process.exit(1);
      }
      const app = await bootstrapApp();
      const tenants = app.get(TenantsService);
      await tenants.setTargetUtilization(opts.tenant, opts.pct);
      console.log(`Set target_utilization_pct=${opts.pct}% for tenant ${opts.tenant}`);
      await app.close();
    });
}
