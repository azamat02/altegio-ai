import { Command } from 'commander';
import { bootstrapApp } from '../bootstrap';
import { TenantsService } from '../../../api/src/modules/tenants/tenants.service';

export function setMonthlyGoalCommand(): Command {
  return new Command('set-monthly-goal')
    .description('Set manual monthly revenue target for a tenant (clears with --unset)')
    .requiredOption('--tenant <id>', 'Tenant UUID')
    .option('--amount <n>', 'Monthly goal in ₸ (integer)', (v) => Number(v))
    .option('--unset', 'Clear the manual goal (fall back to auto avg×1.1)', false)
    .action(async (opts) => {
      if (!opts.unset && (opts.amount === undefined || !Number.isFinite(opts.amount) || opts.amount <= 0)) {
        console.error('Provide --amount <positive integer> or --unset');
        process.exit(1);
      }
      const app = await bootstrapApp();
      const tenants = app.get(TenantsService);
      const value = opts.unset ? null : Number(opts.amount);
      await tenants.setMonthlyGoal(opts.tenant, value);
      console.log(
        value === null
          ? `Cleared monthly_goal for tenant ${opts.tenant} (will fall back to auto)`
          : `Set monthly_goal=${value.toLocaleString('ru-RU')} ₸ for tenant ${opts.tenant}`,
      );
      await app.close();
    });
}
