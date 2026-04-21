import { DailyReportData } from '@altegio/shared';

const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

export function renderReport(d: DailyReportData): string {
  const lines: string[] = [];
  lines.push(`☀ Доброе утро! ${d.tenant.salonName} · ${formatDate(d.date)}`);
  lines.push('');

  if (d.yesterday.visitsCompleted === 0 && d.yesterday.visitsCancelled === 0) {
    lines.push('📊 Вчера');
    lines.push('• визитов не было');
  } else {
    lines.push('📊 Вчера');
    lines.push(`• Выручка: ${fmtAmount(d.yesterday.revenue)} ₸${delta(d.yesterday.revenue, d.baseline7d.avgRevenue)}`);
    lines.push(`• Визитов: ${d.yesterday.visitsCompleted} (пришли) / ${d.yesterday.visitsCancelled} (отменили, ${Math.round(d.yesterday.cancelRate * 100)}%)`);
    lines.push(`• Средний чек: ${fmtAmount(d.yesterday.avgCheck)} ₸`);
  }

  if (d.topStaff.length > 0) {
    lines.push('');
    lines.push('🏆 Топ-3 мастера');
    d.topStaff.forEach((s, i) => {
      lines.push(`${i + 1}. ${s.name} — ${fmtAmount(s.revenue)} ₸ (${s.visits} визитов)`);
    });
  }

  const attention = buildAttention(d);
  if (attention.length > 0) {
    lines.push('');
    lines.push('⚠ Требует внимания');
    attention.forEach((b) => lines.push(`• ${b}`));
  }

  lines.push('');
  lines.push('📅 Сегодня');
  lines.push(`• ${d.today.bookedCount} записей, загрузка ${Math.round(d.today.occupancyPct)}%`);
  if (d.today.emptySlots.length > 0) {
    lines.push(`• Пустые слоты: ${d.today.emptySlots.join(', ')}`);
  }

  return lines.join('\n');
}

export function buildAttention(d: DailyReportData): string[] {
  const bullets: string[] = [];

  const baselineRate = d.baseline7d.avgCancelRate || 0;
  if (baselineRate > 0 && d.yesterday.cancelRate > baselineRate * 1.3 && d.yesterday.visitsCancelled > 0) {
    bullets.push(`Рост отмен: ${d.yesterday.visitsCancelled} отмен, потеря ~${fmtAmount(Math.round(d.yesterday.cancellationLoss / 1000))}K ₸`);
  }

  for (const s of d.strugglingStaff.slice(0, 2)) {
    bullets.push(`${s.name} — ${s.consecutiveDaysBelowAvg}-й день подряд ниже среднего`);
  }

  if (d.today.occupancyPct < 40) {
    bullets.push('Низкая загрузка сегодня');
  }

  return bullets.slice(0, 3);
}

function delta(current: number, baseline: number): string {
  if (!baseline) return '';
  const pct = ((current - baseline) / baseline) * 100;
  if (Math.abs(pct) < 3) return '';
  const sign = pct >= 0 ? '+' : '−';
  return ` (${sign}${Math.round(Math.abs(pct))}% к среднему за неделю)`;
}

function fmtAmount(n: number): string {
  return new Intl.NumberFormat('ru-RU').format(Math.round(n));
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}
