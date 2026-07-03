import { buildMainReplyKeyboard, buildMoreMenu, buildNavFooter, shiftDay } from './keyboards';

describe('buildMainReplyKeyboard', () => {
  // Reply-keyboard web_app buttons are keyboardButtonSimpleWebView: Telegram
  // deliberately passes NO initData to them, so the dashboard key must be a
  // plain text button whose handler answers with an inline web_app button.
  it('is 2×2 with a plain-text dashboard key (no web_app) when tmaUrl set', () => {
    const kb = buildMainReplyKeyboard('https://tma.example');
    expect(kb.keyboard).toEqual([
      [{ text: '📊 Отчёт' }, { text: '👥 Мастера' }],
      [{ text: '📱 Дашборд' }, { text: '⚙️ Ещё' }],
    ]);
    expect(kb.resize_keyboard).toBe(true);
    expect(kb.is_persistent).toBe(true);
  });
  it('omits the dashboard key without tmaUrl', () => {
    const kb = buildMainReplyKeyboard(undefined);
    expect(kb.keyboard[1]).toEqual([{ text: '⚙️ Ещё' }]);
  });
});

describe('buildMoreMenu', () => {
  it('member: status + subscription only', () => {
    const rows = buildMoreMenu(false);
    const datas = rows.flat().map((b) => 'callback_data' in b && b.callback_data);
    expect(datas).toEqual(['more:status', 'more:sub:1', 'more:sub:0']);
  });
  it('owner: adds sync + invite row', () => {
    const datas = buildMoreMenu(true).flat().map((b) => 'callback_data' in b && b.callback_data);
    expect(datas).toEqual(['more:status', 'more:sub:1', 'more:sub:0', 'more:sync', 'more:invite']);
  });
});

describe('shiftDay', () => {
  it('shifts across month boundaries', () => {
    expect(shiftDay('2026-07-01', -1)).toBe('2026-06-30');
    expect(shiftDay('2026-06-30', 1)).toBe('2026-07-01');
  });
});

describe('buildNavFooter', () => {
  const base = { kind: 'report' as const, tenantId: 't1', minDate: '2026-06-01', maxDate: '2026-07-02' };
  it('has dashboard + both arrows mid-range', () => {
    const rows = buildNavFooter({ ...base, date: '2026-07-01', tmaUrl: 'https://tma.example' });
    expect(rows[0]).toEqual([{ text: '📱 Открыть дашборд', web_app: { url: 'https://tma.example' } }]);
    expect(rows[1]).toEqual([
      { text: '◀️ Пред. день', callback_data: 'report:nav:2026-06-30:t1' },
      { text: 'След. день ▶️', callback_data: 'report:nav:2026-07-02:t1' },
    ]);
  });
  it('clamps: no next at maxDate, no prev at minDate, no dashboard without tmaUrl', () => {
    const atMax = buildNavFooter({ ...base, date: '2026-07-02' });
    expect(atMax.flat().map((b) => b.text)).toEqual(['◀️ Пред. день']);
    const atMin = buildNavFooter({ ...base, date: '2026-06-01' });
    expect(atMin.flat().map((b) => b.text)).toEqual(['След. день ▶️']);
  });
  it('uses the staff namespace for kind=staff', () => {
    const rows = buildNavFooter({ ...base, kind: 'staff', date: '2026-07-01' });
    expect(rows.flat()[0]).toMatchObject({ callback_data: 'staff:nav:2026-06-30:t1' });
  });
});
