import { Injectable, Logger } from '@nestjs/common';
import { MetricsService } from '../metrics/metrics.service';
import { renderReport } from './template.renderer';
import { AiInsightService } from './ai-insight.service';

@Injectable()
export class ReportsService {
  private readonly log = new Logger(ReportsService.name);

  constructor(
    private readonly metrics: MetricsService,
    private readonly ai: AiInsightService,
  ) {}

  async buildText(tenantId: string, reportDate: string): Promise<string> {
    const data = await this.metrics.getDailyReportData(tenantId, reportDate);
    const base = renderReport(data);
    const insight = await this.ai.getInsight(data);
    if (insight) {
      return `${base}\n\n💡 Главный инсайт\n${insight}`;
    }
    return base;
  }
}
