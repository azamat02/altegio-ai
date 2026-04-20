import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ReportsService } from './reports.service';

export interface ReportJobData {
  tenantId: string;
  reportDate: string;
}

@Processor('reports', { concurrency: 4 })
export class ReportsProcessor extends WorkerHost {
  private readonly log = new Logger(ReportsProcessor.name);

  constructor(private readonly reports: ReportsService) {
    super();
  }

  async process(job: Job<ReportJobData>): Promise<void> {
    const { tenantId, reportDate } = job.data;
    this.log.log(`Report job start: tenant=${tenantId} date=${reportDate}`);
    await this.reports.generateAndDeliver(tenantId, reportDate);
    this.log.log(`Report job done: tenant=${tenantId} date=${reportDate}`);
  }
}
