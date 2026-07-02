# Telegram bot UX overhaul — design spec

**Date:** 2026-07-02
**Status:** Approved (brainstorming)
**Goal:** Replace the bare slash-command UX with a button-driven, formatted interface: registered
command menu, TMA menu button, HTML morning report with inline actions, a persistent 2×2 reply
keyboard, and day-by-day navigation — without touching metrics or report logic.

## Context

- Bot: `apps/api/src/modules/telegram-bot` (telegraf), 9 slash handlers (`start, help, report,
  staff, status, subscribe, sync, invite, link`). Inline keyboards exist only for the multi-salon
  tenant picker (`buildTenantPickerKeyboard`, callback patterns like `report:<arg>:<tenantId>`).
- `setMyCommands` / `setChatMenuButton` are NOT called anywhere — typing “/” shows no hints and
  there is no dashboard button.
- Morning report: rendered as plain text by `apps/api/src/modules/reports/template.renderer.ts`,
  delivered by `apps/api/src/modules/telegram/telegram.service.ts` `sendMessage` (no parse_mode,
  no buttons, `link_preview_options` disabled).
- Owner-only commands are enforced via `ownerGuard` on `['invite', 'sync']`.
- Prod: bot `@altegio_aibot` polls on the VPS; TMA is served same-origin at
  `https://altegio.167.99.250.107.nip.io`. Real tenant BrowUp Almaty is onboarded.

## Decisions (locked)

| Decision | Choice |
|---|---|
| Scope | UX layer only: registration, formatting, keyboards, navigation. Metrics/report logic untouched. |
| AI free-text consultant | Explicitly OUT — separate project (Phase 4), blocked on Anthropic key anyway. |
| Reply keyboard | 2×2: `[📊 Отчёт] [👥 Мастера] / [📱 Дашборд] [⚙️ Ещё]`, persistent, `resize_keyboard: true`. |
| Dashboard buttons | Telegram Web App buttons pointing at new env `TMA_URL`. |
| Report format | HTML parse mode with `<blockquote>` alert block (as proven in the MALLI demo). |

## 1. Telegram registration (bot startup, idempotent)

On bot launch (`telegram-bot.service.ts` after `bot.launch()` guard passes):

- `setMyCommands` with Russian descriptions for all commands (one shared list; role guards
  already protect owner-only actions at execution time).
- `setChatMenuButton` → `{ type: 'web_app', text: 'Дашборд', web_app: { url: TMA_URL } }`.
- New config `TMA_URL` (added to `loadConfig`, `.env.example`, and the prod `.env`:
  `https://altegio.167.99.250.107.nip.io`). If `TMA_URL` is unset, skip menu-button setup and any
  web_app buttons (bot still works — graceful degradation for dev environments).

## 2. HTML morning report

`template.renderer.ts` renders HTML instead of plain text:

- Bold key numbers (revenue, delta, avg check), italic date line, `<blockquote>` wrapping the
  alerts/attention block, plain structure otherwise.
- New `escapeHtml(s)` helper applied to ALL interpolated user data (salon name, staff names,
  category/source names). This is a hard requirement — unescaped `<`/`&` in a name must not break
  parsing.
- `telegram.service.ts` `sendMessage` gains `parse_mode: 'HTML'` and an optional `reply_markup`
  parameter; existing delivery/retry logic unchanged. `/report` handler replies use the same
  options.

## 3. Reply keyboard 2×2

- Shown with the `/start` reply (and after successful `/link`), persistent.
- Layout: row1 `[📊 Отчёт] [👥 Мастера]`, row2 `[📱 Дашборд (web_app)] [⚙️ Ещё]`.
  The dashboard key is a `KeyboardButton` with `web_app` (valid in private chats). When `TMA_URL`
  is unset, the dashboard key is omitted (row2 = `[⚙️ Ещё]`).
- `bot.hears('📊 Отчёт', ...)` / `bot.hears('👥 Мастера', ...)` reuse the SAME code paths as
  `/report` and `/staff` (extract shared `runReport`/`runStaff` entry points; no logic
  duplication). Tenant-picker behavior for multi-salon users is preserved.
- `⚙️ Ещё` sends a message with an inline menu: `Статус` · `Подписка вкл/выкл` · and for owners
  additionally `Синк` · `Инвайт`. Buttons trigger the existing handlers via callbacks; role check
  reuses the same logic as `ownerGuard`.

## 4. Inline actions under content

- **Morning report** (both scheduled delivery and `/report`): footer keyboard
  `[📱 Открыть дашборд (web_app)]` + `[◀️ Пред. день] [След. день ▶️]`.
- **`/staff`**: same prev/next day arrows.
- Navigation callbacks re-render **in place** via `editMessageText` (no new messages).
  Callback data: `report:nav:<date>:<tenantId>` and `staff:nav:<date>:<tenantId>` — consistent
  with the existing `report:<arg>:<tenantId>` action namespace (regexes must not collide: the
  `nav` literal disambiguates).
- “Next day” must not navigate into the future (button omitted when the shown date is the latest
  available, i.e. yesterday in tenant TZ for reports).

## 5. `/start` and `/help`

- `/start` (linked user): short HTML greeting + reply keyboard + one-line hint to use the buttons.
  Unlinked user: current linking instructions, unchanged flow.
- `/help`: regrouped by role (общие / для владельца), HTML formatting.

## 6. Boundaries (explicit)

- No changes to `MetricsService`, `ReportsService` data logic, sync, or scheduler behavior.
- No AI/free-text handling.
- Existing tenant-picker flows keep working for multi-salon chats.
- Delivery retry/error handling in `telegram.service.ts` unchanged (only message options extended).

## 7. Testing

- Unit: `escapeHtml` + HTML renderer structure (report contains `<blockquote>`, escaped names);
  keyboard builders (2×2 layout, dashboard key omitted without `TMA_URL`, owner vs member “Ещё”
  menu); nav callback data parse/format helpers (incl. future-date clamp).
- Update existing handler specs for new reply options.
- Manual smoke on `@altegio_aibot` with BrowUp data: start → keyboard, report with buttons,
  day navigation edits in place, dashboard opens TMA.

## Success criteria

An owner can drive everything from buttons: `/start` shows a persistent keyboard; the morning
report is formatted HTML with a dashboard button and day navigation that edits in place; typing
“/” shows described commands; the chat menu button opens the TMA. No metric or delivery logic
changed; all new presentation helpers unit-tested.
