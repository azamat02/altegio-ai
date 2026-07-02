# Telegram Bot UX Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Button-driven bot UX: registered command menu, TMA menu button, HTML morning report with a dashboard button and day navigation, persistent 2×2 reply keyboard, and an inline «Ещё» menu — presentation layer only.

**Architecture:** All changes live in the presentation layer: `apps/api/src/modules/telegram-bot` (handlers, new keyboard/HTML utils, startup registration), `apps/api/src/modules/reports/template.renderer.ts` (HTML output), and `apps/api/src/modules/telegram/telegram.service.ts` (parse_mode + reply_markup passthrough). Metrics, sync, scheduler, and delivery-retry logic are untouched.

**Tech Stack:** TypeScript, NestJS 10, telegraf 4, jest (unit specs colocated as `*.spec.ts`, run via `pnpm --filter @altegio/api exec jest <path>`).

## Global Constraints

- Branch: `feature/bot-ux` cut from `main`.
- All user-facing copy in Russian.
- Every interpolated user string (salon names, staff names, source/category names, AI insight) MUST pass through `escapeHtml` before entering an HTML message. This is a hard requirement.
- Reply keyboard layout (locked): row1 `[📊 Отчёт] [👥 Мастера]`, row2 `[📱 Дашборд (web_app)] [⚙️ Ещё]`; when `TMA_URL` is unset row2 = `[⚙️ Ещё]` and ALL web_app buttons are omitted (graceful degradation).
- Nav callback data: `report:nav:<YYYY-MM-DD>:<tenantId>` and `staff:nav:<YYYY-MM-DD>:<tenantId>`. Existing tenant-picker regexes must be tightened with a negative lookahead (`(?!nav:)`) so they never swallow nav callbacks.
- Navigation edits messages in place (`editMessageText`, `parse_mode: 'HTML'`); “next day” must never navigate past today in the tenant TZ; “prev day” never before the tenant's `createdAt` day.
- No changes to `MetricsService`, `ReportsService` data logic, scheduler behavior, or delivery retry logic in `telegram.service.ts` (only message options extended).
- Existing multi-salon tenant-picker flows keep working.
- Commit after every task with the message given in the task.

---

### Task 1: `TMA_URL` config + `escapeHtml` + keyboard builders

**Files:**
- Modify: `apps/api/src/config/app.config.ts` (add `TMA_URL` to the zod schema)
- Create: `apps/api/src/common/html.ts`
- Create: `apps/api/src/common/html.spec.ts`
- Create: `apps/api/src/modules/telegram-bot/utils/keyboards.ts`
- Create: `apps/api/src/modules/telegram-bot/utils/keyboards.spec.ts`
- Modify: `.env.example` (add `TMA_URL=`)

**Interfaces:**
- Consumes: nothing new.
- Produces (used by every later task):

```ts
// apps/api/src/common/html.ts
export function escapeHtml(s: string): string;

// apps/api/src/modules/telegram-bot/utils/keyboards.ts
import type { InlineKeyboardButton, KeyboardButton, ReplyKeyboardMarkup } from 'telegraf/typings/core/types/typegram';
export function buildMainReplyKeyboard(tmaUrl?: string): ReplyKeyboardMarkup;
export function buildMoreMenu(isOwner: boolean): InlineKeyboardButton[][];
export interface NavFooterParams {
  kind: 'report' | 'staff';
  date: string;      // the date encoded in nav callbacks (report: reportDate; staff: shown day)
  tenantId: string;
  minDate: string;   // inclusive lower clamp (tenant createdAt day)
  maxDate: string;   // inclusive upper clamp (today in tenant TZ)
  tmaUrl?: string;
}
export function buildNavFooter(p: NavFooterParams): InlineKeyboardButton[][];
export function shiftDay(date: string, n: number): string; // YYYY-MM-DD ± n days (UTC arithmetic)
```

- [ ] **Step 1: Write the failing tests**

```ts
// apps/api/src/common/html.spec.ts
import { escapeHtml } from './html';

describe('escapeHtml', () => {
  it('escapes &, <, >', () => {
    expect(escapeHtml('Brow & Up <VIP>')).toBe('Brow &amp; Up &lt;VIP&gt;');
  });
  it('passes plain text through', () => {
    expect(escapeHtml('Оксана Гарифзянова')).toBe('Оксана Гарифзянова');
  });
});
```

```ts
// apps/api/src/modules/telegram-bot/utils/keyboards.spec.ts
import { buildMainReplyKeyboard, buildMoreMenu, buildNavFooter, shiftDay } from './keyboards';

describe('buildMainReplyKeyboard', () => {
  it('is 2×2 with a web_app dashboard key when tmaUrl set', () => {
    const kb = buildMainReplyKeyboard('https://tma.example');
    expect(kb.keyboard).toEqual([
      [{ text: '📊 Отчёт' }, { text: '👥 Мастера' }],
      [{ text: '📱 Дашборд', web_app: { url: 'https://tma.example' } }, { text: '⚙️ Ещё' }],
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @altegio/api exec jest src/common/html.spec.ts src/modules/telegram-bot/utils/keyboards.spec.ts`
Expected: FAIL — cannot find modules `./html` / `./keyboards`.

- [ ] **Step 3: Implement `html.ts`**

```ts
// apps/api/src/common/html.ts
// Telegram HTML parse mode requires escaping these three characters in text nodes.
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
```

- [ ] **Step 4: Implement `keyboards.ts`**

```ts
import type { InlineKeyboardButton, ReplyKeyboardMarkup } from 'telegraf/typings/core/types/typegram';

export function buildMainReplyKeyboard(tmaUrl?: string): ReplyKeyboardMarkup {
  const row2 = tmaUrl
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
```

- [ ] **Step 5: Add `TMA_URL` to config + `.env.example`**

In `apps/api/src/config/app.config.ts`, next to `TELEGRAM_BOT_TOKEN` add:

```ts
  TMA_URL: z.string().url().optional().or(z.literal('').transform(() => undefined)),
```

In `.env.example` add a line: `TMA_URL=` (with a comment `# HTTPS URL of the Telegram Mini App dashboard`).

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @altegio/api exec jest src/common/html.spec.ts src/modules/telegram-bot/utils/keyboards.spec.ts`
Expected: PASS (9 tests).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/common apps/api/src/modules/telegram-bot/utils/keyboards.ts apps/api/src/modules/telegram-bot/utils/keyboards.spec.ts apps/api/src/config/app.config.ts .env.example
git commit -m "feat(bot): TMA_URL config, escapeHtml, keyboard builders"
```

---

### Task 2: HTML report renderers

**Files:**
- Modify: `apps/api/src/modules/reports/template.renderer.ts`
- Modify: `apps/api/src/modules/reports/template.renderer.spec.ts` (update assertions)

**Interfaces:**
- Consumes: `escapeHtml` from `../../common/html` (Task 1).
- Produces: `renderYesterdayMessage(data)` / `renderTodayMessage(data)` now return **HTML** strings. Signatures unchanged — callers (`reports.service.ts`, `/report` handler) keep working; they gain `parse_mode: 'HTML'` in Task 3.

**Transformation rules (apply to BOTH renderers; keep every existing block, order, number, and Russian wording — formatting only):**

1. `escapeHtml(...)` around every interpolated user string: `salonName`, staff names, source names, category names, `aiInsight` text. Numbers/dates produced by our formatters need no escaping.
2. Header: salon name bold, date line italic. Example — before:
   `☀ Доброе утро! ${salonName}` / `📊 Вчера · ${dateStr}`
   after:
   `☀ Доброе утро! <b>${escapeHtml(salonName)}</b>` / `<i>📊 Вчера · ${dateStr}</i>`
3. Key numbers bold. Example — before:
   `• Выручка:      ${fmtMoney(y.revenue)}${deltaSuffix}`
   after:
   `• Выручка: <b>${fmtMoney(y.revenue)}</b>${deltaSuffix}`
   Apply the same `<b>` to: средний чек, загрузка, план-месяца «Факт»/«Темп» values, and the revenue numbers in «Динамика выручки». Collapse the old multi-space alignment padding to a single space (proportional font never aligned it anyway).
4. Alerts/attention block(s) and the AI insight: wrap each block's lines in `<blockquote>…</blockquote>` (one blockquote per block; newlines inside are preserved by Telegram).
5. Section titles (`📈 Динамика выручки`, `💰 План месяца`, `📡 Откуда записи`, etc.): wrap in `<b>…</b>`.

- [ ] **Step 1: Update the spec first (failing)**

In `template.renderer.spec.ts`, update existing assertions that match exact plain-text lines to the HTML forms per the rules above (e.g. an assertion expecting `☀ Доброе утро! BrowUp` becomes `☀ Доброе утро! <b>BrowUp</b>`). Add two new tests:

```ts
it('escapes HTML-dangerous characters in names', () => {
  const data = makeData({ salonName: 'Brow & Up <VIP>' }); // use the spec's existing fixture builder
  const msg = renderYesterdayMessage(data);
  expect(msg).toContain('Brow &amp; Up &lt;VIP&gt;');
  expect(msg).not.toContain('<VIP>');
});

it('wraps the AI insight in a blockquote', () => {
  const data = makeData({});
  data.yesterday.aiInsight = 'Совет: догрузите среду';
  const msg = renderYesterdayMessage(data);
  expect(msg).toContain('<blockquote>');
  expect(msg).toContain('Совет: догрузите среду');
});
```

(Adapt `makeData` to whatever fixture helper the spec already uses — do not invent a second fixture system.)

- [ ] **Step 2: Run spec to verify it fails**

Run: `pnpm --filter @altegio/api exec jest src/modules/reports/template.renderer.spec.ts`
Expected: FAIL on the updated/added assertions.

- [ ] **Step 3: Apply the transformation to `template.renderer.ts`**

Import `escapeHtml` and apply rules 1–5 to both `renderYesterdayMessage` and `renderTodayMessage`. Do not add/remove/reorder content blocks.

- [ ] **Step 4: Run spec to verify it passes**

Run: `pnpm --filter @altegio/api exec jest src/modules/reports/template.renderer.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/reports/template.renderer.ts apps/api/src/modules/reports/template.renderer.spec.ts
git commit -m "feat(reports): HTML report rendering with escaping and blockquote alerts"
```

---

### Task 3: HTML delivery + footer on the scheduled report

**Files:**
- Modify: `apps/api/src/modules/telegram/telegram.service.ts`
- Modify: `apps/api/src/modules/reports/reports.service.ts` (attach footer to the yesterday message)
- Test: `apps/api/src/modules/reports/reports.service.spec.ts` (update the sender mock/assertions)

**Interfaces:**
- Consumes: `buildNavFooter`, `shiftDay` (Task 1); HTML renderers (Task 2).
- Produces:

```ts
// telegram.service.ts
import type { InlineKeyboardMarkup } from 'telegraf/typings/core/types/typegram';
export interface SendReportOpts { replyMarkup?: InlineKeyboardMarkup }
export interface ITelegramSender {
  sendReport(chatId: number, text: string, opts?: SendReportOpts): Promise<{ messageId: number }>;
}
```

- [ ] **Step 1: Update `telegram.service.ts`**

Extend the interface as above and change the send call (retry loop, 403 handling, dry-run all unchanged):

```ts
  async sendReport(chatId: number, text: string, opts?: SendReportOpts): Promise<{ messageId: number }> {
    // ... existing dry-run guard unchanged ...
    // inside the retry loop:
        const msg = await this.bot.telegram.sendMessage(chatId, text, {
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true },
          ...(opts?.replyMarkup ? { reply_markup: opts.replyMarkup } : {}),
        });
```

- [ ] **Step 2: Attach the footer in `reports.service.ts` `generateAndDeliver`**

At the top of the method (after `tenant` is loaded) compute the footer once:

```ts
    const cfg = loadConfig(); // add import from '../../config/app.config'
    const todayInTz = new Intl.DateTimeFormat('en-CA', { timeZone: tenant.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const footer: InlineKeyboardMarkup = {
      inline_keyboard: buildNavFooter({
        kind: 'report',
        date: reportDate,
        tenantId,
        minDate: tenant.createdAt.toISOString().slice(0, 10),
        maxDate: todayInTz,
        tmaUrl: cfg.TMA_URL,
      }),
    };
```

In the send loop, pass it ONLY for the yesterday message (the navigable artifact; the today message stays button-free):

```ts
          const { messageId } = await this.telegram.sendReport(
            chatId,
            text,
            kind === 'yesterday' ? { replyMarkup: footer } : undefined,
          );
```

- [ ] **Step 3: Update `reports.service.spec.ts`**

The sender mock's `sendReport` now receives a third argument for yesterday sends. Update assertions: yesterday call gets `{ replyMarkup: expect.objectContaining({ inline_keyboard: expect.any(Array) }) }`, today call gets `undefined`. Keep all existing delivery/idempotency/failure tests passing.

- [ ] **Step 4: Run the specs**

Run: `pnpm --filter @altegio/api exec jest src/modules/reports/reports.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/telegram/telegram.service.ts apps/api/src/modules/reports/reports.service.ts apps/api/src/modules/reports/reports.service.spec.ts
git commit -m "feat(reports): HTML delivery + dashboard/nav footer on morning report"
```

---

### Task 4: Startup registration + `/start` + `/help`

**Files:**
- Modify: `apps/api/src/modules/telegram-bot/telegram-bot.service.ts`
- Modify: `apps/api/src/modules/telegram-bot/commands/start.handler.ts`
- Modify: `apps/api/src/modules/telegram-bot/commands/help.handler.ts`

**Interfaces:**
- Consumes: `buildMainReplyKeyboard` (Task 1), `cfg.TMA_URL`.
- Produces: `registerStart(bot, deps: { logs: BotLogsService; tmaUrl?: string })` — signature change; call site updated in the same task.

- [ ] **Step 1: Startup registration in `telegram-bot.service.ts`**

In `tryLaunch`, after all handlers are registered and before `bot.launch(...)`, add (and store `cfg` from `onModuleInit` on the instance or re-call `loadConfig()`):

```ts
    void this.registerTelegramUi(loadConfig().TMA_URL);
```

New private method:

```ts
  private async registerTelegramUi(tmaUrl?: string): Promise<void> {
    if (!this.bot) return;
    try {
      await this.bot.telegram.setMyCommands([
        { command: 'report', description: 'Отчёт за день' },
        { command: 'staff', description: 'Мастера за день' },
        { command: 'status', description: 'Статус доставки отчётов' },
        { command: 'subscribe', description: 'Подписка на утренний отчёт' },
        { command: 'help', description: 'Справка' },
        { command: 'link', description: 'Привязать салон по коду' },
        { command: 'invite', description: 'Пригласить сотрудника (владелец)' },
        { command: 'sync', description: 'Синхронизация данных (владелец)' },
      ]);
      if (tmaUrl) {
        await this.bot.telegram.setChatMenuButton({
          menuButton: { type: 'web_app', text: 'Дашборд', web_app: { url: tmaUrl } },
        });
      }
      this.log.log('Telegram UI registered (commands + menu button)');
    } catch (err: any) {
      this.log.warn(`Telegram UI registration failed: ${err?.message ?? err}`);
    }
  }
```

Update the `registerStart` call site: `registerStart(this.bot, { logs: this.logs, tmaUrl: loadConfig().TMA_URL });`

- [ ] **Step 2: Rework `start.handler.ts`**

```ts
import type { Telegraf } from 'telegraf';
import type { BotContext } from '../utils/context';
import type { BotLogsService } from '../bot-logs.service';
import { buildMainReplyKeyboard } from '../utils/keyboards';

export function registerStart(bot: Telegraf<BotContext>, deps: { logs: BotLogsService; tmaUrl?: string }): void {
  bot.start(async (ctx) => {
    await deps.logs.log({ chatId: ctx.state.chatId, tenantId: null, command: '/start' });
    const linked = ctx.state.tenants.length > 0;
    if (linked) {
      await ctx.reply(
        'С возвращением! Управляйте салоном кнопками ниже 👇',
        { parse_mode: 'HTML', reply_markup: buildMainReplyKeyboard(deps.tmaUrl) },
      );
    } else {
      await ctx.reply(
        'Привет! Это бот аналитики салона.\n\n' +
        'Если владелец салона прислал вам код — введите:\n<code>/link 123456</code>\n\n' +
        '/help — список команд.',
        { parse_mode: 'HTML' },
      );
    }
  });
}
```

Also show the keyboard after a successful link: in `link.handler.ts`, find the success reply and add `reply_markup: buildMainReplyKeyboard(deps.tmaUrl)` — for this, extend `registerLink`'s deps with `tmaUrl?: string` and update its call site too (mechanically identical to start).

- [ ] **Step 3: Rework `/help` grouping in `help.handler.ts`**

Replace the flat `lines` with grouped HTML (keep the existing log call and reply flow, switch `parse_mode` to `'HTML'`):

```ts
    const lines = [
      '<b>Основное</b>',
      '📊 Отчёт — /report [YYYY-MM-DD]',
      '👥 Мастера — /staff [YYYY-MM-DD]',
      '📈 Статус доставки — /status',
      '🔔 Подписка — /subscribe on|off',
      '',
      '<b>Для владельца</b>',
      '🎟 Инвайт сотрудника — /invite',
      '🔄 Синк данных — /sync',
      '',
      '<b>Прочее</b>',
      '🔗 Привязка по коду — /link <code>код</code>',
      'Кнопки внизу чата дублируют главные действия.',
    ];
    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
```

- [ ] **Step 4: Typecheck + existing suite**

Run: `pnpm --filter @altegio/api build && pnpm --filter @altegio/api test`
Expected: build clean; unit suite green (no handler specs exist for start/help; service specs unaffected).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/telegram-bot
git commit -m "feat(bot): command menu, TMA menu button, reply keyboard, grouped help"
```

---

### Task 5: `/report` — reply-key entry + day navigation

**Files:**
- Modify: `apps/api/src/modules/telegram-bot/commands/report.handler.ts`
- Modify: `apps/api/src/modules/telegram-bot/telegram-bot.service.ts` (pass `tmaUrl` into `registerReport` deps)
- Test: `apps/api/src/modules/telegram-bot/commands/report-nav.spec.ts` (new — pure helpers)

**Interfaces:**
- Consumes: `buildNavFooter`, `shiftDay` (Task 1); `deps` gains `tmaUrl?: string`.
- Produces: callback namespace `report:nav:<date>:<tenantId>`; exported pure helper `parseNavCallback(data: string): { kind: string; date: string; tenantId: string } | null` (shared with Task 6 — put it in `apps/api/src/modules/telegram-bot/utils/keyboards.ts`).

- [ ] **Step 1: Add `parseNavCallback` to `keyboards.ts` + failing test**

```ts
// append to keyboards.ts
const NAV_RE = /^(report|staff):nav:(\d{4}-\d{2}-\d{2}):(\S+)$/;
export function parseNavCallback(data: string): { kind: 'report' | 'staff'; date: string; tenantId: string } | null {
  const m = NAV_RE.exec(data);
  return m ? { kind: m[1] as 'report' | 'staff', date: m[2], tenantId: m[3] } : null;
}
```

```ts
// apps/api/src/modules/telegram-bot/commands/report-nav.spec.ts
import { parseNavCallback } from '../utils/keyboards';

describe('parseNavCallback', () => {
  it('parses a valid report nav', () => {
    expect(parseNavCallback('report:nav:2026-07-01:t1')).toEqual({ kind: 'report', date: '2026-07-01', tenantId: 't1' });
  });
  it('rejects the tenant-picker shape', () => {
    expect(parseNavCallback('report:2026-07-01:t1')).toBeNull();
  });
});
```

Run: `pnpm --filter @altegio/api exec jest src/modules/telegram-bot/commands/report-nav.spec.ts` → FAIL, implement, → PASS.

- [ ] **Step 2: Rework `report.handler.ts`**

Changes (deps type becomes `{ reports; tenants; logs; tmaUrl?: string }`):

1. Extract the `bot.command('report', ...)` body into a module-level `handleReportCommand(ctx, deps, arg?)` and call it from BOTH `bot.command('report', ...)` (parsing `arg` from text) and a new `bot.hears('📊 Отчёт', ...)` (arg `undefined`). Log the hears entry as command `'/report'` with `args: { via: 'button' }`.
2. Tighten the tenant-picker action regex so nav never matches it: `bot.action(/^report:((?!nav:)\S*):(\S+)$/, ...)` — body unchanged.
3. In `runReport`, send the yesterday message WITH the footer and `parse_mode: 'HTML'`; today message plain HTML:

```ts
    const msgs = await deps.reports.buildMessages(tenantId, reportDate);
    const footer = buildNavFooter({
      kind: 'report', date: reportDate, tenantId,
      minDate: createdDay, maxDate: todayInTz, tmaUrl: deps.tmaUrl,
    });
    await ctx.reply(msgs.yesterday, { parse_mode: 'HTML', reply_markup: { inline_keyboard: footer } });
    await ctx.reply(msgs.today, { parse_mode: 'HTML' });
```

4. Register the nav action BEFORE the picker action:

```ts
  bot.action(/^report:nav:(\d{4}-\d{2}-\d{2}):(\S+)$/, async (ctx) => {
    const [, date, tenantId] = ctx.match;
    await ctx.answerCbQuery();
    const tenant = await deps.tenants.findById(tenantId);
    if (!tenant) return;
    const todayInTz = nowInTz(tenant.timezone);
    const createdDay = tenant.createdAt.toISOString().slice(0, 10);
    if (date > todayInTz || date < createdDay) return; // clamp: ignore stale buttons
    const msgs = await deps.reports.buildMessages(tenantId, date);
    const footer = buildNavFooter({ kind: 'report', date, tenantId, minDate: createdDay, maxDate: todayInTz, tmaUrl: deps.tmaUrl });
    await ctx.editMessageText(msgs.yesterday, { parse_mode: 'HTML', reply_markup: { inline_keyboard: footer } })
      .catch(() => undefined); // "message is not modified" and similar are non-fatal
  });
```

5. Update the call site in `telegram-bot.service.ts` to pass `tmaUrl: loadConfig().TMA_URL`.

- [ ] **Step 3: Typecheck + suite**

Run: `pnpm --filter @altegio/api build && pnpm --filter @altegio/api test`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/telegram-bot
git commit -m "feat(bot): report via reply key + in-place day navigation"
```

---

### Task 6: `/staff` — reply-key entry + day navigation + HTML

**Files:**
- Modify: `apps/api/src/modules/telegram-bot/commands/staff.handler.ts`
- Modify: `apps/api/src/modules/telegram-bot/telegram-bot.service.ts` (pass `tmaUrl` into `registerStaff` deps)

**Interfaces:**
- Consumes: `buildNavFooter`, `shiftDay`, `escapeHtml`; deps gain `tmaUrl?: string`.
- Produces: callback namespace `staff:nav:<date>:<tenantId>`.

- [ ] **Step 1: Rework `staff.handler.ts`** (mirrors Task 5 mechanically)

1. Extract the command body into `handleStaffCommand(ctx, deps, arg?)`; add `bot.hears('👥 Мастера', ...)` calling it with `arg` undefined; log as `'/staff'` with `args: { via: 'button' }`.
2. Tighten picker regex: `bot.action(/^staff:((?!nav:)\S*):(\S+)$/, ...)`.
3. Extract the message-building part of `runStaff` into `buildStaffMessage(rows, date): string` returning HTML (names escaped, header bold):

```ts
function buildStaffMessage(rows: Array<{ name: string; revenue: number; visits: number; avgCheck: number }>, date: string): string {
  const lines: string[] = [`<b>👥 Мастера · ${date}</b>`, ''];
  rows.forEach((r, i) => {
    lines.push(`${i + 1}. ${escapeHtml(r.name)}`);
    lines.push(`   <b>${fmtMoney(r.revenue)}</b> · ${r.visits} визитов · ср.чек ${fmtMoney(r.avgCheck)}`);
  });
  return lines.join('\n');
}
```

4. In `runStaff`, reply with HTML + footer (`kind: 'staff'`, `date` = shown day, `minDate` = createdDay, `maxDate` = yesterday in tenant TZ — staff shows completed days only, so clamp max at `subtractDays(todayInTz, 1)`).
5. Nav action (registered before the picker action):

```ts
  bot.action(/^staff:nav:(\d{4}-\d{2}-\d{2}):(\S+)$/, async (ctx) => {
    const [, date, tenantId] = ctx.match;
    await ctx.answerCbQuery();
    const tenant = await deps.tenants.findById(tenantId);
    if (!tenant) return;
    const todayInTz = nowInTz(tenant.timezone);
    const maxDate = subtractDays(todayInTz, 1);
    const createdDay = tenant.createdAt.toISOString().slice(0, 10);
    if (date > maxDate || date < createdDay) return;
    const rows = await deps.metrics.staffDailyBreakdown(tenantId, date, tenant.timezone);
    const text = rows.length ? buildStaffMessage(rows, date) : `Нет визитов за ${date}.`;
    const footer = buildNavFooter({ kind: 'staff', date, tenantId, minDate: createdDay, maxDate, tmaUrl: deps.tmaUrl });
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: { inline_keyboard: footer } })
      .catch(() => undefined);
  });
```

6. Update the `registerStaff` call site with `tmaUrl`.

- [ ] **Step 2: Typecheck + suite**

Run: `pnpm --filter @altegio/api build && pnpm --filter @altegio/api test`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/telegram-bot
git commit -m "feat(bot): staff via reply key + in-place day navigation, HTML"
```

---

### Task 7: «⚙️ Ещё» inline menu + prod rollout

**Files:**
- Create: `apps/api/src/modules/telegram-bot/commands/more.handler.ts`
- Modify: `apps/api/src/modules/telegram-bot/commands/status.handler.ts`, `subscribe.handler.ts`, `sync.handler.ts`, `invite.handler.ts` (export command entries)
- Modify: `apps/api/src/modules/telegram-bot/telegram-bot.service.ts` (register more.handler with all deps)

**Interfaces:**
- Consumes: `buildMoreMenu` (Task 1), `isOwner` helper from `utils/context.ts`.
- Produces: exported entries — the SAME mechanical extraction already done for report/staff in Tasks 5–6: in each of the four handlers, move the `bot.command(...)` callback body (including its tenant-picker branch) into an exported `export async function handleStatusCommand(ctx, deps)` / `handleSubscribeCommand(ctx, deps, value: boolean)` / `handleSyncCommand(ctx, deps)` / `handleInviteCommand(ctx, deps)`, and call it from the existing `bot.command(...)` registration. Behavior of the slash commands must not change.

- [ ] **Step 1: Extract the four command entries**

Apply the extraction per handler. Concrete template (status; the other three follow the identical move-body-into-exported-function shape with their own deps and args):

```ts
// status.handler.ts — before: bot.command('status', async (ctx) => { <BODY> });
export async function handleStatusCommand(
  ctx: BotContext,
  deps: { tenants: TenantsService; deliveries: Repository<ReportDeliveryEntity>; logs: BotLogsService },
): Promise<void> {
  // <BODY> moved here verbatim (including its logs.log call and tenant-picker branch)
}
export function registerStatus(bot: Telegraf<BotContext>, deps: /* unchanged */): void {
  bot.command('status', async (ctx) => handleStatusCommand(ctx as unknown as BotContext, deps));
  // existing bot.action registrations unchanged
}
```

For subscribe: `handleSubscribeCommand(ctx, deps, value: boolean)` — the command parses `on|off` into `value` before delegating; the more-menu passes the value directly.

- [ ] **Step 2: Implement `more.handler.ts`**

```ts
import type { Telegraf } from 'telegraf';
import type { BotContext } from '../utils/context';
import { buildMoreMenu } from '../utils/keyboards';
import { handleStatusCommand } from './status.handler';
import { handleSubscribeCommand } from './subscribe.handler';
import { handleSyncCommand } from './sync.handler';
import { handleInviteCommand } from './invite.handler';

// deps: union of the four handlers' deps — pass everything from telegram-bot.service
export function registerMore(bot: Telegraf<BotContext>, deps: MoreDeps): void {
  bot.hears('⚙️ Ещё', async (ctx) => {
    await deps.logs.log({ chatId: ctx.state.chatId, tenantId: null, command: '/more' });
    const owner = ctx.state.tenants.some((t) => t.role === 'owner');
    await ctx.reply('Дополнительно:', { reply_markup: { inline_keyboard: buildMoreMenu(owner) } });
  });

  bot.action('more:status', async (ctx) => { await ctx.answerCbQuery(); await handleStatusCommand(ctx as unknown as BotContext, deps); });
  bot.action(/^more:sub:(0|1)$/, async (ctx) => { await ctx.answerCbQuery(); await handleSubscribeCommand(ctx as unknown as BotContext, deps, ctx.match[1] === '1'); });
  bot.action('more:sync', async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.state.tenants.some((t) => t.role === 'owner')) { await ctx.reply('Только для владельца.'); return; }
    await handleSyncCommand(ctx as unknown as BotContext, deps);
  });
  bot.action('more:invite', async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.state.tenants.some((t) => t.role === 'owner')) { await ctx.reply('Только для владельца.'); return; }
    await handleInviteCommand(ctx as unknown as BotContext, deps);
  });
}
```

Define `MoreDeps` as the union type of the four handlers' deps. Register in `telegram-bot.service.ts` after the existing handler registrations (inside the linked-guard scope so unlinked users get the standard prompt).

- [ ] **Step 3: Typecheck + full unit suite**

Run: `pnpm --filter @altegio/api build && pnpm --filter @altegio/api test`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/telegram-bot
git commit -m "feat(bot): «Ещё» inline menu reusing command entries"
```

- [ ] **Step 5: Prod rollout + manual smoke (after merge to main — controller/user step)**

1. Add to `/opt/altegio-ai/.env` on the VPS: `TMA_URL=https://altegio.167.99.250.107.nip.io`; the deploy pipeline (or `docker compose up -d --force-recreate --no-deps api`) restarts the API.
2. Smoke in Telegram (@altegio_aibot, BrowUp chat):
   - `/start` → greeting + 2×2 keyboard; typing «/» shows described commands; chat menu button opens the TMA.
   - `📊 Отчёт` → HTML report (bold numbers, blockquote), footer `[📱 Открыть дашборд]` + arrows; arrows edit the message in place; no «next» past today.
   - `👥 Мастера` → HTML list + arrows; navigation edits in place; clamped at yesterday.
   - `⚙️ Ещё` → menu; `Статус` and `Подписка` work; owner sees `Синк`/`Инвайт`.
   - Morning scheduled report (or `trigger-report` CLI) arrives as HTML with the footer.

---

## Self-Review notes

- **Spec coverage:** §1 registration → Task 4; §2 HTML report → Tasks 2–3; §3 reply keyboard (incl. `/link` success) → Task 4; §4 inline nav (report+staff, in-place, clamped, collision-safe regex) → Tasks 1, 5, 6; §5 start/help → Task 4; §6 boundaries honored (no metric/delivery-logic changes; AI out); §7 tests → Tasks 1–3 unit, 4–6 typecheck+suite, 7 manual smoke. ✔
- **Type consistency:** `buildNavFooter(NavFooterParams)`, `parseNavCallback`, `SendReportOpts`, `handleXCommand` names used identically across tasks; deps extensions (`tmaUrl?: string`) applied at every call site named. ✔
- **Placeholder scan:** the only "same pattern" reference (Task 7 extraction) includes a full concrete template plus exact exported signatures for all four handlers — mechanical verbatim move, not an unspecified TODO. ✔
- **Known risk:** `template.renderer.spec.ts` assertions are numerous; Task 2 defines the exact transformation rules so updates are mechanical.
