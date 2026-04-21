import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SyncService } from './sync.service';

export interface SyncJobData {
  tenantId: string;
  days?: number;
}

@Processor('sync', { concurrency: 2 })
export class SyncProcessor extends WorkerHost {
  private readonly log = new Logger(SyncProcessor.name);

  constructor(private readonly sync: SyncService) {
    super();
  }

  async process(job: Job<SyncJobData>): Promise<void> {
    const { tenantId, days } = job.data;
    this.log.log(`Sync start: tenant=${tenantId} days=${days ?? 3}`);
    await this.sync.syncTenant(tenantId, { days });
    this.log.log(`Sync done: tenant=${tenantId}`);
  }
}
