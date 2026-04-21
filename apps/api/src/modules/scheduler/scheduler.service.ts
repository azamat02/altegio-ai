import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TenantsService } from '../tenants/tenants.service';

@Injectable()
export class SchedulerService {
  private readonly log = new Logger(SchedulerService.name);

  constructor(
    private readonly tenants: TenantsService,
    @InjectQueue('reports') private readonly reportsQueue: Queue,
    @InjectQueue('sync') private readonly syncQueue: Queue,
  ) {}

  /** Every minute — check which tenants should have their morning report kicked off now. */
  @Cron('0 * * * * *')
  async tickReports(): Promise<void> {
    const tenants = await this.tenants.findEnabled();
    const now = new Date();
    for (const t of tenants) {
      if (!t.telegramChatId) continue;
      const local = this.localTimeHHMM(now, t.timezone);
      if (local !== t.reportTime.slice(0, 5)) continue;
      const reportDate = this.localDate(now, t.timezone);
      await this.reportsQueue.add(
        'generate-report',
        { tenantId: t.id, reportDate },
        { jobId: `${t.id}:${reportDate}`, removeOnComplete: true, removeOnFail: false },
      );
      this.log.log(`Enqueued report for ${t.salonName} (${reportDate})`);
    }
  }

  /** Every 6 hours on the hour — sync all enabled tenants. */
  @Cron('0 0 */6 * * *')
  async tickSync(): Promise<void> {
    const tenants = await this.tenants.findEnabled();
    for (const t of tenants) {
      await this.syncQueue.add(
        'sync',
        { tenantId: t.id, days: 3 },
        { jobId: `sync:${t.id}:${Date.now()}`, removeOnComplete: true, removeOnFail: 10 },
      );
    }
    this.log.log(`Enqueued sync for ${tenants.length} tenants`);
  }

  private localTimeHHMM(d: Date, tz: string): string {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(d);
  }

  private localDate(d: Date, tz: string): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(d);
  }
}
