import { DailyReportData } from '@altegio/shared';

// ── Money formatter ──────────────────────────────────────────────────────────
// Uses Russian thin-space grouping (U+202F narrow no-break space via ru-RU
// locale) and ₸ suffix with a non-breaking space before it.
function fmtMoney(n: number): string {
  const formatted = new Intl.NumberFormat('ru-RU').format(Math.round(n));
  return `${formatted}\u00a0₸`;
}

// ── Pluralisation helper ──────────────────────────────────────────────────────
// Russian rules: 1 → визит, 2-4 → визита, 5+ (and 11-14) → визитов
function pluralVisits(n: number): string {
  const abs = Math.abs(n);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 14) return `${n} визитов`;
  if (mod10 === 1) return `${n} визит`;
  if (mod10 >= 2 && mod10 <= 4) return `${n} визита`;
  return `${n} визитов`;
}

// ── Bookings abbreviation helper ──────────────────────────────────────────────
// Spec §3: categories section uses abbreviated "зап." regardless of N.
function pluralBookings(n: number): string {
  return `${n} зап.`;
}

// ── Date formatter ────────────────────────────────────────────────────────────
// Accepts a YYYY-MM-DD local date string and the tenant timezone.
// Interprets the date as noon local time to avoid DST/boundary flips.
function formatLocalDate(ymd: string, timezone: string): string {
  // e.g. "2026-04-19T12:00:00" interpreted in the given timezone
  const fmt = new Intl.DateTimeFormat('ru-RU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: timezone,
  });
  const localNoon = new Date(`${ymd}T12:00:00`);
  // Format and clean up: Intl produces e.g. "вс, 19 апр." → we want "Вс, 19 апр"
  const raw = fmt.format(localNoon);
  // Capitalise first letter, strip trailing dot from month abbreviation
  return raw.replace(/^(.)/, (c) => c.toUpperCase()).replace(/\.$/, '');
}

// ── Percentage formatter ──────────────────────────────────────────────────────
function fmtPct(n: number): string {
  return `${Math.round(n)}%`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Message 1 — Yesterday
// ─────────────────────────────────────────────────────────────────────────────
export function renderYesterdayMessage(data: DailyReportData): string {
  const { salonName, timezone, yesterday: y } = data;
  const dateStr = formatLocalDate(y.date, timezone);

  const lines: string[] = [];

  // Header block
  lines.push(`☀ Доброе утро! ${salonName}`);
  lines.push(`📊 Вчера · ${dateStr}`);
  lines.push('');

  // Metrics list
  // Revenue line — with optional Δ7d suffix
  const deltaSuffix =
    y.deltaPct !== null
      ? ` (${y.deltaPct >= 0 ? '+' : '−'}${Math.abs(Math.round(y.deltaPct))}% к 7d avg)`
      : '';
  lines.push(`• Выручка:      ${fmtMoney(y.revenue)}${deltaSuffix}`);
  lines.push(`• Визитов:      ${y.came}`);

  // Cancellations — only when cancelled > 0
  if (y.cancelled > 0) {
    const total = y.came + y.cancelled;
    const pct = total > 0 ? Math.round((y.cancelled / total) * 100) : 0;
    lines.push(`• Отменили:     ${y.cancelled} (${pct}%)`);
  }

  // No-show — only when count > 0
  if (y.noShow.count > 0) {
    const lost = y.noShow.lostRevenue > 0 ? ` (${fmtMoney(y.noShow.lostRevenue)} упущено)` : '';
    lines.push(`• Не пришли:    ${y.noShow.count}${lost}`);
  }

  // Average check — only when came > 0 and avgCheck not null
  if (y.came > 0 && y.avgCheck !== null) {
    lines.push(`• Средний чек:  ${fmtMoney(y.avgCheck)}`);
  }

  // Utilisation — skip when null
  if (y.utilizationPct !== null) {
    lines.push(`• Загрузка:     ${fmtPct(y.utilizationPct)}`);
  }

  // Retention — only when there are attended clients
  if (y.retention.newClients + y.retention.returningClients > 0) {
    lines.push(
      `• Клиенты:      ${y.retention.newClients} новых · ${y.retention.returningClients} постоянных (${fmtPct(y.retention.newPct ?? 0)}/${fmtPct(y.retention.returningPct ?? 0)})`,
    );
  }

  // Revenue dynamics — week and/or month vs previous comparable period.
  // Skip lines where prev period had no data (deltaPct === null).
  const dyn = y.dynamics;
  const dynLines: string[] = [];
  const fmtDelta = (n: number): string => ` (${n >= 0 ? '+' : '−'}${Math.abs(n)}%)`;
  if (dyn.week.deltaPct !== null) {
    dynLines.push(`Неделя:   ${fmtMoney(dyn.week.value)} vs ${fmtMoney(dyn.week.prev)}${fmtDelta(dyn.week.deltaPct)}`);
  }
  if (dyn.month.deltaPct !== null) {
    dynLines.push(`Месяц:    ${fmtMoney(dyn.month.value)} vs ${fmtMoney(dyn.month.prev)}${fmtDelta(dyn.month.deltaPct)}`);
  }
  if (dynLines.length > 0) {
    lines.push('');
    lines.push('📈 Динамика выручки');
    lines.push(...dynLines);
  }

  // Monthly goal — verbose block when available
  if (
    y.monthlyGoalPct !== null &&
    y.monthlyGoalMtd !== null &&
    y.monthlyGoalTarget !== null &&
    y.monthlyGoalExpectedMtd !== null
  ) {
    const d = new Date(y.date + 'T00:00:00Z');
    const year = d.getUTCFullYear();
    const monthIx = d.getUTCMonth();
    const day = d.getUTCDate();
    const daysInMonth = new Date(Date.UTC(year, monthIx + 1, 0)).getUTCDate();

    const dailyNorm = y.monthlyGoalTarget / daysInMonth;
    const yesterdayPctOfDaily = dailyNorm > 0
      ? Math.round((y.revenue / dailyNorm) * 100)
      : null;

    const targetM = (y.monthlyGoalTarget / 1_000_000).toFixed(1);
    const dailyM = (dailyNorm / 1_000_000).toFixed(1);
    const expectedM = (y.monthlyGoalExpectedMtd / 1_000_000).toFixed(1);
    const mtdM = (y.monthlyGoalMtd / 1_000_000).toFixed(1);
    const yesterdayM = (y.revenue / 1_000_000).toFixed(1);

    lines.push('');
    lines.push('💰 План месяца');
    lines.push(`Цель:       ${targetM}М\u00a0₸ (${dailyM}М\u00a0₸ в день)`);
    lines.push(`Прошло:     ${day} из ${daysInMonth} дней`);
    lines.push(`Ожидалось:  ${expectedM}М\u00a0₸`);
    lines.push(`Факт:       ${mtdM}М\u00a0₸`);
    lines.push(`Темп:       ${fmtPct(y.monthlyGoalPct)}`);
    if (yesterdayPctOfDaily !== null) {
      lines.push(`Вчера:      ${yesterdayM}М\u00a0₸ из ${dailyM}М нормы (${yesterdayPctOfDaily}%)`);
    }
  }

  // Sources — only when there are attended visits
  if (y.sources.length > 0) {
    lines.push('');
    lines.push('📡 Откуда записи');
    for (const s of y.sources.slice(0, 4)) {
      lines.push(`• ${s.source} — ${pluralBookings(s.visits)} (${fmtPct(s.sharePct)})`);
    }
  }

  // Top staff
  if (y.topStaff.length > 0) {
    lines.push('');
    lines.push('🏆 Топ-3 мастера');
    y.topStaff.forEach((s, i) => {
      lines.push(`${i + 1}. ${s.name} — ${fmtMoney(s.revenue)} (${pluralVisits(s.visits)})`);
    });
  }

  // AI insight
  if (y.aiInsight !== null) {
    lines.push('');
    lines.push('💡 Главный инсайт');
    lines.push(y.aiInsight);
  }

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Message 2 — Today
// ─────────────────────────────────────────────────────────────────────────────
export function renderTodayMessage(data: DailyReportData): string {
  const { timezone, today: t } = data;
  const dateStr = formatLocalDate(t.date, timezone);

  const lines: string[] = [];

  lines.push(`📅 Сегодня · ${dateStr}`);
  lines.push('');

  lines.push(`• Записей:  ${t.scheduled}`);
  if (t.utilizationPct !== null) {
    lines.push(`• Загрузка: ${fmtPct(t.utilizationPct)}`);
  }

  // Category breakdown — only when non-empty
  if (t.categories.length > 0) {
    lines.push('');
    lines.push('📊 Заполненность по категориям');
    for (const cat of t.categories) {
      const label = cat.name.padEnd(12);
      lines.push(`• ${label} ${fmtPct(cat.fillPct)} (${pluralBookings(cat.visits)})`);
    }
  }

  return lines.join('\n');
}
