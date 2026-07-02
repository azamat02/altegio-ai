import type { InlineKeyboardButton, KeyboardButton, ReplyKeyboardMarkup } from 'telegraf/typings/core/types/typegram';

export function buildMainReplyKeyboard(tmaUrl?: string): ReplyKeyboardMarkup {
  const row2: KeyboardButton[] = tmaUrl
    ? [{ text: '📱 Дашборд', web_app: { url: tmaUrl } }, { text: '⚙️ Ещё' }]
    : [{ text: '⚙️ Ещё' }];
  return {
    keyboard: [[{ text: '📊 Отчёт' }, { text: '👥 Мастера' }], row2],
    resize_keyboard: true,
    is_persistent: true,
  };
}

export function buildMoreMenu(isOwner: boolean): InlineKeyboardButton[][] {
  const rows: InlineKeyboardButton[][] = [
    [{ text: '📈 Статус доставки', callback_data: 'more:status' }],
    [
      { text: '🔔 Подписка вкл', callback_data: 'more:sub:1' },
      { text: '🔕 Подписка выкл', callback_data: 'more:sub:0' },
    ],
  ];
  if (isOwner) {
    rows.push([
      { text: '🔄 Синк', callback_data: 'more:sync' },
      { text: '🎟 Инвайт', callback_data: 'more:invite' },
    ]);
  }
  return rows;
}

export function shiftDay(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export interface NavFooterParams {
  kind: 'report' | 'staff';
  date: string;
  tenantId: string;
  minDate: string;
  maxDate: string;
  tmaUrl?: string;
}

export function buildNavFooter(p: NavFooterParams): InlineKeyboardButton[][] {
  const rows: InlineKeyboardButton[][] = [];
  if (p.tmaUrl) rows.push([{ text: '📱 Открыть дашборд', web_app: { url: p.tmaUrl } }]);
  const nav: InlineKeyboardButton[] = [];
  const prev = shiftDay(p.date, -1);
  const next = shiftDay(p.date, 1);
  if (prev >= p.minDate) nav.push({ text: '◀️ Пред. день', callback_data: `${p.kind}:nav:${prev}:${p.tenantId}` });
  if (next <= p.maxDate) nav.push({ text: 'След. день ▶️', callback_data: `${p.kind}:nav:${next}:${p.tenantId}` });
  if (nav.length) rows.push(nav);
  return rows;
}
