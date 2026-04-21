import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import Bottleneck from 'bottleneck';
import { AiInsightLogEntity } from './entities/ai-insight-log.entity';
import { DailyReportData } from '@altegio/shared';

export interface IAnthropicAdapter {
  generate(prompt: string, model: string): Promise<string>;
}

export interface AiInsightOptions {
  enabled: boolean;
  timeoutMs?: number;
  model?: string;
}

@Injectable()
export class AiInsightService {
  private readonly log = new Logger(AiInsightService.name);
  private readonly limiter = new Bottleneck({ minTime: 200 });

  constructor(
    private readonly anthropic: IAnthropicAdapter,
    @InjectRepository(AiInsightLogEntity) private readonly logs: Repository<AiInsightLogEntity>,
    private readonly opts: AiInsightOptions,
  ) {}

  async getInsight(data: DailyReportData): Promise<string | null> {
    if (!this.opts.enabled) return null;

    const prompt = buildPrompt(data);
    const promptHash = createHash('sha256').update(prompt).digest('hex').slice(0, 16);
    const model = this.opts.model ?? 'claude-haiku-4-5-20251001';
    const started = Date.now();

    try {
      const raw = await this.limiter.schedule(() =>
        withTimeout(this.anthropic.generate(prompt, model), this.opts.timeoutMs ?? 3000),
      );
      const text = sanitize(raw);

      if (text.length > 280) {
        await this.save(data, promptHash, text, Date.now() - started, 'validation_failed');
        return null;
      }
      if (hasForbiddenNumbers(text, data)) {
        await this.save(data, promptHash, text, Date.now() - started, 'validation_failed');
        return null;
      }
      await this.save(data, promptHash, text, Date.now() - started, 'ok');
      return text;
    } catch (err: any) {
      const status: 'timeout' | 'api_error' = err?.message === 'timeout' ? 'timeout' : 'api_error';
      await this.save(data, promptHash, null, Date.now() - started, status);
      this.log.warn(`AI insight ${status}: ${err?.message}`);
      return null;
    }
  }

  private async save(
    data: DailyReportData,
    promptHash: string,
    response: string | null,
    ms: number,
    status: 'ok' | 'timeout' | 'validation_failed' | 'api_error',
  ) {
    try {
      await this.logs.save(this.logs.create({
        tenantId: data.tenant.id, date: data.date,
        promptHash, response, ms, status,
      }));
    } catch {
      // logging failures must not break the report
    }
  }
}

export function buildPrompt(data: DailyReportData): string {
  return [
    'Ты — аналитик салона красоты. Тебе дают факты за вчера.',
    'Твоя задача — найти ОДИН самый важный инсайт в 1-2 предложениях на русском.',
    'Правила:',
    '- Говори только о переданных фактах. НЕ ПРИДУМЫВАЙ ЦИФРЫ.',
    '- Не повторяй цифры, которые уже есть в отчёте (они будут в шаблоне).',
    '- Если есть аномалия — называй её и возможную причину.',
    '- Если всё нормально — коротко подтверди тренд.',
    '- Максимум 280 символов. Без эмодзи.',
    '',
    'ФАКТЫ:',
    JSON.stringify(data, null, 2),
  ].join('\n');
}

function sanitize(text: string): string {
  return text
    .replace(/[^\S\r\n]+$/gm, '')
    .replace(/[*_`]+/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .trim();
}

function hasForbiddenNumbers(text: string, data: DailyReportData): boolean {
  const allowed = new Set(collectAllowedNumbers(data));
  const found = Array.from(text.matchAll(/\d+/g)).map((m) => Number(m[0]));
  for (const n of found) {
    if (n >= 0 && n <= 3) continue;
    if (!allowed.has(n)) {
      return true;
    }
  }
  return false;
}

function collectAllowedNumbers(d: DailyReportData): number[] {
  const out: number[] = [];
  const push = (n: number) => out.push(Math.round(n));
  push(d.yesterday.revenue); push(d.yesterday.visitsCompleted); push(d.yesterday.visitsCancelled);
  push(d.yesterday.avgCheck); push(d.yesterday.cancellationLoss);
  push(Math.round(d.yesterday.cancelRate * 100));
  push(Math.round(d.baseline7d.avgRevenue)); push(Math.round(d.baseline7d.avgVisits));
  push(d.today.bookedCount); push(Math.round(d.today.occupancyPct));
  d.topStaff.forEach((s) => { push(s.revenue); push(s.visits); });
  d.cancelClusters.forEach((c) => { push(c.hour); push(c.count); });
  return out;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/** Production adapter using the real Anthropic SDK. */
export class AnthropicAdapter implements IAnthropicAdapter {
  private readonly client: Anthropic;
  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }
  async generate(prompt: string, model: string): Promise<string> {
    const res = await this.client.messages.create({
      model,
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    });
    const block = res.content[0];
    if (block.type !== 'text') throw new Error('non-text response');
    return block.text;
  }
}
