import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryRunner, Repository } from 'typeorm';
import { Telegraf } from 'telegraf';
import { loadConfig } from '../../config/app.config';
import { TenantChatsService } from './tenant-chats.service';
import { InviteCodeService } from './invite-code.service';
import { BotLogsService } from './bot-logs.service';
import { TenantsService } from '../tenants/tenants.service';
import { ReportsService } from '../reports/reports.service';
import { SyncService } from '../sync/sync.service';
import { TelegramService } from '../telegram/telegram.service';
import { ReportDeliveryEntity } from '../reports/entities/report-delivery.entity';
import { resolveChatMiddleware } from './middleware/resolve-chat.middleware';
import { requireLinkedMiddleware } from './middleware/require-linked.middleware';
import { requireOwnerMiddleware } from './middleware/require-owner.middleware';
import { registerStart } from './commands/start.handler';
import { registerHelp } from './commands/help.handler';
import { registerLink } from './commands/link.handler';
import { registerReport } from './commands/report.handler';
import { registerStatus } from './commands/status.handler';
import { registerSubscribe } from './commands/subscribe.handler';
import { registerInvite } from './commands/invite.handler';
import { registerSync } from './commands/sync.handler';
import { registerStaff } from './commands/staff.handler';
import { MetricsService } from '../metrics/metrics.service';
import type { BotContext } from './utils/context';

const LOCK_KEY = 8823911;
const LOCK_RETRY_MS = 30_000;

@Injectable()
export class TelegramBotService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(TelegramBotService.name);
  private bot: Telegraf<BotContext> | null = null;
  private lockRunner: QueryRunner | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(
    private readonly ds: DataSource,
    private readonly tenantChats: TenantChatsService,
    private readonly codes: InviteCodeService,
    private readonly logs: BotLogsService,
    private readonly tenants: TenantsService,
    @Inject(forwardRef(() => ReportsService)) private readonly reports: ReportsService,
    private readonly sync: SyncService,
    private readonly telegram: TelegramService,
    private readonly metrics: MetricsService,
    @InjectRepository(ReportDeliveryEntity) private readonly deliveries: Repository<ReportDeliveryEntity>,
  ) {}

  async onModuleInit(): Promise<void> {
    const cfg = loadConfig();
    if (cfg.BOT_ENABLED !== 'true' || !cfg.TELEGRAM_BOT_TOKEN) {
      this.log.warn('Bot disabled (BOT_ENABLED=false or TELEGRAM_BOT_TOKEN missing)');
      return;
    }
    await this.tryLaunch(cfg.TELEGRAM_BOT_TOKEN);
  }

  private async tryLaunch(token: string): Promise<void> {
    if (this.stopped) return;
    const acquired = await this.acquireLock();
    if (!acquired) {
      this.log.warn(`Advisory lock busy, retrying in ${LOCK_RETRY_MS}ms`);
      this.retryTimer = setTimeout(() => this.tryLaunch(token), LOCK_RETRY_MS);
      return;
    }

    this.bot = new Telegraf<BotContext>(token);
    this.bot.use(resolveChatMiddleware(this.tenantChats));

    registerStart(this.bot, this.logs);
    registerHelp(this.bot, this.logs);

    // Gate linked-only commands: everything except /start, /help, /link requires a link.
    const linkedGuard = requireLinkedMiddleware();
    this.bot.use(async (ctx, next) => {
      const text = ((ctx.message && 'text' in ctx.message ? ctx.message.text : '') as string) || '';
      // Allow deeplink variants like "/start foo" — rely on prefix match.
      if (text.startsWith('/start') || text.startsWith('/help') || text.startsWith('/link')) {
        return next();
      }
      return linkedGuard(ctx as unknown as BotContext, next);
    });

    registerLink(this.bot, { codes: this.codes, chats: this.tenantChats, tenants: this.tenants, logs: this.logs });
    registerReport(this.bot, { reports: this.reports, tenants: this.tenants, logs: this.logs });
    registerStatus(this.bot, { tenants: this.tenants, deliveries: this.deliveries, logs: this.logs });
    registerStaff(this.bot, { metrics: this.metrics, tenants: this.tenants, logs: this.logs });
    registerSubscribe(this.bot, { chats: this.tenantChats, tenants: this.tenants, logs: this.logs });

    // Owner-only guard for /invite and /sync.
    const ownerGuard = requireOwnerMiddleware();
    this.bot.command(['invite', 'sync'], async (ctx, next) => ownerGuard(ctx as unknown as BotContext, next));
    registerInvite(this.bot, { codes: this.codes, tenants: this.tenants, logs: this.logs });
    registerSync(this.bot, { sync: this.sync, telegram: this.telegram, logs: this.logs });

    // Do NOT await bot.launch() — it resolves only when the bot stops.
    this.bot.launch({ dropPendingUpdates: false })
      .catch((err) => this.log.error(`bot.launch failed: ${err?.message}`));
    this.log.log('Telegram bot polling started');
  }

  private async acquireLock(): Promise<boolean> {
    const qr = this.ds.createQueryRunner();
    try {
      await qr.connect();
      const res = await qr.query(`SELECT pg_try_advisory_lock($1) AS got`, [LOCK_KEY]);
      const got = Array.isArray(res) ? res[0]?.got : res?.rows?.[0]?.got;
      if (got === true) {
        this.lockRunner = qr;
        return true;
      }
      await qr.release();
      return false;
    } catch (err: any) {
      this.log.error(`acquireLock failed: ${err?.message}`);
      try { await qr.release(); } catch {}
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    try { this.bot?.stop('SIGTERM'); } catch {}
    try {
      if (this.lockRunner) {
        await this.lockRunner.query(`SELECT pg_advisory_unlock($1)`, [LOCK_KEY]);
        await this.lockRunner.release();
      }
    } catch {}
  }
}
