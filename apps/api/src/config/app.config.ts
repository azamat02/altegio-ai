import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  ALTEGIO_BASE_URL: z.string().url().default('https://api.alteg.io/api/v1'),
  ALTEGIO_PARTNER_TOKEN: z.string().min(1),
  ALTEGIO_USER_TOKEN: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1).optional().or(z.literal('').transform(() => undefined)),
  ANTHROPIC_MODEL: z.string().default('claude-haiku-4-5-20251001'),
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional().or(z.literal('').transform(() => undefined)),
  TELEGRAM_OWNER_CHAT_ID: z.string().optional().or(z.literal('').transform(() => undefined)),
  APP_ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/, 'must be 32 bytes hex'),
  SENTRY_DSN: z.string().optional().or(z.literal('').transform(() => undefined)),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  SCHEDULER_ENABLED: z.enum(['true', 'false']).default('false'),
  BOT_ENABLED: z.enum(['true', 'false']).default('false'),
  BOT_USERNAME: z.string().optional().or(z.literal('').transform(() => undefined)),
});

export type AppConfig = z.infer<typeof schema>;

export function loadConfig(): AppConfig {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid env: ${JSON.stringify(parsed.error.format(), null, 2)}`);
  }
  return parsed.data;
}
