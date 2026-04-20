import { Injectable, Logger } from '@nestjs/common';
import { MetricsService } from '../metrics/metrics.service';
import { renderReport } from './template.renderer';

@Injectable()
export class ReportsService {
  private readonly log = new Logger(ReportsService.name);

  constructor(private readonly metrics: MetricsService) {}

  async buildText(tenantId: string, reportDate: string): Promise<string> {
    const data = await this.metrics.getDailyReportData(tenantId, reportDate);
    const text = renderReport(data);
    this.log.debug(`Report built for ${tenantId} ${reportDate}: ${text.length} chars`);
    return text;
  }
}
