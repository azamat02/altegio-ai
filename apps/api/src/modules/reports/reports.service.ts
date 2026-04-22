import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MetricsService } from '../metrics/metrics.service';
import { renderYesterdayMessage, renderTodayMessage } from './template.renderer';
import { AiInsightService } from './ai-insight.service';
import { TelegramService } from '../telegram/telegram.service';
import { TenantsService } from '../tenants/tenants.service';
import { ReportDeliveryEntity } from './entities/report-delivery.entity';
import { TenantChatsService } from '../telegram-bot/tenant-chats.service';

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
    private readonly tenantChats: TenantChatsService,
  ) {}

  async generateAndDeliver(tenantId: string, reportDate: string): Promise<void> {
    const yesterdayDateString = this.subtractDays(reportDate, 1);
    const data = await this.metrics.buildDailyReportData(tenantId, reportDate);
    data.yesterday.aiInsight = await this.ai.getInsight(tenantId, data);

    const tenant = await this.tenants.findById(tenantId);
    if (!tenant) throw new Error(`Tenant ${tenantId} not found`);

    const chats = await this.tenantChats.listSubscribedChats(tenantId);
    if (chats.length === 0) {
      this.log.warn(`Tenant ${tenantId} has no subscribed chats, skip delivery`);
      return;
    }

    const kinds = ['yesterday', 'today'] as const;
    const renderers = {
      yesterday: () => renderYesterdayMessage(data),
      today: () => renderTodayMessage(data),
    };

    for (const kind of kinds) {
      const text = renderers[kind]();
      for (const chat of chats) {
        const chatId = Number(chat.chatId);
        const already = await this.deliveries.findOne({
          where: { tenantId, date: yesterdayDateString, messageKind: kind, chatId, status: 'sent' },
        });
        if (already) continue;

        try {
          const { messageId } = await this.telegram.sendReport(chatId, text);
          await this.deliveries.save({
            tenantId, date: yesterdayDateString, messageKind: kind, chatId,
            messageId: messageId || null, sentAt: new Date(), status: 'sent', error: null,
          });
        } catch (err: any) {
          const code = err?.response?.error_code;
          await this.deliveries.save({
            tenantId, date: yesterdayDateString, messageKind: kind, chatId,
            messageId: null, sentAt: null, status: 'failed',
            error: String(err?.message ?? err).slice(0, 2000),
          });
          if ((code === 403 || code === 400) && chat.role === 'member') {
            await this.tenantChats.setSubscribed(tenantId, chatId, false);
            this.log.warn(`Auto-unsubscribed member chat=${chatId} tenant=${tenantId} (code=${code})`);
          }
        }
        await sleep(250);
      }
      if (kind === 'yesterday') await sleep(1000);
    }
  }

  /**
   * Called by the CLI for --dry-run. Returns both rendered messages without
   * sending to Telegram or writing to the database. Includes the AI insight.
   */
  async buildMessages(tenantId: string, reportDate: string): Promise<{ yesterday: string; today: string }> {
    const data = await this.metrics.buildDailyReportData(tenantId, reportDate);
    data.yesterday.aiInsight = await this.ai.getInsight(tenantId, data);
    return { yesterday: renderYesterdayMessage(data), today: renderTodayMessage(data) };
  }

  private subtractDays(date: string, n: number): string {
    const d = new Date(date + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  }
}
