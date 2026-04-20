import { Command } from 'commander';
import { bootstrapApp } from '../bootstrap';
import { ReportsService } from '../../../api/src/modules/reports/reports.service';

export function triggerReportCommand(): Command {
  return new Command('trigger-report')
    .description('Build and deliver a morning report for a tenant')
    .requiredOption('--tenant <id>', 'Tenant UUID')
    .option('--date <yyyy-mm-dd>', 'Report date (today if omitted)', new Date().toISOString().slice(0, 10))
    .option('--dry-run', 'Print message only, skip Telegram send')
    .action(async (opts) => {
      const app = await bootstrapApp();
      const svc = app.get(ReportsService);
      if (opts.dryRun) {
        const txt = await svc.buildText(opts.tenant, opts.date);
        console.log('---8<---');
        console.log(txt);
        console.log('---8<---');
      } else {
        await svc.generateAndDeliver(opts.tenant, opts.date);
        console.log('Delivered.');
      }
      await app.close();
    });
}
