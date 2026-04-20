import { Injectable, Logger } from '@nestjs/common';
import { Telegraf } from 'telegraf';
import { loadConfig } from '../../config/app.config';

export interface ITelegramSender {
  sendReport(chatId: number, text: string): Promise<{ messageId: number }>;
}

@Injectable()
export class TelegramService implements ITelegramSender {
  private readonly log = new Logger(TelegramService.name);
  private readonly bot: Telegraf | null;

  constructor() {
    const cfg = loadConfig();
    this.bot = cfg.TELEGRAM_BOT_TOKEN ? new Telegraf(cfg.TELEGRAM_BOT_TOKEN) : null;
  }

  async sendReport(chatId: number, text: string): Promise<{ messageId: number }> {
    if (!this.bot) {
      this.log.warn(`[dry-run] Would send to ${chatId}:\n${text}`);
      return { messageId: 0 };
    }
    let attempts = 0;
    while (attempts < 2) {
      try {
        const msg = await this.bot.telegram.sendMessage(chatId, text, { link_preview_options: { is_disabled: true } });
        return { messageId: msg.message_id };
      } catch (err: any) {
        attempts++;
        if (err?.response?.error_code === 403) throw err;
        if (attempts >= 2) throw err;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    throw new Error('unreachable');
  }
}
