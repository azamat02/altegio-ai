import 'dotenv/config';
import { Telegraf, Markup } from 'telegraf';

const token = process.env.BOT_TOKEN;
const MINIAPP_URL = process.env.MINIAPP_URL;
if (!token) throw new Error('BOT_TOKEN missing');

const bot = new Telegraf(token);

// HTML parse_mode — reliable, supports the styled <blockquote> framing.
const REPORT = [
  '<b>MALLI</b> — сводка за вчера',
  '<i>понедельник, 23 июня</i>',
  '',
  'Выручка <b>1 240 000 ₸</b>  ·  <b>+18%</b> к норме',
  'Чеков 12  ·  средний чек 103 000 ₸',
  '',
  '<blockquote>🔥 <b>Хит</b> — Pavlova: 3 шт на 555 000 ₸, маржа 61%',
  '🧊 <b>Зависло</b> — 7 моделей 90+ дней, заморожено 2,1 млн ₸',
  '📏 <b>Дефицит</b> — Laima: нет S и M, а спрос идёт',
  '🔁 <b>Возвраты</b> — Turandot вернули чаще обычного',
  '💰 <b>На счету</b> — 4,3 млн ₸</blockquote>',
  '',
  '<i>Детали по товарам, размерам и клиентам — в дашборде ниже.</i>',
].join('\n');

const keyboard = Markup.inlineKeyboard([
  Markup.button.webApp('Открыть дашборд', MINIAPP_URL),
]);

const opts = { parse_mode: 'HTML', ...keyboard, link_preview_options: { is_disabled: true } };

const sendReport = (ctx) => ctx.reply(REPORT, opts);

bot.start((ctx) =>
  ctx.reply(
    'Здравствуйте! Я — аналитика <b>MALLI</b>.\nКаждое утро присылаю короткую сводку по магазину: выручка, что продаётся, что зависло, где дефицит размеров.\n\nВот сегодняшняя 👇',
    { parse_mode: 'HTML' },
  ).then(() => sendReport(ctx)),
);

bot.command('report', sendReport);
bot.command('app', (ctx) => ctx.reply('Дашборд:', opts));

bot.launch(() => console.log('✅ MALLI demo bot is running (long-polling)'));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
