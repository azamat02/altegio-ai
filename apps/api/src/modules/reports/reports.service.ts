import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MetricsService } from '../metrics/metrics.service';
import { renderReport } from './template.renderer';
import { AiInsightService } from './ai-insight.service';
import { TelegramService } from '../telegram/telegram.service';
import { TenantsService } from '../tenants/tenants.service';
import { ReportDeliveryEntity } from './entities/report-delivery.entity';

@Injectable()
export class ReportsService {
  private readonly log = new Logger(ReportsService.name);

  constructor(
    private readonly metrics: MetricsService,
    private readonly ai: AiInsightService,
    private readonly telegram: TelegramService,
    private readonly tenants: TenantsService,
    @InjectRepository(ReportDeliveryEntity) private readonly deliveries: Repository<ReportDeliveryEntity>,
  ) {}

  async buildText(tenantId: string, reportDate: string): Promise<string> {
    const data = await this.metrics.getDailyReportData(tenantId, reportDate);
    const base = renderReport(data);
    const insight = await this.ai.getInsight(data);
    return insight ? `${base}\n\n💡 Главный инсайт\n${insight}` : base;
  }

  /**
   * Idempotent delivery. If (tenant, deliveryDate) already has a 'sent' row, skip.
   */
  async generateAndDeliver(tenantId: string, reportDate: string): Promise<void> {
    const deliveryDate = this.subtractDays(reportDate, 1);

    const existing = await this.deliveries.findOne({ where: { tenantId, date: deliveryDate } });
    if (existing?.status === 'sent') {
      this.log.log(`Report already sent for ${tenantId} ${deliveryDate}, skip`);
      return;
    }

    const tenant = await this.tenants.findById(tenantId);
    if (!tenant) throw new Error(`Tenant ${tenantId} not found`);
    if (!tenant.telegramChatId) throw new Error(`Tenant ${tenantId} has no telegram_chat_id`);

    const text = await this.buildText(tenantId, reportDate);

    try {
      const { messageId } = await this.telegram.sendReport(Number(tenant.telegramChatId), text);
      await this.deliveries.upsert(
        { tenantId, date: deliveryDate, messageId: messageId || null, sentAt: new Date(), status: 'sent', error: null },
        ['tenantId', 'date'],
      );
      this.log.log(`Report delivered to ${tenant.salonName} (${deliveryDate})`);
    } catch (err: any) {
      await this.deliveries.upsert(
        { tenantId, date: deliveryDate, status: 'failed', error: String(err?.message ?? err).slice(0, 2000) },
        ['tenantId', 'date'],
      );
      throw err;
    }
  }

  private subtractDays(date: string, n: number): string {
    const d = new Date(date + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  }
}
