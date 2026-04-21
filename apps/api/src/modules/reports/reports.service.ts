import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MetricsService } from '../metrics/metrics.service';
import { renderYesterdayMessage, renderTodayMessage } from './template.renderer';
import { AiInsightService } from './ai-insight.service';
import { TelegramService } from '../telegram/telegram.service';
import { TenantsService } from '../tenants/tenants.service';
import { ReportDeliveryEntity } from './entities/report-delivery.entity';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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

  /**
   * Called by the BullMQ worker / CLI trigger-report when sending live.
   * Sends two Telegram messages (yesterday summary + today forecast) with
   * per-kind idempotency: if a row already exists for a given kind, that kind
   * is skipped. Each kind is attempted independently.
   */
  async generateAndDeliver(tenantId: string, reportDate: string): Promise<void> {
    const yesterdayDateString = this.subtractDays(reportDate, 1);

    const data = await this.metrics.buildDailyReportData(tenantId, reportDate);
    data.yesterday.aiInsight = await this.ai.getInsight(tenantId, data);

    const tenant = await this.tenants.findById(tenantId);
    if (!tenant) throw new Error(`Tenant ${tenantId} not found`);
    if (!tenant.telegramChatId) throw new Error(`Tenant ${tenantId} has no telegram_chat_id`);

    const chatId = Number(tenant.telegramChatId);
    const kinds = ['yesterday', 'today'] as const;
    let yesterdaySent = false;

    for (const kind of kinds) {
      // Idempotency check — already delivered this kind → skip
      const existing = await this.deliveries.findBy({ tenantId, date: yesterdayDateString, messageKind: kind });
      if (existing.length > 0) {
        this.log.log(`Report kind='${kind}' already recorded for ${tenantId} ${yesterdayDateString}, skip`);
        if (kind === 'yesterday') yesterdaySent = false; // was pre-existing, not just sent
        continue;
      }

      // Delay between messages so they appear in order in Telegram
      if (kind === 'today' && yesterdaySent) {
        await sleep(1000);
      }

      const text = kind === 'yesterday'
        ? renderYesterdayMessage(data)
        : renderTodayMessage(data);

      try {
        const { messageId } = await this.telegram.sendReport(chatId, text);
        await this.deliveries.insert({
          tenantId,
          date: yesterdayDateString,
          messageKind: kind,
          messageId: messageId || null,
          sentAt: new Date(),
          status: 'sent',
          error: null,
        });
        this.log.log(`Report kind='${kind}' delivered to ${tenant.salonName} (${yesterdayDateString})`);
        if (kind === 'yesterday') yesterdaySent = true;
      } catch (err: any) {
        await this.deliveries.insert({
          tenantId,
          date: yesterdayDateString,
          messageKind: kind,
          messageId: null,
          sentAt: null,
          status: 'failed',
          error: String(err?.message ?? err).slice(0, 2000),
        });
        throw err;
      }
    }
  }

  /**
   * Called by the CLI for --dry-run. Returns both rendered messages without
   * sending to Telegram or writing to the database. Includes the AI insight.
   */
  async buildMessages(tenantId: string, reportDate: string): Promise<{ yesterday: string; today: string }> {
    const data = await this.metrics.buildDailyReportData(tenantId, reportDate);
    data.yesterday.aiInsight = await this.ai.getInsight(tenantId, data);

    return {
      yesterday: renderYesterdayMessage(data),
      today: renderTodayMessage(data),
    };
  }

  private subtractDays(date: string, n: number): string {
    const d = new Date(date + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  }
}
