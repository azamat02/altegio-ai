import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ReportsService } from '../src/modules/reports/reports.service';

async function main() {
  const tenantId = process.argv[2];
  const date = process.argv[3] ?? new Date().toISOString().slice(0, 10);
  if (!tenantId) {
    console.error('Usage: pnpm dry-run <tenant-uuid> [date]');
    process.exit(1);
  }
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const svc = app.get(ReportsService);
  const text = await svc.buildText(tenantId, date);
  console.log('---8<---');
  console.log(text);
  console.log('---8<---');
  await app.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
