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

  async getInsight(tenantId: string, data: DailyReportData): Promise<string | null> {
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
        await this.save(tenantId, data, promptHash, text, Date.now() - started, 'validation_failed');
        return null;
      }
      if (hasForbiddenNumbers(text, data)) {
        await this.save(tenantId, data, promptHash, text, Date.now() - started, 'validation_failed');
        return null;
      }
      await this.save(tenantId, data, promptHash, text, Date.now() - started, 'ok');
      return text;
    } catch (err: any) {
      const status: 'timeout' | 'api_error' = err?.message === 'timeout' ? 'timeout' : 'api_error';
      await this.save(tenantId, data, promptHash, null, Date.now() - started, status);
      this.log.warn(`AI insight ${status}: ${err?.message}`);
      return null;
    }
  }

  private async save(
    tenantId: string,
    data: DailyReportData,
    promptHash: string,
    response: string | null,
    ms: number,
    status: 'ok' | 'timeout' | 'validation_failed' | 'api_error',
  ) {
    try {
      await this.logs.save(this.logs.create({
        tenantId, date: data.yesterday.date,
        promptHash, response, ms, status,
      }));
    } catch {
      // logging failures must not break the report
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Prompt builder
// ──────────────────────────────────────────────────────────────────────────────

const SYSTEM_INSTRUCTION = [
  'Ты анализируешь вчерашние цифры салона красоты.',
  'Владелец получит это как одно предложение утром в Telegram.',
  'Только интерпретация переданных цифр, никаких советов и прогнозов, ничего не выдумывай.',
  '1-2 предложения максимум.',
].join(' ');

export function buildPrompt(data: DailyReportData): string {
  const { yesterday: y, today: t } = data;
  const lines: string[] = [];

  lines.push(SYSTEM_INSTRUCTION);
  lines.push('');
  lines.push('ДАННЫЕ:');

  lines.push(`Салон: ${data.salonName} (${data.timezone})`);
  lines.push(`Дата: ${y.date}`);
  lines.push(`Выручка вчера: ${rub(y.revenue)}`);

  if (y.avg7 !== null) lines.push(`Средняя выручка за 7 дней: ${rub(y.avg7)}`);
  if (y.deltaPct !== null) lines.push(`Дельта к 7-дневной средней: ${pct(y.deltaPct)}`);

  lines.push(`Визитов (состоялось): ${y.came}`);
  lines.push(`Визитов (отменено): ${y.cancelled}`);

  if (y.avgCheck !== null) lines.push(`Средний чек: ${rub(y.avgCheck)}`);

  if (y.utilizationPct !== null) lines.push(`Загрузка вчера: ${pct(y.utilizationPct)}`);

  if (y.monthlyGoalPct !== null) {
    lines.push(`Темп выполнения плана: ${pct(y.monthlyGoalPct)} (% от ожидаемого на этот день месяца)`);
    if (y.monthlyGoalMtd !== null) lines.push(`  — накоплено MTD: ${rub(y.monthlyGoalMtd)}`);
    if (y.monthlyGoalExpectedMtd !== null) lines.push(`  — должно быть к этому дню: ${rub(y.monthlyGoalExpectedMtd)}`);
    if (y.monthlyGoalTarget !== null) lines.push(`  — цель месяца: ${rub(y.monthlyGoalTarget)}`);
  }

  if (y.topStaff.length > 0) {
    lines.push('Топ мастера:');
    for (const s of y.topStaff) {
      lines.push(`  ${s.name}: ${rub(s.revenue)}, ${s.visits} визит(а)`);
    }
  }

  lines.push('');
  lines.push(`Сегодня (${t.date}):`);
  lines.push(`  Запись: ${t.scheduled} визитов`);
  if (t.utilizationPct !== null) lines.push(`  Загрузка на сегодня: ${pct(t.utilizationPct)}`);

  if (t.categories.length > 0) {
    lines.push('  Категории (топ):');
    for (const c of t.categories) {
      lines.push(`    ${c.name}: заполнение ${pct(c.fillPct)}, ${c.visits} визит(а)`);
    }
  }

  return lines.join('\n');
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/** Format as currency with thin-space thousands separator + ₸ */
function rub(n: number): string {
  return n.toLocaleString('ru-RU') + '\u202f₸';
}

/** Format as percentage */
function pct(n: number): string {
  return n + '%';
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
  const push = (n: number | null) => { if (n !== null) out.push(Math.round(n)); };

  const y = d.yesterday;
  push(y.revenue); push(y.came); push(y.cancelled); push(y.avgCheck);
  push(y.avg7); push(y.deltaPct); push(y.utilizationPct);
  push(y.monthlyGoalPct); push(y.monthlyGoalTarget); push(y.monthlyGoalMtd);
  y.topStaff.forEach((s) => { push(s.revenue); push(s.visits); });

  const t = d.today;
  push(t.scheduled); push(t.utilizationPct);
  t.categories.forEach((c) => { push(c.fillPct); push(c.visits); });

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
