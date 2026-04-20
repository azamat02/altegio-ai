# Altegio AI Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a production Telegram bot that delivers a daily morning report (yesterday's revenue, top staff, cancellations, today's outlook, AI-generated insight) to each onboarded beauty-salon owner at 09:00 local time, powered by a periodic Altegio API sync.

**Architecture:** NestJS monorepo (apps/api, apps/cli) on Docker Compose. Three-layer Postgres (raw JSONB → normalized facts → daily aggregates). Redis + BullMQ for sync/report queues. Telegraf for Telegram. Claude API for the single-paragraph insight. Multi-tenant from day one, closed onboarding via CLI.

**Tech Stack:** Node 20, pnpm, TypeScript, NestJS 10, TypeORM 0.3 (SQL-first migrations), Postgres 16, Redis 7, BullMQ, Telegraf 4, @anthropic-ai/sdk, Zod, Jest, testcontainers, Docker Compose, GitHub Actions, nginx + certbot on a single Ubuntu 22.04 VPS.

**Spec:** [`docs/superpowers/specs/2026-04-20-altegio-ai-phase-1-design.md`](../specs/2026-04-20-altegio-ai-phase-1-design.md)

---

## File structure (target end state)

```
altegio-ai/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── tenants/      (tenants.module, service, entity, token-cipher)
│   │   │   │   ├── altegio/      (altegio.module, client, endpoints/*, dto/*)
│   │   │   │   ├── sync/         (sync.module, service, parsers/*, aggregator, processor)
│   │   │   │   ├── metrics/      (metrics.module, service, types)
│   │   │   │   ├── reports/      (reports.module, service, template.renderer, ai-insight.service, processor)
│   │   │   │   ├── telegram/     (telegram.module, service)
│   │   │   │   ├── scheduler/    (scheduler.module, service)
│   │   │   │   └── health/       (health.module, controller)
│   │   │   ├── queues/           (queues.module — BullMQ wiring)
│   │   │   ├── db/               (data-source.ts, migrations/*)
│   │   │   ├── config/           (app.config.ts — zod env validation)
│   │   │   ├── app.module.ts
│   │   │   └── main.ts
│   │   ├── test/
│   │   │   └── fixtures/         (sanitized Altegio JSON, synthetic records)
│   │   ├── Dockerfile
│   │   ├── tsconfig.json
│   │   └── package.json
│   └── cli/
│       ├── src/
│       │   ├── commands/         (add-salon, link-telegram, trigger-sync, trigger-report)
│       │   └── main.ts
│       ├── tsconfig.json
│       └── package.json
├── packages/
│   └── shared/
│       ├── src/
│       │   ├── types/            (DailyReportData, DTOs)
│       │   └── index.ts
│       ├── tsconfig.json
│       └── package.json
├── docker/
│   ├── docker-compose.yml        (local dev)
│   └── docker-compose.prod.yml   (VPS)
├── deploy/
│   ├── nginx.conf
│   ├── vps-setup.sh
│   └── deploy.sh
├── .github/
│   └── workflows/ci.yml
├── .env.example
├── .gitignore
├── package.json                  (monorepo root)
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── eslint.config.mjs
└── README.md
```

---

## Milestone 1 — Scaffold (Tasks 1-4)

### Task 1: Initialize monorepo root

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `.env.example`, `README.md`

- [ ] **Step 1: Init git repo**

```bash
cd /Users/saiduly/Developer/altegio-ai
git init -b main
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules
dist
build
.env
.env.local
*.log
coverage
.DS_Store
.vercel
.turbo
.nyc_output
demo-site          # nested independent repo, not tracked here
```

- [ ] **Step 3: Create `package.json`**

```json
{
  "name": "altegio-ai",
  "version": "0.1.0",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "engines": { "node": ">=20.10.0" },
  "scripts": {
    "dev": "docker compose -f docker/docker-compose.yml up -d && pnpm -F @altegio/api start:dev",
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "eslint .",
    "cli": "pnpm -F @altegio/cli start --"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "eslint": "^9.0.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 4: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 5: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "lib": ["ES2022"],
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "baseUrl": ".",
    "paths": {
      "@altegio/shared": ["packages/shared/src"],
      "@altegio/shared/*": ["packages/shared/src/*"]
    }
  }
}
```

- [ ] **Step 6: Create `.env.example`**

```
NODE_ENV=development
PORT=3000

DATABASE_URL=postgresql://altegio:altegio_dev@localhost:5432/altegio_ai
REDIS_URL=redis://localhost:6379

ALTEGIO_BASE_URL=https://api.alteg.io/api/v1
ALTEGIO_PARTNER_TOKEN=replace_me

ANTHROPIC_API_KEY=replace_me
ANTHROPIC_MODEL=claude-haiku-4-5-20251001

TELEGRAM_BOT_TOKEN=replace_me
TELEGRAM_OWNER_CHAT_ID=replace_me

APP_ENCRYPTION_KEY=replace_with_32_byte_hex

SENTRY_DSN=
LOG_LEVEL=info
```

- [ ] **Step 7: Create minimal `README.md`**

```markdown
# Altegio AI

Analytics SaaS on top of Altegio API for beauty salons.

## Dev

    cp .env.example .env
    pnpm install
    pnpm dev

See `docs/superpowers/specs/` for design, `docs/superpowers/plans/` for implementation plans.
```

- [ ] **Step 8: Commit**

```bash
git add .
git commit -m "chore: init monorepo root with pnpm workspaces and tsconfig"
```

---

### Task 2: ESLint + Prettier base config

**Files:**
- Create: `eslint.config.mjs`, `.prettierrc`, `.prettierignore`

- [ ] **Step 1: Install base dev deps**

```bash
pnpm add -Dw typescript-eslint eslint prettier eslint-config-prettier eslint-plugin-prettier
```

- [ ] **Step 2: Create `eslint.config.mjs`**

```js
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', 'demo-site/**', 'mockups/**'],
  },
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
  },
);
```

- [ ] **Step 3: Create `.prettierrc`**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100
}
```

- [ ] **Step 4: Create `.prettierignore`**

```
dist
node_modules
coverage
demo-site
mockups
pnpm-lock.yaml
```

- [ ] **Step 5: Verify lint runs clean**

```bash
pnpm lint
```
Expected: "0 problems" (there are no ts files yet).

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "chore: add eslint + prettier config"
```

---

### Task 3: Scaffold `apps/api` NestJS

**Files:**
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/nest-cli.json`, `apps/api/src/main.ts`, `apps/api/src/app.module.ts`

- [ ] **Step 1: Install Nest deps in workspace**

```bash
pnpm add -F @altegio/api --save \
  @nestjs/common@^10 @nestjs/core@^10 @nestjs/platform-express@^10 \
  reflect-metadata rxjs

pnpm add -F @altegio/api --save-dev \
  @nestjs/cli@^10 @nestjs/testing@^10 \
  @types/express @types/jest @types/supertest \
  jest supertest ts-jest ts-node tsconfig-paths typescript
```

Note: workspace `-F @altegio/api` doesn't exist yet — run those commands AFTER creating the package.json below. Reorder if needed.

- [ ] **Step 2: Create `apps/api/package.json`**

```json
{
  "name": "@altegio/api",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "nest build",
    "start": "node dist/main.js",
    "start:dev": "nest start --watch",
    "start:debug": "nest start --debug --watch",
    "test": "jest --config jest.config.js",
    "test:watch": "jest --watch",
    "test:e2e": "jest --config jest-e2e.config.js"
  },
  "dependencies": {
    "@nestjs/common": "^10.3.0",
    "@nestjs/core": "^10.3.0",
    "@nestjs/platform-express": "^10.3.0",
    "reflect-metadata": "^0.2.0",
    "rxjs": "^7.8.0"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.3.0",
    "@nestjs/testing": "^10.3.0",
    "@types/express": "^4.17.0",
    "@types/jest": "^29.5.0",
    "@types/node": "^20.11.0",
    "@types/supertest": "^6.0.0",
    "jest": "^29.7.0",
    "supertest": "^6.3.0",
    "ts-jest": "^29.1.0",
    "ts-node": "^10.9.0",
    "tsconfig-paths": "^4.2.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 3: Run install**

```bash
pnpm install
```

- [ ] **Step 4: Create `apps/api/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": false
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test"]
}
```

- [ ] **Step 5: Create `apps/api/nest-cli.json`**

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true
  }
}
```

- [ ] **Step 6: Create `apps/api/jest.config.js`**

```js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: './src',
  testRegex: '.*\\.spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: { '^.+\\.ts$': 'ts-jest' },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
};
```

- [ ] **Step 7: Create `apps/api/src/app.module.ts`**

```ts
import { Module } from '@nestjs/common';

@Module({
  imports: [],
  controllers: [],
  providers: [],
})
export class AppModule {}
```

- [ ] **Step 8: Create `apps/api/src/main.ts`**

```ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  Logger.log(`API listening on :${port}`, 'Bootstrap');
}

void bootstrap();
```

- [ ] **Step 9: Verify build**

```bash
pnpm -F @altegio/api build
```
Expected: creates `apps/api/dist/` with no errors.

- [ ] **Step 10: Commit**

```bash
git add .
git commit -m "feat(api): scaffold NestJS app"
```

---

### Task 4: Docker Compose for local dev

**Files:**
- Create: `docker/docker-compose.yml`, `apps/api/Dockerfile.dev`

- [ ] **Step 1: Create `docker/docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: altegio_ai
      POSTGRES_USER: altegio
      POSTGRES_PASSWORD: altegio_dev
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U altegio -d altegio_ai"]
      interval: 5s
      timeout: 3s
      retries: 10

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  pgdata:
```

Note: the app itself runs on the host via `pnpm start:dev` during development — only infra (pg + redis) is containerized locally. A prod compose (Task 38) will add the app container.

- [ ] **Step 2: Start infra**

```bash
docker compose -f docker/docker-compose.yml up -d
```

- [ ] **Step 3: Verify services**

```bash
docker compose -f docker/docker-compose.yml ps
```
Expected: both `postgres` and `redis` show `healthy`.

- [ ] **Step 4: Test Postgres connection**

```bash
docker compose -f docker/docker-compose.yml exec postgres psql -U altegio -d altegio_ai -c "SELECT version();"
```
Expected: prints Postgres version.

- [ ] **Step 5: Commit**

```bash
git add docker/
git commit -m "chore(docker): add local postgres + redis compose"
```

---

## Milestone 2 — Database layer (Tasks 5-11)

### Task 5: TypeORM + config module

**Files:**
- Create: `apps/api/src/config/app.config.ts`, `apps/api/src/db/data-source.ts`, `apps/api/src/db/database.module.ts`

- [ ] **Step 1: Install deps**

```bash
pnpm add -F @altegio/api @nestjs/config @nestjs/typeorm typeorm pg zod
```

- [ ] **Step 2: Create `apps/api/src/config/app.config.ts`**

```ts
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  ALTEGIO_BASE_URL: z.string().url().default('https://api.alteg.io/api/v1'),
  ALTEGIO_PARTNER_TOKEN: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_MODEL: z.string().default('claude-haiku-4-5-20251001'),
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  TELEGRAM_OWNER_CHAT_ID: z.string().optional(),
  APP_ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/, 'must be 32 bytes hex'),
  SENTRY_DSN: z.string().optional(),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

export type AppConfig = z.infer<typeof schema>;

export function loadConfig(): AppConfig {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid env: ${JSON.stringify(parsed.error.format(), null, 2)}`);
  }
  return parsed.data;
}
```

- [ ] **Step 3: Create `apps/api/src/db/data-source.ts`**

```ts
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { loadConfig } from '../config/app.config';

const cfg = loadConfig();

export const dataSource = new DataSource({
  type: 'postgres',
  url: cfg.DATABASE_URL,
  entities: [__dirname + '/../modules/**/*.entity.{ts,js}'],
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  migrationsRun: false,
  synchronize: false,
  logging: cfg.LOG_LEVEL === 'debug',
});
```

- [ ] **Step 4: Create `apps/api/src/db/database.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { loadConfig } from '../config/app.config';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => {
        const cfg = loadConfig();
        return {
          type: 'postgres',
          url: cfg.DATABASE_URL,
          entities: [__dirname + '/../modules/**/*.entity.{ts,js}'],
          migrations: [__dirname + '/migrations/*.{ts,js}'],
          migrationsRun: true,
          synchronize: false,
          logging: cfg.LOG_LEVEL === 'debug',
        };
      },
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
```

- [ ] **Step 5: Wire DatabaseModule into AppModule**

Edit `apps/api/src/app.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './db/database.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 6: Add migration scripts to `apps/api/package.json` scripts section**

```json
"migration:generate": "typeorm-ts-node-commonjs migration:generate -d src/db/data-source.ts",
"migration:run": "typeorm-ts-node-commonjs migration:run -d src/db/data-source.ts",
"migration:revert": "typeorm-ts-node-commonjs migration:revert -d src/db/data-source.ts",
"migration:create": "typeorm-ts-node-commonjs migration:create"
```

- [ ] **Step 7: Generate the pgcrypto enable migration by hand**

Create `apps/api/src/db/migrations/1700000000000-EnablePgcrypto.ts`:

```ts
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class EnablePgcrypto1700000000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  }
  async down(qr: QueryRunner): Promise<void> {
    await qr.query('DROP EXTENSION IF EXISTS pgcrypto');
  }
}
```

- [ ] **Step 8: Run migration**

```bash
cd apps/api
pnpm migration:run
```
Expected: `EnablePgcrypto1700000000000` ran successfully.

- [ ] **Step 9: Verify pgcrypto is available**

```bash
docker compose -f ../../docker/docker-compose.yml exec postgres \
  psql -U altegio -d altegio_ai -c "SELECT pgp_sym_encrypt('hi', 'key');"
```
Expected: returns an encrypted bytea value.

- [ ] **Step 10: Commit**

```bash
git add .
git commit -m "feat(api): add typeorm, config module, pgcrypto migration"
```

---

### Task 6: Tenants table + entity

**Files:**
- Create: `apps/api/src/db/migrations/1700000001000-CreateTenants.ts`, `apps/api/src/modules/tenants/tenant.entity.ts`

- [ ] **Step 1: Create migration `1700000001000-CreateTenants.ts`**

```ts
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTenants1700000001000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE tenants (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        salon_name text NOT NULL,
        location_id bigint NOT NULL,
        chain_id bigint,
        altegio_token_encrypted bytea NOT NULL,
        timezone text NOT NULL DEFAULT 'Asia/Almaty',
        telegram_chat_id bigint,
        report_enabled boolean NOT NULL DEFAULT false,
        report_time time NOT NULL DEFAULT '09:00',
        working_hours_per_day integer NOT NULL DEFAULT 10,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (location_id)
      )
    `);
    await qr.query('CREATE INDEX idx_tenants_report_enabled ON tenants (report_enabled) WHERE report_enabled = true');
  }
  async down(qr: QueryRunner): Promise<void> {
    await qr.query('DROP TABLE tenants');
  }
}
```

- [ ] **Step 2: Create `apps/api/src/modules/tenants/tenant.entity.ts`**

```ts
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('tenants')
export class TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text', name: 'salon_name' })
  salonName!: string;

  @Column({ type: 'bigint', name: 'location_id' })
  locationId!: number;

  @Column({ type: 'bigint', name: 'chain_id', nullable: true })
  chainId!: number | null;

  @Column({ type: 'bytea', name: 'altegio_token_encrypted' })
  altegioTokenEncrypted!: Buffer;

  @Column({ type: 'text' })
  timezone!: string;

  @Column({ type: 'bigint', name: 'telegram_chat_id', nullable: true })
  telegramChatId!: number | null;

  @Column({ type: 'boolean', name: 'report_enabled', default: false })
  reportEnabled!: boolean;

  @Column({ type: 'time', name: 'report_time', default: '09:00' })
  reportTime!: string;

  @Column({ type: 'int', name: 'working_hours_per_day', default: 10 })
  workingHoursPerDay!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
```

- [ ] **Step 3: Run migration**

```bash
cd apps/api
pnpm migration:run
```
Expected: `CreateTenants1700000001000` executed.

- [ ] **Step 4: Verify table**

```bash
docker compose -f ../../docker/docker-compose.yml exec postgres \
  psql -U altegio -d altegio_ai -c "\d tenants"
```
Expected: table schema matches with all columns.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(db): add tenants table and entity"
```

---

### Task 7: Raw-layer tables migration

**Files:**
- Create: `apps/api/src/db/migrations/1700000002000-CreateRawLayer.ts`, entities `apps/api/src/modules/sync/entities/altegio-raw-*.entity.ts`

- [ ] **Step 1: Create migration**

```ts
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRawLayer1700000002000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE altegio_raw_records (
        id bigserial PRIMARY KEY,
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        altegio_record_id bigint NOT NULL,
        payload jsonb NOT NULL,
        fetched_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, altegio_record_id)
      )
    `);
    await qr.query('CREATE INDEX idx_raw_records_tenant_fetched ON altegio_raw_records (tenant_id, fetched_at DESC)');

    await qr.query(`
      CREATE TABLE altegio_raw_clients (
        id bigserial PRIMARY KEY,
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        altegio_client_id bigint NOT NULL,
        payload jsonb NOT NULL,
        fetched_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, altegio_client_id)
      )
    `);

    await qr.query(`
      CREATE TABLE altegio_raw_staff (
        id bigserial PRIMARY KEY,
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        altegio_staff_id bigint NOT NULL,
        payload jsonb NOT NULL,
        fetched_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, altegio_staff_id)
      )
    `);

    await qr.query(`
      CREATE TABLE altegio_raw_services (
        id bigserial PRIMARY KEY,
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        altegio_service_id bigint NOT NULL,
        payload jsonb NOT NULL,
        fetched_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, altegio_service_id)
      )
    `);
  }
  async down(qr: QueryRunner): Promise<void> {
    await qr.query('DROP TABLE altegio_raw_services');
    await qr.query('DROP TABLE altegio_raw_staff');
    await qr.query('DROP TABLE altegio_raw_clients');
    await qr.query('DROP TABLE altegio_raw_records');
  }
}
```

- [ ] **Step 2: Create `apps/api/src/modules/sync/entities/altegio-raw-record.entity.ts`**

```ts
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity('altegio_raw_records')
@Index(['tenantId', 'altegioRecordId'], { unique: true })
export class AltegioRawRecordEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column('uuid', { name: 'tenant_id' })
  tenantId!: string;

  @Column('bigint', { name: 'altegio_record_id' })
  altegioRecordId!: number;

  @Column('jsonb')
  payload!: unknown;

  @CreateDateColumn({ name: 'fetched_at' })
  fetchedAt!: Date;
}
```

- [ ] **Step 3: Create analogous entities**

`altegio-raw-client.entity.ts`:

```ts
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity('altegio_raw_clients')
@Index(['tenantId', 'altegioClientId'], { unique: true })
export class AltegioRawClientEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column('uuid', { name: 'tenant_id' })
  tenantId!: string;

  @Column('bigint', { name: 'altegio_client_id' })
  altegioClientId!: number;

  @Column('jsonb')
  payload!: unknown;

  @CreateDateColumn({ name: 'fetched_at' })
  fetchedAt!: Date;
}
```

`altegio-raw-staff.entity.ts`:

```ts
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity('altegio_raw_staff')
@Index(['tenantId', 'altegioStaffId'], { unique: true })
export class AltegioRawStaffEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column('uuid', { name: 'tenant_id' })
  tenantId!: string;

  @Column('bigint', { name: 'altegio_staff_id' })
  altegioStaffId!: number;

  @Column('jsonb')
  payload!: unknown;

  @CreateDateColumn({ name: 'fetched_at' })
  fetchedAt!: Date;
}
```

`altegio-raw-service.entity.ts`:

```ts
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity('altegio_raw_services')
@Index(['tenantId', 'altegioServiceId'], { unique: true })
export class AltegioRawServiceEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column('uuid', { name: 'tenant_id' })
  tenantId!: string;

  @Column('bigint', { name: 'altegio_service_id' })
  altegioServiceId!: number;

  @Column('jsonb')
  payload!: unknown;

  @CreateDateColumn({ name: 'fetched_at' })
  fetchedAt!: Date;
}
```

- [ ] **Step 4: Run migration and commit**

```bash
cd apps/api && pnpm migration:run
git add . && git commit -m "feat(db): add raw-layer tables (records, clients, staff, services)"
```

---

### Task 8: Facts-layer tables

**Files:**
- Create: `apps/api/src/db/migrations/1700000003000-CreateFactsLayer.ts`, entities in `apps/api/src/modules/sync/entities/`

- [ ] **Step 1: Create migration**

```ts
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFactsLayer1700000003000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE staff (
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        altegio_staff_id bigint NOT NULL,
        name text NOT NULL,
        specialization text,
        position_title text,
        fired boolean NOT NULL DEFAULT false,
        bookable boolean NOT NULL DEFAULT true,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (tenant_id, altegio_staff_id)
      )
    `);

    await qr.query(`
      CREATE TABLE services (
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        altegio_service_id bigint NOT NULL,
        title text NOT NULL,
        category_id bigint,
        price_min numeric(12,2),
        price_max numeric(12,2),
        active boolean NOT NULL DEFAULT true,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (tenant_id, altegio_service_id)
      )
    `);

    await qr.query(`
      CREATE TABLE clients (
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        altegio_client_id bigint NOT NULL,
        name text,
        phone text,
        visits_count int,
        last_visit_date date,
        spent numeric(14,2),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (tenant_id, altegio_client_id)
      )
    `);

    await qr.query(`
      CREATE TABLE records (
        id bigserial PRIMARY KEY,
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        altegio_record_id bigint NOT NULL,
        altegio_staff_id bigint,
        altegio_client_id bigint,
        datetime timestamptz NOT NULL,
        seance_length int,
        cost numeric(12,2) NOT NULL DEFAULT 0,
        attendance smallint NOT NULL DEFAULT 0,
        paid_full smallint NOT NULL DEFAULT 0,
        is_online boolean NOT NULL DEFAULT false,
        deleted boolean NOT NULL DEFAULT false,
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, altegio_record_id)
      )
    `);
    await qr.query('CREATE INDEX idx_records_tenant_datetime ON records (tenant_id, datetime)');
    await qr.query('CREATE INDEX idx_records_tenant_staff_datetime ON records (tenant_id, altegio_staff_id, datetime)');
    await qr.query('CREATE INDEX idx_records_tenant_date ON records (tenant_id, (datetime::date))');
  }
  async down(qr: QueryRunner): Promise<void> {
    await qr.query('DROP TABLE records');
    await qr.query('DROP TABLE clients');
    await qr.query('DROP TABLE services');
    await qr.query('DROP TABLE staff');
  }
}
```

- [ ] **Step 2: Create `staff.entity.ts`**

```ts
import { Column, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('staff')
export class StaffEntity {
  @PrimaryColumn('uuid', { name: 'tenant_id' })
  tenantId!: string;

  @PrimaryColumn('bigint', { name: 'altegio_staff_id' })
  altegioStaffId!: number;

  @Column('text')
  name!: string;

  @Column('text', { nullable: true })
  specialization!: string | null;

  @Column('text', { name: 'position_title', nullable: true })
  positionTitle!: string | null;

  @Column('boolean', { default: false })
  fired!: boolean;

  @Column('boolean', { default: true })
  bookable!: boolean;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
```

- [ ] **Step 3: Create `service.entity.ts`**

```ts
import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('services')
export class ServiceEntity {
  @PrimaryColumn('uuid', { name: 'tenant_id' })
  tenantId!: string;

  @PrimaryColumn('bigint', { name: 'altegio_service_id' })
  altegioServiceId!: number;

  @Column('text')
  title!: string;

  @Column('bigint', { name: 'category_id', nullable: true })
  categoryId!: number | null;

  @Column('numeric', { name: 'price_min', precision: 12, scale: 2, nullable: true })
  priceMin!: string | null;

  @Column('numeric', { name: 'price_max', precision: 12, scale: 2, nullable: true })
  priceMax!: string | null;

  @Column('boolean', { default: true })
  active!: boolean;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
```

- [ ] **Step 4: Create `client.entity.ts`**

```ts
import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('clients')
export class ClientEntity {
  @PrimaryColumn('uuid', { name: 'tenant_id' })
  tenantId!: string;

  @PrimaryColumn('bigint', { name: 'altegio_client_id' })
  altegioClientId!: number;

  @Column('text', { nullable: true })
  name!: string | null;

  @Column('text', { nullable: true })
  phone!: string | null;

  @Column('int', { name: 'visits_count', nullable: true })
  visitsCount!: number | null;

  @Column('date', { name: 'last_visit_date', nullable: true })
  lastVisitDate!: string | null;

  @Column('numeric', { precision: 14, scale: 2, nullable: true })
  spent!: string | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
```

- [ ] **Step 5: Create `record.entity.ts`**

```ts
import { Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('records')
@Index(['tenantId', 'altegioRecordId'], { unique: true })
@Index(['tenantId', 'datetime'])
export class RecordEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string;

  @Column('uuid', { name: 'tenant_id' })
  tenantId!: string;

  @Column('bigint', { name: 'altegio_record_id' })
  altegioRecordId!: number;

  @Column('bigint', { name: 'altegio_staff_id', nullable: true })
  altegioStaffId!: number | null;

  @Column('bigint', { name: 'altegio_client_id', nullable: true })
  altegioClientId!: number | null;

  @Column('timestamptz')
  datetime!: Date;

  @Column('int', { name: 'seance_length', nullable: true })
  seanceLength!: number | null;

  @Column('numeric', { precision: 12, scale: 2, default: 0 })
  cost!: string;

  @Column('smallint', { default: 0 })
  attendance!: number;

  @Column('smallint', { name: 'paid_full', default: 0 })
  paidFull!: number;

  @Column('boolean', { name: 'is_online', default: false })
  isOnline!: boolean;

  @Column('boolean', { default: false })
  deleted!: boolean;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
```

- [ ] **Step 6: Run migration and commit**

```bash
cd apps/api && pnpm migration:run
git add . && git commit -m "feat(db): add facts-layer tables and entities"
```

---

### Task 9: Aggregates-layer tables

**Files:**
- Create: `apps/api/src/db/migrations/1700000004000-CreateAggregatesLayer.ts`, `apps/api/src/modules/metrics/entities/daily-metrics.entity.ts`, `staff-daily.entity.ts`

- [ ] **Step 1: Create migration**

```ts
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAggregatesLayer1700000004000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE daily_metrics (
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        date date NOT NULL,
        revenue_total numeric(14,2) NOT NULL DEFAULT 0,
        visits_completed int NOT NULL DEFAULT 0,
        visits_cancelled int NOT NULL DEFAULT 0,
        avg_check numeric(12,2) NOT NULL DEFAULT 0,
        occupancy_pct numeric(5,2) NOT NULL DEFAULT 0,
        computed_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (tenant_id, date)
      )
    `);
    await qr.query(`
      CREATE TABLE staff_daily (
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        altegio_staff_id bigint NOT NULL,
        date date NOT NULL,
        revenue numeric(14,2) NOT NULL DEFAULT 0,
        visits int NOT NULL DEFAULT 0,
        cancelled int NOT NULL DEFAULT 0,
        avg_check numeric(12,2) NOT NULL DEFAULT 0,
        computed_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (tenant_id, altegio_staff_id, date)
      )
    `);
  }
  async down(qr: QueryRunner): Promise<void> {
    await qr.query('DROP TABLE staff_daily');
    await qr.query('DROP TABLE daily_metrics');
  }
}
```

- [ ] **Step 2: Create `daily-metrics.entity.ts`**

```ts
import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('daily_metrics')
export class DailyMetricsEntity {
  @PrimaryColumn('uuid', { name: 'tenant_id' })
  tenantId!: string;

  @PrimaryColumn('date')
  date!: string;

  @Column('numeric', { name: 'revenue_total', precision: 14, scale: 2, default: 0 })
  revenueTotal!: string;

  @Column('int', { name: 'visits_completed', default: 0 })
  visitsCompleted!: number;

  @Column('int', { name: 'visits_cancelled', default: 0 })
  visitsCancelled!: number;

  @Column('numeric', { name: 'avg_check', precision: 12, scale: 2, default: 0 })
  avgCheck!: string;

  @Column('numeric', { name: 'occupancy_pct', precision: 5, scale: 2, default: 0 })
  occupancyPct!: string;

  @Column('timestamptz', { name: 'computed_at' })
  computedAt!: Date;
}
```

- [ ] **Step 3: Create `staff-daily.entity.ts`**

```ts
import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('staff_daily')
export class StaffDailyEntity {
  @PrimaryColumn('uuid', { name: 'tenant_id' })
  tenantId!: string;

  @PrimaryColumn('bigint', { name: 'altegio_staff_id' })
  altegioStaffId!: number;

  @PrimaryColumn('date')
  date!: string;

  @Column('numeric', { precision: 14, scale: 2, default: 0 })
  revenue!: string;

  @Column('int', { default: 0 })
  visits!: number;

  @Column('int', { default: 0 })
  cancelled!: number;

  @Column('numeric', { name: 'avg_check', precision: 12, scale: 2, default: 0 })
  avgCheck!: string;

  @Column('timestamptz', { name: 'computed_at' })
  computedAt!: Date;
}
```

- [ ] **Step 4: Run migration and commit**

```bash
cd apps/api && pnpm migration:run
git add . && git commit -m "feat(db): add aggregates-layer tables"
```

---

### Task 10: Infrastructure audit tables

**Files:**
- Create: `apps/api/src/db/migrations/1700000005000-CreateInfraTables.ts`, entities in `apps/api/src/modules/sync/entities/sync-job.entity.ts`, `apps/api/src/modules/reports/entities/report-delivery.entity.ts`, `apps/api/src/modules/reports/entities/ai-insight-log.entity.ts`

- [ ] **Step 1: Create migration**

```ts
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInfraTables1700000005000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE sync_jobs (
        id bigserial PRIMARY KEY,
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        status text NOT NULL,
        started_at timestamptz NOT NULL DEFAULT now(),
        finished_at timestamptz,
        records_fetched int NOT NULL DEFAULT 0,
        error text
      )
    `);
    await qr.query('CREATE INDEX idx_sync_jobs_tenant_started ON sync_jobs (tenant_id, started_at DESC)');

    await qr.query(`
      CREATE TABLE report_deliveries (
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        date date NOT NULL,
        message_id bigint,
        sent_at timestamptz,
        status text NOT NULL,
        error text,
        PRIMARY KEY (tenant_id, date)
      )
    `);

    await qr.query(`
      CREATE TABLE ai_insight_logs (
        id bigserial PRIMARY KEY,
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        date date NOT NULL,
        prompt_hash text NOT NULL,
        response text,
        ms integer,
        status text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
  }
  async down(qr: QueryRunner): Promise<void> {
    await qr.query('DROP TABLE ai_insight_logs');
    await qr.query('DROP TABLE report_deliveries');
    await qr.query('DROP TABLE sync_jobs');
  }
}
```

- [ ] **Step 2: Create entities**

`apps/api/src/modules/sync/entities/sync-job.entity.ts`:

```ts
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type SyncJobStatus = 'running' | 'success' | 'failed';

@Entity('sync_jobs')
export class SyncJobEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string;

  @Column('uuid', { name: 'tenant_id' })
  tenantId!: string;

  @Column('text')
  status!: SyncJobStatus;

  @CreateDateColumn({ name: 'started_at' })
  startedAt!: Date;

  @Column('timestamptz', { name: 'finished_at', nullable: true })
  finishedAt!: Date | null;

  @Column('int', { name: 'records_fetched', default: 0 })
  recordsFetched!: number;

  @Column('text', { nullable: true })
  error!: string | null;
}
```

`apps/api/src/modules/reports/entities/report-delivery.entity.ts`:

```ts
import { Column, Entity, PrimaryColumn } from 'typeorm';

export type ReportDeliveryStatus = 'pending' | 'sent' | 'failed';

@Entity('report_deliveries')
export class ReportDeliveryEntity {
  @PrimaryColumn('uuid', { name: 'tenant_id' })
  tenantId!: string;

  @PrimaryColumn('date')
  date!: string;

  @Column('bigint', { name: 'message_id', nullable: true })
  messageId!: number | null;

  @Column('timestamptz', { name: 'sent_at', nullable: true })
  sentAt!: Date | null;

  @Column('text')
  status!: ReportDeliveryStatus;

  @Column('text', { nullable: true })
  error!: string | null;
}
```

`apps/api/src/modules/reports/entities/ai-insight-log.entity.ts`:

```ts
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type AiInsightStatus = 'ok' | 'timeout' | 'validation_failed' | 'api_error' | 'disabled';

@Entity('ai_insight_logs')
export class AiInsightLogEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string;

  @Column('uuid', { name: 'tenant_id' })
  tenantId!: string;

  @Column('date')
  date!: string;

  @Column('text', { name: 'prompt_hash' })
  promptHash!: string;

  @Column('text', { nullable: true })
  response!: string | null;

  @Column('int', { nullable: true })
  ms!: number | null;

  @Column('text')
  status!: AiInsightStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
```

- [ ] **Step 3: Run migration and commit**

```bash
cd apps/api && pnpm migration:run
git add . && git commit -m "feat(db): add infrastructure audit tables"
```

---

### Task 11: TokenCipher service

**Files:**
- Create: `apps/api/src/modules/tenants/token-cipher.service.ts`
- Test: `apps/api/src/modules/tenants/token-cipher.spec.ts`

- [ ] **Step 1: Write the failing test `token-cipher.spec.ts`**

```ts
import { TokenCipher } from './token-cipher.service';

describe('TokenCipher', () => {
  const key = 'a'.repeat(64); // 32 bytes hex
  const cipher = new TokenCipher(key);

  it('round-trips a token', () => {
    const plain = '3nhhg28zsrc6wx84e8xk';
    const encrypted = cipher.encrypt(plain);
    expect(encrypted).toBeInstanceOf(Buffer);
    expect(encrypted.length).toBeGreaterThan(plain.length);
    expect(cipher.decrypt(encrypted)).toBe(plain);
  });

  it('produces different ciphertext per call (nonce)', () => {
    const a = cipher.encrypt('same');
    const b = cipher.encrypt('same');
    expect(a.equals(b)).toBe(false);
  });

  it('rejects key that is not 32-byte hex', () => {
    expect(() => new TokenCipher('short')).toThrow(/32 bytes/);
  });

  it('fails to decrypt with a wrong key', () => {
    const other = new TokenCipher('b'.repeat(64));
    const payload = cipher.encrypt('secret');
    expect(() => other.decrypt(payload)).toThrow();
  });
});
```

- [ ] **Step 2: Run test — verify FAIL**

```bash
cd apps/api && pnpm test src/modules/tenants/token-cipher.spec.ts
```
Expected: FAIL — "Cannot find module './token-cipher.service'".

- [ ] **Step 3: Implement `token-cipher.service.ts`**

```ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const AUTH_TAG_LEN = 16;

export class TokenCipher {
  private readonly key: Buffer;

  constructor(hexKey: string) {
    if (!/^[0-9a-f]{64}$/.test(hexKey)) {
      throw new Error('APP_ENCRYPTION_KEY must be 32 bytes hex (64 chars)');
    }
    this.key = Buffer.from(hexKey, 'hex');
  }

  encrypt(plain: string): Buffer {
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv(ALGO, this.key, iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]);
  }

  decrypt(payload: Buffer): string {
    const iv = payload.subarray(0, IV_LEN);
    const tag = payload.subarray(IV_LEN, IV_LEN + AUTH_TAG_LEN);
    const enc = payload.subarray(IV_LEN + AUTH_TAG_LEN);
    const decipher = createDecipheriv(ALGO, this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  }
}
```

Note: switched from pgcrypto (mentioned in spec) to AES-256-GCM at the application layer. Reason: simpler, no round-trip through Postgres for encryption, and identical security guarantee. Data at rest in `tenants.altegio_token_encrypted` is still opaque to DB dumps.

- [ ] **Step 4: Run test — verify PASS**

```bash
pnpm test src/modules/tenants/token-cipher.spec.ts
```
Expected: 4/4 pass.

- [ ] **Step 5: Commit**

```bash
git add . && git commit -m "feat(tenants): add AES-256-GCM TokenCipher with tests"
```

---

## Milestone 3 — Tenants service + shared types (Tasks 12-14)

### Task 12: `@altegio/shared` package

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/index.ts`, `packages/shared/src/types/daily-report.ts`

- [ ] **Step 1: Create `packages/shared/package.json`**

```json
{
  "name": "@altegio/shared",
  "version": "0.1.0",
  "private": true,
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create `packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "composite": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `packages/shared/src/types/daily-report.ts`**

```ts
export interface DailyReportData {
  tenant: {
    id: string;
    salonName: string;
    timezone: string;
  };
  date: string; // YYYY-MM-DD (yesterday)

  yesterday: {
    revenue: number;
    visitsCompleted: number;
    visitsCancelled: number;
    avgCheck: number;
    cancelRate: number;       // 0..1
    cancellationLoss: number; // sum of cancelled records' cost
  };

  baseline7d: {
    avgRevenue: number;
    avgVisits: number;
    avgCancelRate: number;
  };

  topStaff: Array<{
    staffId: number;
    name: string;
    revenue: number;
    visits: number;
  }>;

  strugglingStaff: Array<{
    staffId: number;
    name: string;
    consecutiveDaysBelowAvg: number;
  }>;

  today: {
    bookedCount: number;
    occupancyPct: number;
    emptySlots: string[]; // ["14:00", "18:00", "19:00"]
  };

  cancelClusters: Array<{
    staffName: string;
    hour: number; // 0..23
    count: number;
  }>;
}
```

- [ ] **Step 4: Create `packages/shared/src/index.ts`**

```ts
export * from './types/daily-report';
```

- [ ] **Step 5: Build and commit**

```bash
pnpm -F @altegio/shared build
git add . && git commit -m "feat(shared): add DailyReportData type"
```

---

### Task 13: TenantsService

**Files:**
- Create: `apps/api/src/modules/tenants/tenants.service.ts`, `apps/api/src/modules/tenants/tenants.module.ts`
- Test: `apps/api/src/modules/tenants/tenants.service.spec.ts`

- [ ] **Step 1: Write `tenants.service.spec.ts`**

```ts
import { TenantsService, CreateTenantInput } from './tenants.service';
import { TokenCipher } from './token-cipher.service';
import type { Repository } from 'typeorm';
import type { TenantEntity } from './tenant.entity';

function repoMock() {
  const store = new Map<string, TenantEntity>();
  return {
    save: jest.fn(async (t: TenantEntity) => {
      t.id = t.id ?? 'uuid-' + store.size;
      store.set(t.id, t);
      return t;
    }),
    findOne: jest.fn(async ({ where }: any) =>
      [...store.values()].find((t) =>
        Object.entries(where).every(([k, v]) => (t as any)[k] === v),
      ) ?? null,
    ),
    find: jest.fn(async ({ where }: any) =>
      [...store.values()].filter((t) =>
        Object.entries(where).every(([k, v]) => (t as any)[k] === v),
      ),
    ),
    update: jest.fn(async (where: any, patch: any) => {
      for (const t of store.values()) {
        if (Object.entries(where).every(([k, v]) => (t as any)[k] === v)) {
          Object.assign(t, patch);
        }
      }
      return { affected: 1 };
    }),
    _store: store,
  } as unknown as Repository<TenantEntity> & { _store: Map<string, TenantEntity> };
}

describe('TenantsService', () => {
  const cipher = new TokenCipher('a'.repeat(64));

  function make() {
    const repo = repoMock();
    return { repo, svc: new TenantsService(repo, cipher) };
  }

  it('creates a tenant and encrypts the token at rest', async () => {
    const { repo, svc } = make();
    const input: CreateTenantInput = {
      salonName: 'Test',
      locationId: 198823,
      altegioToken: 'plaintext',
      timezone: 'Asia/Almaty',
    };
    const t = await svc.create(input);
    expect(t.salonName).toBe('Test');
    const stored = [...(repo as any)._store.values()][0] as TenantEntity;
    expect(stored.altegioTokenEncrypted).toBeInstanceOf(Buffer);
    expect(stored.altegioTokenEncrypted.toString()).not.toContain('plaintext');
  });

  it('returns decrypted token via getAltegioToken', async () => {
    const { svc } = make();
    const t = await svc.create({
      salonName: 'T', locationId: 1, altegioToken: 'secret', timezone: 'Asia/Almaty',
    });
    expect(await svc.getAltegioToken(t.id)).toBe('secret');
  });

  it('findEnabled returns only tenants with report_enabled=true', async () => {
    const { svc } = make();
    const a = await svc.create({ salonName: 'A', locationId: 1, altegioToken: 't', timezone: 'Asia/Almaty' });
    const b = await svc.create({ salonName: 'B', locationId: 2, altegioToken: 't', timezone: 'Asia/Almaty' });
    await svc.setReportEnabled(b.id, true);
    const enabled = await svc.findEnabled();
    expect(enabled.map((t) => t.id)).toEqual([b.id]);
    void a;
  });
});
```

- [ ] **Step 2: Run test — verify FAIL**

```bash
cd apps/api && pnpm test src/modules/tenants/tenants.service.spec.ts
```
Expected: FAIL — cannot find tenants.service.

- [ ] **Step 3: Implement `tenants.service.ts`**

```ts
import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantEntity } from './tenant.entity';
import { TokenCipher } from './token-cipher.service';

export interface CreateTenantInput {
  salonName: string;
  locationId: number;
  chainId?: number;
  altegioToken: string;
  timezone: string;
  telegramChatId?: number;
  reportTime?: string;
  workingHoursPerDay?: number;
}

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(TenantEntity) private readonly repo: Repository<TenantEntity>,
    @Inject(TokenCipher) private readonly cipher: TokenCipher,
  ) {}

  async create(input: CreateTenantInput): Promise<TenantEntity> {
    const entity = this.repo.create({
      salonName: input.salonName,
      locationId: input.locationId,
      chainId: input.chainId ?? null,
      altegioTokenEncrypted: this.cipher.encrypt(input.altegioToken),
      timezone: input.timezone,
      telegramChatId: input.telegramChatId ?? null,
      reportEnabled: false,
      reportTime: input.reportTime ?? '09:00',
      workingHoursPerDay: input.workingHoursPerDay ?? 10,
    });
    return this.repo.save(entity);
  }

  async findById(id: string): Promise<TenantEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByLocation(locationId: number): Promise<TenantEntity | null> {
    return this.repo.findOne({ where: { locationId } });
  }

  async findEnabled(): Promise<TenantEntity[]> {
    return this.repo.find({ where: { reportEnabled: true } });
  }

  async getAltegioToken(tenantId: string): Promise<string> {
    const t = await this.findById(tenantId);
    if (!t) throw new Error(`Tenant ${tenantId} not found`);
    return this.cipher.decrypt(t.altegioTokenEncrypted);
  }

  async setTelegramChat(tenantId: string, chatId: number): Promise<void> {
    await this.repo.update({ id: tenantId }, { telegramChatId: chatId });
  }

  async setReportEnabled(tenantId: string, enabled: boolean): Promise<void> {
    await this.repo.update({ id: tenantId }, { reportEnabled: enabled });
  }
}
```

- [ ] **Step 4: Create `tenants.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantEntity } from './tenant.entity';
import { TenantsService } from './tenants.service';
import { TokenCipher } from './token-cipher.service';
import { loadConfig } from '../../config/app.config';

@Module({
  imports: [TypeOrmModule.forFeature([TenantEntity])],
  providers: [
    {
      provide: TokenCipher,
      useFactory: () => new TokenCipher(loadConfig().APP_ENCRYPTION_KEY),
    },
    TenantsService,
  ],
  exports: [TenantsService, TokenCipher],
})
export class TenantsModule {}
```

- [ ] **Step 5: Run test — verify PASS**

```bash
pnpm test src/modules/tenants/tenants.service.spec.ts
```
Expected: 3/3 pass.

- [ ] **Step 6: Commit**

```bash
git add . && git commit -m "feat(tenants): add TenantsService with encryption"
```

---

### Task 14: Integration test — Tenants through real Postgres

**Files:**
- Create: `apps/api/test/tenants.int.spec.ts`, `apps/api/test/helpers/test-db.ts`, `apps/api/jest-int.config.js`

- [ ] **Step 1: Install testcontainers**

```bash
pnpm add -F @altegio/api --save-dev testcontainers @testcontainers/postgresql
```

- [ ] **Step 2: Create `apps/api/jest-int.config.js`**

```js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: './test',
  testRegex: '.*\\.int\\.spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  testTimeout: 60000,
};
```

- [ ] **Step 3: Add script to `apps/api/package.json` scripts**

```json
"test:int": "jest --config jest-int.config.js --runInBand"
```

- [ ] **Step 4: Create `apps/api/test/helpers/test-db.ts`**

```ts
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import { randomBytes } from 'node:crypto';

export interface TestDb {
  container: StartedPostgreSqlContainer;
  ds: DataSource;
  stop: () => Promise<void>;
}

export async function startTestDb(): Promise<TestDb> {
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('altegio_test')
    .withUsername('test')
    .withPassword('test')
    .start();

  process.env.DATABASE_URL = container.getConnectionUri();
  process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  process.env.ALTEGIO_PARTNER_TOKEN = 'test_token';
  process.env.REDIS_URL = 'redis://localhost:6379';

  const ds = new DataSource({
    type: 'postgres',
    url: container.getConnectionUri(),
    entities: [__dirname + '/../../src/modules/**/*.entity.{ts,js}'],
    migrations: [__dirname + '/../../src/db/migrations/*.{ts,js}'],
    migrationsRun: true,
  });
  await ds.initialize();
  return {
    container,
    ds,
    stop: async () => {
      await ds.destroy();
      await container.stop();
    },
  };
}
```

- [ ] **Step 5: Create `apps/api/test/tenants.int.spec.ts`**

```ts
import { startTestDb, TestDb } from './helpers/test-db';
import { TenantEntity } from '../src/modules/tenants/tenant.entity';
import { TenantsService } from '../src/modules/tenants/tenants.service';
import { TokenCipher } from '../src/modules/tenants/token-cipher.service';

describe('Tenants integration', () => {
  let db: TestDb;
  let svc: TenantsService;

  beforeAll(async () => {
    db = await startTestDb();
    svc = new TenantsService(
      db.ds.getRepository(TenantEntity),
      new TokenCipher(process.env.APP_ENCRYPTION_KEY!),
    );
  });

  afterAll(async () => {
    await db.stop();
  });

  it('persists and retrieves a tenant with encrypted token', async () => {
    const t = await svc.create({
      salonName: 'Real',
      locationId: 198823,
      altegioToken: 'abc123',
      timezone: 'Asia/Almaty',
    });
    const found = await svc.findByLocation(198823);
    expect(found?.id).toBe(t.id);
    expect(await svc.getAltegioToken(t.id)).toBe('abc123');
  });

  it('enforces UNIQUE(location_id)', async () => {
    await svc.create({ salonName: 'A', locationId: 111, altegioToken: 't', timezone: 'Asia/Almaty' });
    await expect(
      svc.create({ salonName: 'B', locationId: 111, altegioToken: 't', timezone: 'Asia/Almaty' }),
    ).rejects.toThrow(/duplicate key/);
  });
});
```

- [ ] **Step 6: Run int test — verify PASS**

```bash
pnpm test:int
```
Expected: 2/2 pass. Container takes ~20s to start.

- [ ] **Step 7: Commit**

```bash
git add . && git commit -m "test(tenants): add integration test with testcontainers"
```

---

## Milestone 4 — Altegio HTTP client (Tasks 15-17)

### Task 15: AltegioClient base — auth, rate limit, retries

**Files:**
- Create: `apps/api/src/modules/altegio/altegio.client.ts`, `apps/api/src/modules/altegio/altegio.module.ts`, `apps/api/src/modules/altegio/types.ts`
- Test: `apps/api/src/modules/altegio/altegio.client.spec.ts`

- [ ] **Step 1: Install deps**

```bash
pnpm add -F @altegio/api axios axios-retry bottleneck
```

- [ ] **Step 2: Create `apps/api/src/modules/altegio/types.ts`**

```ts
export interface AltegioAuthContext {
  partnerToken: string;
  userToken?: string; // not used in Phase 1; partner token suffices for read endpoints
  locationId: number;
}

export interface AltegioPaginatedResponse<T> {
  success: boolean;
  data: T[];
  meta?: {
    total_count?: number;
  };
}
```

- [ ] **Step 3: Write failing test `altegio.client.spec.ts`**

```ts
import nock from 'nock';
import { AltegioClient } from './altegio.client';

describe('AltegioClient', () => {
  const base = 'https://api.alteg.io/api/v1';
  const auth = { partnerToken: 'partner_xyz', locationId: 198823 };

  afterEach(() => nock.cleanAll());

  it('sends Authorization header with Bearer partner token', async () => {
    const scope = nock(base, {
      reqheaders: {
        authorization: 'Bearer partner_xyz',
        accept: 'application/vnd.api.v2+json',
      },
    })
      .get('/records/198823')
      .query(true)
      .reply(200, { success: true, data: [] });

    const c = new AltegioClient({ baseUrl: base, requestsPerSecond: 10 });
    const res = await c.get<unknown[]>(auth, '/records/198823', { page: 1 });
    expect(res.success).toBe(true);
    expect(res.data).toEqual([]);
    scope.done();
  });

  it('retries 500 errors up to 3 times', async () => {
    const scope = nock(base)
      .get('/records/198823').query(true).reply(500)
      .get('/records/198823').query(true).reply(500)
      .get('/records/198823').query(true).reply(200, { success: true, data: [{ id: 1 }] });

    const c = new AltegioClient({ baseUrl: base, requestsPerSecond: 100, retries: 3 });
    const res = await c.get<{ id: number }[]>(auth, '/records/198823');
    expect(res.data).toEqual([{ id: 1 }]);
    scope.done();
  });

  it('does NOT retry 400', async () => {
    nock(base).get('/records/198823').query(true).reply(400, { success: false });
    const c = new AltegioClient({ baseUrl: base, requestsPerSecond: 100 });
    await expect(c.get(auth, '/records/198823')).rejects.toThrow();
  });
});
```

- [ ] **Step 4: Install test dep**

```bash
pnpm add -F @altegio/api --save-dev nock
```

- [ ] **Step 5: Run — verify FAIL**

```bash
pnpm test src/modules/altegio/altegio.client.spec.ts
```
Expected: cannot find altegio.client.

- [ ] **Step 6: Implement `altegio.client.ts`**

```ts
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import axiosRetry from 'axios-retry';
import Bottleneck from 'bottleneck';
import type { AltegioAuthContext } from './types';

export interface AltegioClientOptions {
  baseUrl: string;
  requestsPerSecond?: number;
  retries?: number;
}

export class AltegioClient {
  private readonly http: AxiosInstance;
  private readonly limiter: Bottleneck;

  constructor(private readonly opts: AltegioClientOptions) {
    this.http = axios.create({
      baseURL: opts.baseUrl,
      timeout: 30_000,
      headers: { Accept: 'application/vnd.api.v2+json' },
    });
    axiosRetry(this.http, {
      retries: opts.retries ?? 3,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: (err) => {
        const status = err.response?.status;
        if (!status) return true; // network
        return status >= 500 || status === 429;
      },
    });
    this.limiter = new Bottleneck({
      reservoir: opts.requestsPerSecond ?? 3,
      reservoirRefreshAmount: opts.requestsPerSecond ?? 3,
      reservoirRefreshInterval: 1000,
      maxConcurrent: 5,
    });
  }

  async get<T>(
    auth: AltegioAuthContext,
    path: string,
    params: Record<string, unknown> = {},
  ): Promise<T> {
    const cfg: AxiosRequestConfig = {
      url: path,
      method: 'GET',
      params,
      headers: { Authorization: `Bearer ${auth.partnerToken}` },
    };
    const res = await this.limiter.schedule(() => this.http.request<T>(cfg));
    return res.data;
  }
}
```

- [ ] **Step 7: Create `altegio.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { AltegioClient } from './altegio.client';
import { loadConfig } from '../../config/app.config';
import { RecordsEndpoint } from './endpoints/records';
import { ClientsEndpoint } from './endpoints/clients';
import { StaffEndpoint } from './endpoints/staff';
import { ServicesEndpoint } from './endpoints/services';

@Module({
  providers: [
    {
      provide: AltegioClient,
      useFactory: () => new AltegioClient({
        baseUrl: loadConfig().ALTEGIO_BASE_URL,
        requestsPerSecond: 3,
        retries: 3,
      }),
    },
    RecordsEndpoint,
    ClientsEndpoint,
    StaffEndpoint,
    ServicesEndpoint,
  ],
  exports: [AltegioClient, RecordsEndpoint, ClientsEndpoint, StaffEndpoint, ServicesEndpoint],
})
export class AltegioModule {}
```

- [ ] **Step 8: Verify test passes and commit**

```bash
pnpm test src/modules/altegio/altegio.client.spec.ts
```
Expected: 3/3 pass.

```bash
git add . && git commit -m "feat(altegio): add HTTP client with rate limit + retries"
```

---

### Task 16: Records / Clients / Staff / Services endpoints

**Files:**
- Create: `apps/api/src/modules/altegio/endpoints/records.ts`, `clients.ts`, `staff.ts`, `services.ts`
- Create: `apps/api/src/modules/altegio/dto/*.ts`

- [ ] **Step 1: Create `apps/api/src/modules/altegio/dto/record.dto.ts`**

```ts
export interface AltegioRecordDto {
  id: number;
  date: string;          // 'YYYY-MM-DD HH:mm:ss'
  datetime: string;      // ISO
  staff_id: number;
  client?: { id: number; name?: string; phone?: string } | null;
  services: Array<{ id: number; title: string; cost: number; discount?: number }>;
  cost: number;
  attendance: number;    // -1 | 0 | 1 | 2
  paid_full: number;
  online: boolean;
  seance_length: number; // seconds
  deleted: boolean;
  visit_id?: number;
  create_date?: string;
}
```

- [ ] **Step 2: Create `apps/api/src/modules/altegio/dto/client.dto.ts`**

```ts
export interface AltegioClientDto {
  id: number;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  visits_count?: number;
  last_visit_date?: string | null;
  spent?: number;
  paid?: number;
  balance?: number;
}
```

- [ ] **Step 3: Create `apps/api/src/modules/altegio/dto/staff.dto.ts`**

```ts
export interface AltegioStaffDto {
  id: number;
  name: string;
  specialization?: string;
  position?: { id: number; title: string } | null;
  fired: number;
  hidden?: number;
  bookable?: boolean;
  status?: number;
}
```

- [ ] **Step 4: Create `apps/api/src/modules/altegio/dto/service.dto.ts`**

```ts
export interface AltegioServiceDto {
  id: number;
  title: string;
  category_id?: number;
  price_min?: number;
  price_max?: number;
  active?: number;
  duration?: number;
}
```

- [ ] **Step 5: Create `apps/api/src/modules/altegio/endpoints/records.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { AltegioClient } from '../altegio.client';
import type { AltegioAuthContext } from '../types';
import type { AltegioRecordDto } from '../dto/record.dto';

export interface FetchRecordsParams {
  start: string; // 'YYYY-MM-DD'
  end: string;   // 'YYYY-MM-DD'
  page?: number;
  count?: number;
}

@Injectable()
export class RecordsEndpoint {
  constructor(private readonly client: AltegioClient) {}

  async fetchPage(auth: AltegioAuthContext, params: FetchRecordsParams): Promise<AltegioRecordDto[]> {
    type Resp = { success: boolean; data: AltegioRecordDto[] };
    const res = await this.client.get<Resp>(auth, `/records/${auth.locationId}`, {
      start_date: params.start,
      end_date: params.end,
      page: params.page ?? 1,
      count: params.count ?? 200,
    });
    return res.data;
  }

  async *fetchAll(
    auth: AltegioAuthContext,
    params: Omit<FetchRecordsParams, 'page'>,
  ): AsyncGenerator<AltegioRecordDto[]> {
    let page = 1;
    while (true) {
      const batch = await this.fetchPage(auth, { ...params, page });
      if (batch.length === 0) return;
      yield batch;
      if (batch.length < (params.count ?? 200)) return;
      page++;
    }
  }
}
```

- [ ] **Step 6: Create `apps/api/src/modules/altegio/endpoints/clients.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { AltegioClient } from '../altegio.client';
import type { AltegioAuthContext } from '../types';
import type { AltegioClientDto } from '../dto/client.dto';

@Injectable()
export class ClientsEndpoint {
  constructor(private readonly client: AltegioClient) {}

  async fetchPage(auth: AltegioAuthContext, page = 1, count = 200): Promise<AltegioClientDto[]> {
    type Resp = { success: boolean; data: AltegioClientDto[] };
    const res = await this.client.get<Resp>(auth, `/company/${auth.locationId}/clients`, { page, count });
    return res.data ?? [];
  }

  async *fetchAll(auth: AltegioAuthContext): AsyncGenerator<AltegioClientDto[]> {
    let page = 1;
    while (true) {
      const batch = await this.fetchPage(auth, page);
      if (batch.length === 0) return;
      yield batch;
      if (batch.length < 200) return;
      page++;
    }
  }
}
```

- [ ] **Step 7: Create `apps/api/src/modules/altegio/endpoints/staff.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { AltegioClient } from '../altegio.client';
import type { AltegioAuthContext } from '../types';
import type { AltegioStaffDto } from '../dto/staff.dto';

@Injectable()
export class StaffEndpoint {
  constructor(private readonly client: AltegioClient) {}

  async fetchAll(auth: AltegioAuthContext): Promise<AltegioStaffDto[]> {
    type Resp = { success: boolean; data: AltegioStaffDto[] };
    const res = await this.client.get<Resp>(auth, `/company/${auth.locationId}/staff`);
    return res.data ?? [];
  }
}
```

- [ ] **Step 8: Create `apps/api/src/modules/altegio/endpoints/services.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { AltegioClient } from '../altegio.client';
import type { AltegioAuthContext } from '../types';
import type { AltegioServiceDto } from '../dto/service.dto';

@Injectable()
export class ServicesEndpoint {
  constructor(private readonly client: AltegioClient) {}

  async fetchAll(auth: AltegioAuthContext): Promise<AltegioServiceDto[]> {
    type Resp = { success: boolean; data: AltegioServiceDto[] };
    const res = await this.client.get<Resp>(auth, `/company/${auth.locationId}/services`);
    return res.data ?? [];
  }
}
```

- [ ] **Step 9: Verify build and commit**

```bash
pnpm -F @altegio/api build
git add . && git commit -m "feat(altegio): add records/clients/staff/services endpoints"
```

---

### Task 17: Altegio fixtures + live smoke test

**Files:**
- Create: `apps/api/test/fixtures/altegio/records-sample.json`, `staff-sample.json`, `services-sample.json`, `clients-sample.json`
- Create: `apps/api/test/altegio-live.int.spec.ts`

Note: fixtures are sanitized copies of real Altegio responses. If you don't have them yet, run `apps/api/test/altegio-live.int.spec.ts` once with `SEED=1` and save the first page output (a helper is below).

- [ ] **Step 1: Create `apps/api/test/altegio-live.int.spec.ts` (skipped by default)**

```ts
/**
 * Live smoke test — runs only when ALTEGIO_LIVE_TEST=1 is set.
 * Use to capture initial fixtures from the BrowUp partner token.
 */
import { AltegioClient } from '../src/modules/altegio/altegio.client';
import { RecordsEndpoint } from '../src/modules/altegio/endpoints/records';
import { StaffEndpoint } from '../src/modules/altegio/endpoints/staff';
import { ServicesEndpoint } from '../src/modules/altegio/endpoints/services';
import { ClientsEndpoint } from '../src/modules/altegio/endpoints/clients';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RUN = process.env.ALTEGIO_LIVE_TEST === '1';
const describeOrSkip = RUN ? describe : describe.skip;

describeOrSkip('Altegio live smoke', () => {
  const client = new AltegioClient({
    baseUrl: 'https://api.alteg.io/api/v1',
    requestsPerSecond: 3,
  });
  const auth = {
    partnerToken: process.env.ALTEGIO_PARTNER_TOKEN!,
    locationId: 198823,
  };

  it('captures fixtures', async () => {
    const records = new RecordsEndpoint(client);
    const staff = new StaffEndpoint(client);
    const services = new ServicesEndpoint(client);
    const clients = new ClientsEndpoint(client);

    const today = new Date().toISOString().slice(0, 10);
    const fromDate = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
    const fixturesDir = join(__dirname, 'fixtures/altegio');

    const recs = await records.fetchPage(auth, { start: fromDate, end: today, count: 50 });
    const stf = await staff.fetchAll(auth);
    const svc = await services.fetchAll(auth);
    const cli = await clients.fetchPage(auth, 1, 50);

    writeFileSync(join(fixturesDir, 'records-sample.json'), JSON.stringify(recs, null, 2));
    writeFileSync(join(fixturesDir, 'staff-sample.json'), JSON.stringify(stf, null, 2));
    writeFileSync(join(fixturesDir, 'services-sample.json'), JSON.stringify(svc, null, 2));
    writeFileSync(join(fixturesDir, 'clients-sample.json'), JSON.stringify(cli, null, 2));
    expect(recs.length).toBeGreaterThan(0);
  }, 60_000);
});
```

- [ ] **Step 2: Create fixture dir**

```bash
mkdir -p apps/api/test/fixtures/altegio
```

- [ ] **Step 3: Run capture**

```bash
ALTEGIO_LIVE_TEST=1 \
ALTEGIO_PARTNER_TOKEN=3nhhg28zsrc6wx84e8xk \
pnpm -F @altegio/api test:int test/altegio-live.int.spec.ts
```
Expected: PASS, four fixture files written, each with real data.

- [ ] **Step 4: Sanitize fixtures by hand**

Open each fixture. Replace client `name`, `phone`, `email` with synthetic values (e.g. `Test Client 1`, `+7700000001`, `a@b.c`). Keep IDs, dates, amounts — these are needed for metric calculations and are not PII.

- [ ] **Step 5: Commit (fixtures + the live test; it's skipped by default)**

```bash
git add .
git commit -m "test(altegio): capture and sanitize real fixtures"
```

---

## Milestone 5 — Sync pipeline (Tasks 18-23)

### Task 18: Raw-layer writer

**Files:**
- Create: `apps/api/src/modules/sync/raw-writer.service.ts`
- Test: `apps/api/src/modules/sync/raw-writer.spec.ts` (unit, uses mocked repo) + int test extends `tenants.int.spec.ts` style

- [ ] **Step 1: Write unit test `raw-writer.spec.ts`**

```ts
import { RawWriterService } from './raw-writer.service';

type AnyRepo = { upsert: jest.Mock };

function repo(): AnyRepo {
  return { upsert: jest.fn().mockResolvedValue(undefined) };
}

describe('RawWriterService', () => {
  it('upserts records by (tenantId, altegioRecordId)', async () => {
    const rec = repo(); const cli = repo(); const stf = repo(); const svc = repo();
    const w = new RawWriterService(rec as any, cli as any, stf as any, svc as any);
    await w.writeRecords('t-1', [{ id: 10, foo: 'bar' } as any, { id: 20, x: 1 } as any]);
    expect(rec.upsert).toHaveBeenCalledWith(
      [
        { tenantId: 't-1', altegioRecordId: 10, payload: { id: 10, foo: 'bar' } },
        { tenantId: 't-1', altegioRecordId: 20, payload: { id: 20, x: 1 } },
      ],
      { conflictPaths: ['tenantId', 'altegioRecordId'], skipUpdateIfNoValuesChanged: false },
    );
  });

  it('is a no-op for empty arrays', async () => {
    const rec = repo(); const cli = repo(); const stf = repo(); const svc = repo();
    const w = new RawWriterService(rec as any, cli as any, stf as any, svc as any);
    await w.writeRecords('t-1', []);
    expect(rec.upsert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Implement `raw-writer.service.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AltegioRawRecordEntity } from './entities/altegio-raw-record.entity';
import { AltegioRawClientEntity } from './entities/altegio-raw-client.entity';
import { AltegioRawStaffEntity } from './entities/altegio-raw-staff.entity';
import { AltegioRawServiceEntity } from './entities/altegio-raw-service.entity';
import type { AltegioRecordDto } from '../altegio/dto/record.dto';
import type { AltegioClientDto } from '../altegio/dto/client.dto';
import type { AltegioStaffDto } from '../altegio/dto/staff.dto';
import type { AltegioServiceDto } from '../altegio/dto/service.dto';

@Injectable()
export class RawWriterService {
  constructor(
    @InjectRepository(AltegioRawRecordEntity) private readonly recs: Repository<AltegioRawRecordEntity>,
    @InjectRepository(AltegioRawClientEntity) private readonly cli: Repository<AltegioRawClientEntity>,
    @InjectRepository(AltegioRawStaffEntity) private readonly stf: Repository<AltegioRawStaffEntity>,
    @InjectRepository(AltegioRawServiceEntity) private readonly svc: Repository<AltegioRawServiceEntity>,
  ) {}

  async writeRecords(tenantId: string, batch: AltegioRecordDto[]): Promise<void> {
    if (batch.length === 0) return;
    await this.recs.upsert(
      batch.map((r) => ({ tenantId, altegioRecordId: r.id, payload: r })),
      { conflictPaths: ['tenantId', 'altegioRecordId'], skipUpdateIfNoValuesChanged: false },
    );
  }

  async writeClients(tenantId: string, batch: AltegioClientDto[]): Promise<void> {
    if (batch.length === 0) return;
    await this.cli.upsert(
      batch.map((c) => ({ tenantId, altegioClientId: c.id, payload: c })),
      { conflictPaths: ['tenantId', 'altegioClientId'], skipUpdateIfNoValuesChanged: false },
    );
  }

  async writeStaff(tenantId: string, batch: AltegioStaffDto[]): Promise<void> {
    if (batch.length === 0) return;
    await this.stf.upsert(
      batch.map((s) => ({ tenantId, altegioStaffId: s.id, payload: s })),
      { conflictPaths: ['tenantId', 'altegioStaffId'], skipUpdateIfNoValuesChanged: false },
    );
  }

  async writeServices(tenantId: string, batch: AltegioServiceDto[]): Promise<void> {
    if (batch.length === 0) return;
    await this.svc.upsert(
      batch.map((s) => ({ tenantId, altegioServiceId: s.id, payload: s })),
      { conflictPaths: ['tenantId', 'altegioServiceId'], skipUpdateIfNoValuesChanged: false },
    );
  }
}
```

- [ ] **Step 3: Verify unit passes and commit**

```bash
pnpm test src/modules/sync/raw-writer.spec.ts
git add . && git commit -m "feat(sync): add RawWriter service"
```

---

### Task 19: Parser — raw records → records (facts)

**Files:**
- Create: `apps/api/src/modules/sync/parsers/records.parser.ts`
- Test: `apps/api/src/modules/sync/parsers/records.parser.spec.ts`

- [ ] **Step 1: Write test**

```ts
import { RecordsParser } from './records.parser';
import type { AltegioRecordDto } from '../../altegio/dto/record.dto';

describe('RecordsParser', () => {
  const parser = new RecordsParser();
  const tenantId = 't-1';

  it('maps basic fields including attendance and cost', () => {
    const dto: AltegioRecordDto = {
      id: 42,
      date: '2026-04-19 14:00:00',
      datetime: '2026-04-19T14:00:00+05:00',
      staff_id: 7,
      client: { id: 11 },
      services: [{ id: 1, title: 's', cost: 5000 }],
      cost: 5000,
      attendance: 1,
      paid_full: 1,
      online: true,
      seance_length: 3600,
      deleted: false,
    };
    const row = parser.toRecordRow(tenantId, dto);
    expect(row).toMatchObject({
      tenantId: 't-1',
      altegioRecordId: 42,
      altegioStaffId: 7,
      altegioClientId: 11,
      cost: 5000,
      attendance: 1,
      paidFull: 1,
      isOnline: true,
      seanceLength: 3600,
      deleted: false,
    });
    expect(row.datetime).toBeInstanceOf(Date);
  });

  it('preserves deleted=true', () => {
    const dto = { id: 1, datetime: '2026-04-01T10:00:00Z', staff_id: 1, services: [], cost: 0, attendance: 0, paid_full: 0, online: false, seance_length: 0, deleted: true } as AltegioRecordDto;
    expect(parser.toRecordRow('t', dto).deleted).toBe(true);
  });

  it('handles null client gracefully', () => {
    const dto = { id: 2, datetime: '2026-04-01T10:00:00Z', staff_id: 3, client: null, services: [], cost: 0, attendance: 0, paid_full: 0, online: false, seance_length: 0, deleted: false } as AltegioRecordDto;
    expect(parser.toRecordRow('t', dto).altegioClientId).toBeNull();
  });
});
```

- [ ] **Step 2: Implement `records.parser.ts`**

```ts
import { Injectable } from '@nestjs/common';
import type { AltegioRecordDto } from '../../altegio/dto/record.dto';

export interface RecordRow {
  tenantId: string;
  altegioRecordId: number;
  altegioStaffId: number | null;
  altegioClientId: number | null;
  datetime: Date;
  seanceLength: number | null;
  cost: number;
  attendance: number;
  paidFull: number;
  isOnline: boolean;
  deleted: boolean;
}

@Injectable()
export class RecordsParser {
  toRecordRow(tenantId: string, dto: AltegioRecordDto): RecordRow {
    return {
      tenantId,
      altegioRecordId: dto.id,
      altegioStaffId: dto.staff_id ?? null,
      altegioClientId: dto.client?.id ?? null,
      datetime: new Date(dto.datetime),
      seanceLength: dto.seance_length ?? null,
      cost: Number(dto.cost ?? 0),
      attendance: dto.attendance ?? 0,
      paidFull: dto.paid_full ?? 0,
      isOnline: Boolean(dto.online),
      deleted: Boolean(dto.deleted),
    };
  }
}
```

- [ ] **Step 3: Verify and commit**

```bash
pnpm test src/modules/sync/parsers/records.parser.spec.ts
git add . && git commit -m "feat(sync): add RecordsParser"
```

---

### Task 20: Parsers for staff, services, clients

**Files:**
- Create: `apps/api/src/modules/sync/parsers/staff.parser.ts`, `services.parser.ts`, `clients.parser.ts`
- Tests alongside

- [ ] **Step 1: Implement `staff.parser.ts`**

```ts
import { Injectable } from '@nestjs/common';
import type { AltegioStaffDto } from '../../altegio/dto/staff.dto';

export interface StaffRow {
  tenantId: string;
  altegioStaffId: number;
  name: string;
  specialization: string | null;
  positionTitle: string | null;
  fired: boolean;
  bookable: boolean;
}

@Injectable()
export class StaffParser {
  toRow(tenantId: string, dto: AltegioStaffDto): StaffRow {
    return {
      tenantId,
      altegioStaffId: dto.id,
      name: dto.name,
      specialization: dto.specialization ?? null,
      positionTitle: dto.position?.title ?? null,
      fired: Boolean(dto.fired),
      bookable: dto.bookable ?? true,
    };
  }
}
```

- [ ] **Step 2: Implement `services.parser.ts`**

```ts
import { Injectable } from '@nestjs/common';
import type { AltegioServiceDto } from '../../altegio/dto/service.dto';

export interface ServiceRow {
  tenantId: string;
  altegioServiceId: number;
  title: string;
  categoryId: number | null;
  priceMin: number | null;
  priceMax: number | null;
  active: boolean;
}

@Injectable()
export class ServicesParser {
  toRow(tenantId: string, dto: AltegioServiceDto): ServiceRow {
    return {
      tenantId,
      altegioServiceId: dto.id,
      title: dto.title,
      categoryId: dto.category_id ?? null,
      priceMin: dto.price_min ?? null,
      priceMax: dto.price_max ?? null,
      active: Boolean(dto.active ?? 1),
    };
  }
}
```

- [ ] **Step 3: Implement `clients.parser.ts`**

```ts
import { Injectable } from '@nestjs/common';
import type { AltegioClientDto } from '../../altegio/dto/client.dto';

export interface ClientRow {
  tenantId: string;
  altegioClientId: number;
  name: string | null;
  phone: string | null;
  visitsCount: number | null;
  lastVisitDate: string | null;
  spent: number | null;
}

@Injectable()
export class ClientsParser {
  toRow(tenantId: string, dto: AltegioClientDto): ClientRow {
    return {
      tenantId,
      altegioClientId: dto.id,
      name: dto.name ?? null,
      phone: dto.phone ?? null,
      visitsCount: dto.visits_count ?? null,
      lastVisitDate: dto.last_visit_date ?? null,
      spent: dto.spent ?? null,
    };
  }
}
```

- [ ] **Step 4: Add tests for each (quick smoke-level)**

Example for staff: `apps/api/src/modules/sync/parsers/staff.parser.spec.ts`:

```ts
import { StaffParser } from './staff.parser';

describe('StaffParser', () => {
  it('maps position.title and normalizes fired flag', () => {
    const p = new StaffParser();
    const row = p.toRow('t', { id: 1, name: 'A', fired: 1, position: { id: 2, title: 'Senior' } } as any);
    expect(row).toMatchObject({ name: 'A', fired: true, positionTitle: 'Senior' });
  });
});
```

Add similar 1-2 assertion specs for `services.parser.spec.ts` and `clients.parser.spec.ts`.

- [ ] **Step 5: Verify and commit**

```bash
pnpm test src/modules/sync/parsers/
git add . && git commit -m "feat(sync): add staff/services/clients parsers"
```

---

### Task 21: Aggregator (facts → daily_metrics, staff_daily)

**Files:**
- Create: `apps/api/src/modules/sync/aggregator.service.ts`
- Test: `apps/api/test/aggregator.int.spec.ts` (integration — needs real SQL)

- [ ] **Step 1: Implement `aggregator.service.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class AggregatorService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /**
   * Recompute daily_metrics + staff_daily for a given (tenant, date).
   * Destructive-and-replace strategy — simpler to reason about than partial updates.
   */
  async recomputeDay(tenantId: string, date: string /* YYYY-MM-DD */): Promise<void> {
    await this.ds.transaction(async (mgr) => {
      await mgr.query(
        `DELETE FROM daily_metrics WHERE tenant_id = $1 AND date = $2`,
        [tenantId, date],
      );
      await mgr.query(
        `DELETE FROM staff_daily WHERE tenant_id = $1 AND date = $2`,
        [tenantId, date],
      );
      await mgr.query(
        `
        INSERT INTO daily_metrics
          (tenant_id, date, revenue_total, visits_completed, visits_cancelled, avg_check, occupancy_pct, computed_at)
        SELECT
          $1::uuid,
          $2::date,
          COALESCE(SUM(cost) FILTER (WHERE attendance = 1 AND NOT deleted), 0),
          COUNT(*) FILTER (WHERE attendance = 1 AND NOT deleted),
          COUNT(*) FILTER (WHERE attendance = -1 AND NOT deleted),
          CASE
            WHEN COUNT(*) FILTER (WHERE attendance = 1 AND NOT deleted) = 0 THEN 0
            ELSE SUM(cost) FILTER (WHERE attendance = 1 AND NOT deleted) /
                 COUNT(*) FILTER (WHERE attendance = 1 AND NOT deleted)
          END,
          CASE
            WHEN (SELECT working_hours_per_day FROM tenants WHERE id = $1) = 0 THEN 0
            ELSE LEAST(100.0,
              COALESCE(SUM(seance_length) FILTER (WHERE attendance = 1 AND NOT deleted), 0)::numeric
              / NULLIF(
                  (SELECT COUNT(*) FROM staff
                    WHERE tenant_id = $1 AND NOT fired AND bookable)
                  * (SELECT working_hours_per_day FROM tenants WHERE id = $1)
                  * 3600, 0)
              * 100.0
            )
          END,
          now()
        FROM records
        WHERE tenant_id = $1 AND (datetime AT TIME ZONE (SELECT timezone FROM tenants WHERE id = $1))::date = $2
        `,
        [tenantId, date],
      );
      await mgr.query(
        `
        INSERT INTO staff_daily
          (tenant_id, altegio_staff_id, date, revenue, visits, cancelled, avg_check, computed_at)
        SELECT
          $1::uuid,
          altegio_staff_id,
          $2::date,
          COALESCE(SUM(cost) FILTER (WHERE attendance = 1 AND NOT deleted), 0),
          COUNT(*) FILTER (WHERE attendance = 1 AND NOT deleted),
          COUNT(*) FILTER (WHERE attendance = -1 AND NOT deleted),
          CASE
            WHEN COUNT(*) FILTER (WHERE attendance = 1 AND NOT deleted) = 0 THEN 0
            ELSE SUM(cost) FILTER (WHERE attendance = 1 AND NOT deleted) /
                 COUNT(*) FILTER (WHERE attendance = 1 AND NOT deleted)
          END,
          now()
        FROM records
        WHERE tenant_id = $1
          AND altegio_staff_id IS NOT NULL
          AND (datetime AT TIME ZONE (SELECT timezone FROM tenants WHERE id = $1))::date = $2
        GROUP BY altegio_staff_id
        `,
        [tenantId, date],
      );
    });
  }
}
```

- [ ] **Step 2: Write integration test `apps/api/test/aggregator.int.spec.ts`**

```ts
import { startTestDb, TestDb } from './helpers/test-db';
import { TenantEntity } from '../src/modules/tenants/tenant.entity';
import { TenantsService } from '../src/modules/tenants/tenants.service';
import { TokenCipher } from '../src/modules/tenants/token-cipher.service';
import { AggregatorService } from '../src/modules/sync/aggregator.service';

describe('AggregatorService (int)', () => {
  let db: TestDb;
  let svc: TenantsService;
  let agg: AggregatorService;

  beforeAll(async () => {
    db = await startTestDb();
    svc = new TenantsService(db.ds.getRepository(TenantEntity), new TokenCipher(process.env.APP_ENCRYPTION_KEY!));
    agg = new AggregatorService(db.ds);
  });

  afterAll(async () => { await db.stop(); });

  it('computes daily_metrics and staff_daily from records', async () => {
    const t = await svc.create({ salonName: 'Agg', locationId: 99, altegioToken: 't', timezone: 'UTC' });

    // seed 2 completed + 1 cancelled record, all for staff 1 on 2026-04-19
    await db.ds.query(`
      INSERT INTO records (tenant_id, altegio_record_id, altegio_staff_id, datetime, seance_length, cost, attendance, paid_full, is_online, deleted)
      VALUES
        ('${t.id}', 1, 1, '2026-04-19 10:00+00', 3600, 5000, 1, 1, false, false),
        ('${t.id}', 2, 1, '2026-04-19 12:00+00', 3600, 7000, 1, 1, false, false),
        ('${t.id}', 3, 1, '2026-04-19 14:00+00', 3600, 9000, -1, 0, false, false)
    `);
    // one staff member required for occupancy
    await db.ds.query(`INSERT INTO staff (tenant_id, altegio_staff_id, name, fired, bookable) VALUES ('${t.id}', 1, 'A', false, true)`);

    await agg.recomputeDay(t.id, '2026-04-19');

    const dm = await db.ds.query(`SELECT * FROM daily_metrics WHERE tenant_id = '${t.id}'`);
    expect(dm).toHaveLength(1);
    expect(Number(dm[0].revenue_total)).toBe(12000);
    expect(dm[0].visits_completed).toBe(2);
    expect(dm[0].visits_cancelled).toBe(1);
    expect(Number(dm[0].avg_check)).toBe(6000);

    const sd = await db.ds.query(`SELECT * FROM staff_daily WHERE tenant_id = '${t.id}'`);
    expect(sd).toHaveLength(1);
    expect(Number(sd[0].revenue)).toBe(12000);
    expect(sd[0].visits).toBe(2);
    expect(sd[0].cancelled).toBe(1);
  });

  it('is idempotent — rerunning produces the same row count', async () => {
    const t = await svc.create({ salonName: 'Agg2', locationId: 100, altegioToken: 't', timezone: 'UTC' });
    await db.ds.query(`
      INSERT INTO records (tenant_id, altegio_record_id, altegio_staff_id, datetime, seance_length, cost, attendance, paid_full, is_online, deleted)
      VALUES ('${t.id}', 10, 5, '2026-04-19 10:00+00', 3600, 1000, 1, 1, false, false)
    `);
    await db.ds.query(`INSERT INTO staff (tenant_id, altegio_staff_id, name, fired, bookable) VALUES ('${t.id}', 5, 'B', false, true)`);

    await agg.recomputeDay(t.id, '2026-04-19');
    await agg.recomputeDay(t.id, '2026-04-19');

    const count = await db.ds.query(`SELECT COUNT(*) FROM daily_metrics WHERE tenant_id = '${t.id}'`);
    expect(Number(count[0].count)).toBe(1);
  });
});
```

- [ ] **Step 3: Run int tests**

```bash
pnpm test:int test/aggregator.int.spec.ts
```
Expected: 2/2 pass.

- [ ] **Step 4: Commit**

```bash
git add . && git commit -m "feat(sync): add AggregatorService + int test"
```

---

### Task 22: SyncService orchestrator

**Files:**
- Create: `apps/api/src/modules/sync/sync.service.ts`, `apps/api/src/modules/sync/sync.module.ts`
- Test: `apps/api/test/sync.int.spec.ts`

- [ ] **Step 1: Implement `sync.service.ts`**

```ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { TenantsService } from '../tenants/tenants.service';
import { RawWriterService } from './raw-writer.service';
import { AggregatorService } from './aggregator.service';
import { RecordsParser } from './parsers/records.parser';
import { StaffParser } from './parsers/staff.parser';
import { ServicesParser } from './parsers/services.parser';
import { ClientsParser } from './parsers/clients.parser';
import { RecordsEndpoint } from '../altegio/endpoints/records';
import { ClientsEndpoint } from '../altegio/endpoints/clients';
import { StaffEndpoint } from '../altegio/endpoints/staff';
import { ServicesEndpoint } from '../altegio/endpoints/services';
import { SyncJobEntity } from './entities/sync-job.entity';

interface SyncOptions {
  days?: number; // how far back (default 3)
}

@Injectable()
export class SyncService {
  private readonly log = new Logger(SyncService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(SyncJobEntity) private readonly jobs: Repository<SyncJobEntity>,
    private readonly tenants: TenantsService,
    private readonly rawWriter: RawWriterService,
    private readonly aggregator: AggregatorService,
    private readonly recParser: RecordsParser,
    private readonly stfParser: StaffParser,
    private readonly svcParser: ServicesParser,
    private readonly cliParser: ClientsParser,
    private readonly recEp: RecordsEndpoint,
    private readonly cliEp: ClientsEndpoint,
    private readonly stfEp: StaffEndpoint,
    private readonly svcEp: ServicesEndpoint,
  ) {}

  async syncTenant(tenantId: string, opts: SyncOptions = {}): Promise<void> {
    const tenant = await this.tenants.findById(tenantId);
    if (!tenant) throw new Error(`Tenant ${tenantId} not found`);

    const job = await this.jobs.save(this.jobs.create({ tenantId, status: 'running' }));
    const auth = { partnerToken: await this.tenants.getAltegioToken(tenantId), locationId: Number(tenant.locationId) };

    const days = opts.days ?? 3;
    const end = new Date();
    const start = new Date(Date.now() - days * 86_400_000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    let total = 0;
    const touchedDates = new Set<string>();

    try {
      // 1) Snapshots (staff, services)
      const staff = await this.stfEp.fetchAll(auth);
      await this.rawWriter.writeStaff(tenantId, staff);
      await this.upsertStaff(tenantId, staff.map((s) => this.stfParser.toRow(tenantId, s)));

      const services = await this.svcEp.fetchAll(auth);
      await this.rawWriter.writeServices(tenantId, services);
      await this.upsertServices(tenantId, services.map((s) => this.svcParser.toRow(tenantId, s)));

      // 2) Records delta
      for await (const batch of this.recEp.fetchAll(auth, { start: fmt(start), end: fmt(end) })) {
        await this.rawWriter.writeRecords(tenantId, batch);
        const rows = batch.map((r) => this.recParser.toRecordRow(tenantId, r));
        await this.upsertRecords(rows);
        rows.forEach((r) => touchedDates.add(this.localDate(r.datetime, tenant.timezone)));
        total += batch.length;
      }

      // 3) Clients delta (page 1 only for Phase 1 — covers recent activity)
      const cliBatch = await this.cliEp.fetchPage(auth, 1, 200);
      await this.rawWriter.writeClients(tenantId, cliBatch);
      await this.upsertClients(tenantId, cliBatch.map((c) => this.cliParser.toRow(tenantId, c)));

      // 4) Aggregate every touched date
      for (const d of touchedDates) {
        await this.aggregator.recomputeDay(tenantId, d);
      }

      await this.jobs.update({ id: job.id }, {
        status: 'success',
        finishedAt: new Date(),
        recordsFetched: total,
      });
      this.log.log(`[${tenant.salonName}] sync ok — ${total} records, ${touchedDates.size} dates`);
    } catch (err: any) {
      await this.jobs.update({ id: job.id }, {
        status: 'failed',
        finishedAt: new Date(),
        error: String(err?.message ?? err).slice(0, 2000),
      });
      throw err;
    }
  }

  private localDate(d: Date, tz: string): string {
    // Use en-CA locale to get YYYY-MM-DD in the given TZ
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  }

  private async upsertRecords(rows: Awaited<ReturnType<RecordsParser['toRecordRow']>>[]): Promise<void> {
    if (rows.length === 0) return;
    const COLS = 11;
    const values = rows
      .map((_, i) => {
        const base = i * COLS;
        return `(${Array.from({ length: COLS }, (_, j) => `$${base + j + 1}`).join(', ')})`;
      })
      .join(', ');
    const params = rows.flatMap((r) => [
      r.tenantId, r.altegioRecordId, r.altegioStaffId, r.altegioClientId,
      r.datetime, r.seanceLength, r.cost, r.attendance, r.paidFull, r.isOnline, r.deleted,
    ]);
    await this.ds.query(
      `
      INSERT INTO records
        (tenant_id, altegio_record_id, altegio_staff_id, altegio_client_id, datetime, seance_length, cost, attendance, paid_full, is_online, deleted)
      VALUES ${values}
      ON CONFLICT (tenant_id, altegio_record_id) DO UPDATE SET
        altegio_staff_id = EXCLUDED.altegio_staff_id,
        altegio_client_id = EXCLUDED.altegio_client_id,
        datetime = EXCLUDED.datetime,
        seance_length = EXCLUDED.seance_length,
        cost = EXCLUDED.cost,
        attendance = EXCLUDED.attendance,
        paid_full = EXCLUDED.paid_full,
        is_online = EXCLUDED.is_online,
        deleted = EXCLUDED.deleted,
        updated_at = now()
      `,
      params,
    );
  }

  private async upsertStaff(tenantId: string, rows: Array<ReturnType<StaffParser['toRow']>>): Promise<void> {
    if (rows.length === 0) return;
    for (const r of rows) {
      await this.ds.query(
        `
        INSERT INTO staff (tenant_id, altegio_staff_id, name, specialization, position_title, fired, bookable)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (tenant_id, altegio_staff_id) DO UPDATE SET
          name = EXCLUDED.name,
          specialization = EXCLUDED.specialization,
          position_title = EXCLUDED.position_title,
          fired = EXCLUDED.fired,
          bookable = EXCLUDED.bookable,
          updated_at = now()
        `,
        [tenantId, r.altegioStaffId, r.name, r.specialization, r.positionTitle, r.fired, r.bookable],
      );
    }
  }

  private async upsertServices(tenantId: string, rows: Array<ReturnType<ServicesParser['toRow']>>): Promise<void> {
    if (rows.length === 0) return;
    for (const r of rows) {
      await this.ds.query(
        `
        INSERT INTO services (tenant_id, altegio_service_id, title, category_id, price_min, price_max, active)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (tenant_id, altegio_service_id) DO UPDATE SET
          title = EXCLUDED.title, category_id = EXCLUDED.category_id,
          price_min = EXCLUDED.price_min, price_max = EXCLUDED.price_max,
          active = EXCLUDED.active, updated_at = now()
        `,
        [tenantId, r.altegioServiceId, r.title, r.categoryId, r.priceMin, r.priceMax, r.active],
      );
    }
  }

  private async upsertClients(tenantId: string, rows: Array<ReturnType<ClientsParser['toRow']>>): Promise<void> {
    if (rows.length === 0) return;
    for (const r of rows) {
      await this.ds.query(
        `
        INSERT INTO clients (tenant_id, altegio_client_id, name, phone, visits_count, last_visit_date, spent)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (tenant_id, altegio_client_id) DO UPDATE SET
          name = EXCLUDED.name, phone = EXCLUDED.phone,
          visits_count = EXCLUDED.visits_count, last_visit_date = EXCLUDED.last_visit_date,
          spent = EXCLUDED.spent, updated_at = now()
        `,
        [tenantId, r.altegioClientId, r.name, r.phone, r.visitsCount, r.lastVisitDate, r.spent],
      );
    }
  }
}
```

- [ ] **Step 2: Create `sync.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AltegioRawRecordEntity } from './entities/altegio-raw-record.entity';
import { AltegioRawClientEntity } from './entities/altegio-raw-client.entity';
import { AltegioRawStaffEntity } from './entities/altegio-raw-staff.entity';
import { AltegioRawServiceEntity } from './entities/altegio-raw-service.entity';
import { SyncJobEntity } from './entities/sync-job.entity';
import { RawWriterService } from './raw-writer.service';
import { AggregatorService } from './aggregator.service';
import { RecordsParser } from './parsers/records.parser';
import { StaffParser } from './parsers/staff.parser';
import { ServicesParser } from './parsers/services.parser';
import { ClientsParser } from './parsers/clients.parser';
import { SyncService } from './sync.service';
import { TenantsModule } from '../tenants/tenants.module';
import { AltegioModule } from '../altegio/altegio.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AltegioRawRecordEntity,
      AltegioRawClientEntity,
      AltegioRawStaffEntity,
      AltegioRawServiceEntity,
      SyncJobEntity,
    ]),
    TenantsModule,
    AltegioModule,
  ],
  providers: [
    RawWriterService, AggregatorService,
    RecordsParser, StaffParser, ServicesParser, ClientsParser,
    SyncService,
  ],
  exports: [SyncService, AggregatorService],
})
export class SyncModule {}
```

- [ ] **Step 3: Wire SyncModule into AppModule**

Edit `apps/api/src/app.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './db/database.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { AltegioModule } from './modules/altegio/altegio.module';
import { SyncModule } from './modules/sync/sync.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    TenantsModule,
    AltegioModule,
    SyncModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 4: Integration test `sync.int.spec.ts`**

```ts
import { startTestDb, TestDb } from './helpers/test-db';
import { TenantEntity } from '../src/modules/tenants/tenant.entity';
import { SyncJobEntity } from '../src/modules/sync/entities/sync-job.entity';
import { TenantsService } from '../src/modules/tenants/tenants.service';
import { TokenCipher } from '../src/modules/tenants/token-cipher.service';
import { AggregatorService } from '../src/modules/sync/aggregator.service';
import { RawWriterService } from '../src/modules/sync/raw-writer.service';
import { RecordsParser } from '../src/modules/sync/parsers/records.parser';
import { StaffParser } from '../src/modules/sync/parsers/staff.parser';
import { ServicesParser } from '../src/modules/sync/parsers/services.parser';
import { ClientsParser } from '../src/modules/sync/parsers/clients.parser';
import { SyncService } from '../src/modules/sync/sync.service';
import { AltegioRawRecordEntity } from '../src/modules/sync/entities/altegio-raw-record.entity';
import { AltegioRawClientEntity } from '../src/modules/sync/entities/altegio-raw-client.entity';
import { AltegioRawStaffEntity } from '../src/modules/sync/entities/altegio-raw-staff.entity';
import { AltegioRawServiceEntity } from '../src/modules/sync/entities/altegio-raw-service.entity';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('SyncService integration', () => {
  let db: TestDb;
  let svc: SyncService;
  let tenants: TenantsService;

  beforeAll(async () => {
    db = await startTestDb();

    const tokenCipher = new TokenCipher(process.env.APP_ENCRYPTION_KEY!);
    tenants = new TenantsService(db.ds.getRepository(TenantEntity), tokenCipher);
    const raw = new RawWriterService(
      db.ds.getRepository(AltegioRawRecordEntity),
      db.ds.getRepository(AltegioRawClientEntity),
      db.ds.getRepository(AltegioRawStaffEntity),
      db.ds.getRepository(AltegioRawServiceEntity),
    );
    const agg = new AggregatorService(db.ds);

    // Mock endpoints that feed from fixtures
    const recFix = JSON.parse(readFileSync(join(__dirname, 'fixtures/altegio/records-sample.json'), 'utf8'));
    const stfFix = JSON.parse(readFileSync(join(__dirname, 'fixtures/altegio/staff-sample.json'), 'utf8'));
    const svcFix = JSON.parse(readFileSync(join(__dirname, 'fixtures/altegio/services-sample.json'), 'utf8'));
    const cliFix = JSON.parse(readFileSync(join(__dirname, 'fixtures/altegio/clients-sample.json'), 'utf8'));
    const recEp = { fetchAll: async function* () { yield recFix; } } as any;
    const cliEp = { fetchPage: async () => cliFix } as any;
    const stfEp = { fetchAll: async () => stfFix } as any;
    const svcEp = { fetchAll: async () => svcFix } as any;

    svc = new SyncService(
      db.ds,
      db.ds.getRepository(SyncJobEntity),
      tenants,
      raw,
      agg,
      new RecordsParser(),
      new StaffParser(),
      new ServicesParser(),
      new ClientsParser(),
      recEp, cliEp, stfEp, svcEp,
    );
  });

  afterAll(async () => { await db.stop(); });

  it('ingests fixture data end-to-end and is idempotent', async () => {
    const t = await tenants.create({ salonName: 'Live', locationId: 198823, altegioToken: 'x', timezone: 'Asia/Almaty' });

    await svc.syncTenant(t.id);
    const after1 = await db.ds.query(`SELECT COUNT(*) FROM records WHERE tenant_id = '${t.id}'`);

    await svc.syncTenant(t.id);
    const after2 = await db.ds.query(`SELECT COUNT(*) FROM records WHERE tenant_id = '${t.id}'`);

    expect(after1[0].count).toBe(after2[0].count); // no dupes
    expect(Number(after1[0].count)).toBeGreaterThan(0);

    const dm = await db.ds.query(`SELECT * FROM daily_metrics WHERE tenant_id = '${t.id}'`);
    expect(dm.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 5: Run int and commit**

```bash
pnpm test:int test/sync.int.spec.ts
git add . && git commit -m "feat(sync): add SyncService orchestrator + int test"
```

---

### Task 23: BullMQ queues + sync processor

**Files:**
- Create: `apps/api/src/queues/queues.module.ts`, `apps/api/src/modules/sync/sync.processor.ts`

- [ ] **Step 1: Install deps**

```bash
pnpm add -F @altegio/api @nestjs/bullmq bullmq
```

- [ ] **Step 2: Create `queues.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { loadConfig } from '../config/app.config';

const cfg = loadConfig();
const url = new URL(cfg.REDIS_URL);

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: url.hostname,
        port: Number(url.port || 6379),
        password: url.password || undefined,
      },
    }),
    BullModule.registerQueue(
      { name: 'sync' },
      { name: 'backfill' },
      { name: 'reports' },
    ),
  ],
  exports: [BullModule],
})
export class QueuesModule {}
```

- [ ] **Step 3: Create `apps/api/src/modules/sync/sync.processor.ts`**

```ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SyncService } from './sync.service';

export interface SyncJobData {
  tenantId: string;
  days?: number;
}

@Processor('sync', { concurrency: 2 })
export class SyncProcessor extends WorkerHost {
  private readonly log = new Logger(SyncProcessor.name);

  constructor(private readonly sync: SyncService) {
    super();
  }

  async process(job: Job<SyncJobData>): Promise<void> {
    const { tenantId, days } = job.data;
    this.log.log(`Sync start: tenant=${tenantId} days=${days ?? 3}`);
    await this.sync.syncTenant(tenantId, { days });
    this.log.log(`Sync done: tenant=${tenantId}`);
  }
}
```

- [ ] **Step 4: Register processor in SyncModule**

Add `SyncProcessor` to `sync.module.ts` providers. Add `QueuesModule` to imports of `AppModule`.

- [ ] **Step 5: Commit**

```bash
git add . && git commit -m "feat(queue): add BullMQ + sync processor"
```

---

## Milestone 6 — CLI admin (Task 24)

### Task 24: `apps/cli` admin commands

**Files:**
- Create: `apps/cli/package.json`, `apps/cli/tsconfig.json`, `apps/cli/src/main.ts`, `apps/cli/src/commands/*`

- [ ] **Step 1: Install deps**

```bash
pnpm add -F @altegio/cli commander dotenv
```

Create `apps/cli/package.json`:

```json
{
  "name": "@altegio/cli",
  "version": "0.1.0",
  "private": true,
  "main": "dist/main.js",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "ts-node -r tsconfig-paths/register -r dotenv/config src/main.ts"
  },
  "dependencies": {
    "@altegio/api": "workspace:*",
    "commander": "^12.0.0",
    "dotenv": "^16.4.0",
    "reflect-metadata": "^0.2.0"
  },
  "devDependencies": {
    "ts-node": "^10.9.0",
    "tsconfig-paths": "^4.2.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create `apps/cli/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `apps/cli/src/bootstrap.ts`**

```ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../api/src/app.module';

export async function bootstrapApp() {
  return NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
}
```

- [ ] **Step 4: Create `apps/cli/src/commands/add-salon.ts`**

```ts
import { Command } from 'commander';
import { bootstrapApp } from '../bootstrap';
import { TenantsService } from '../../../api/src/modules/tenants/tenants.service';

export function addSalonCommand(): Command {
  return new Command('add-salon')
    .description('Create a new tenant')
    .requiredOption('--name <name>', 'Salon display name')
    .requiredOption('--location-id <id>', 'Altegio location ID', (v) => Number(v))
    .requiredOption('--token <token>', 'Altegio partner token')
    .option('--chain-id <id>', 'Altegio chain ID', (v) => Number(v))
    .option('--timezone <tz>', 'IANA timezone', 'Asia/Almaty')
    .option('--telegram-chat-id <id>', 'Telegram chat/user ID', (v) => Number(v))
    .option('--working-hours <n>', 'Working hours/day', (v) => Number(v), 10)
    .action(async (opts) => {
      const app = await bootstrapApp();
      const tenants = app.get(TenantsService);
      const t = await tenants.create({
        salonName: opts.name,
        locationId: opts.locationId,
        chainId: opts.chainId,
        altegioToken: opts.token,
        timezone: opts.timezone,
        telegramChatId: opts.telegramChatId,
        workingHoursPerDay: opts.workingHours,
      });
      console.log(`Created tenant ${t.id} (${t.salonName})`);
      await app.close();
    });
}
```

- [ ] **Step 5: Create `apps/cli/src/commands/link-telegram.ts`**

```ts
import { Command } from 'commander';
import { bootstrapApp } from '../bootstrap';
import { TenantsService } from '../../../api/src/modules/tenants/tenants.service';

export function linkTelegramCommand(): Command {
  return new Command('link-telegram')
    .description('Attach a Telegram chat to a tenant and enable reports')
    .requiredOption('--tenant <id>', 'Tenant UUID')
    .requiredOption('--chat <id>', 'Telegram chat/user ID', (v) => Number(v))
    .option('--enable', 'Enable report_enabled', false)
    .action(async (opts) => {
      const app = await bootstrapApp();
      const tenants = app.get(TenantsService);
      await tenants.setTelegramChat(opts.tenant, opts.chat);
      if (opts.enable) await tenants.setReportEnabled(opts.tenant, true);
      console.log(`Linked chat ${opts.chat} to tenant ${opts.tenant}, enabled=${Boolean(opts.enable)}`);
      await app.close();
    });
}
```

- [ ] **Step 6: Create `apps/cli/src/commands/trigger-sync.ts`**

```ts
import { Command } from 'commander';
import { bootstrapApp } from '../bootstrap';
import { SyncService } from '../../../api/src/modules/sync/sync.service';

export function triggerSyncCommand(): Command {
  return new Command('trigger-sync')
    .description('Run a sync for a tenant (bypasses queue)')
    .requiredOption('--tenant <id>', 'Tenant UUID')
    .option('--days <n>', 'Backfill window', (v) => Number(v), 3)
    .action(async (opts) => {
      const app = await bootstrapApp();
      const sync = app.get(SyncService);
      console.log(`Syncing tenant ${opts.tenant} (${opts.days} days)...`);
      await sync.syncTenant(opts.tenant, { days: opts.days });
      console.log('Done.');
      await app.close();
    });
}
```

- [ ] **Step 7: Create `apps/cli/src/main.ts`**

```ts
import { Command } from 'commander';
import { addSalonCommand } from './commands/add-salon';
import { linkTelegramCommand } from './commands/link-telegram';
import { triggerSyncCommand } from './commands/trigger-sync';

const program = new Command('altegio-cli')
  .description('Altegio AI admin CLI');

program.addCommand(addSalonCommand());
program.addCommand(linkTelegramCommand());
program.addCommand(triggerSyncCommand());

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 8: Smoke test**

```bash
pnpm install
pnpm cli add-salon --name 'BrowUp' --location-id 198823 --token 3nhhg28zsrc6wx84e8xk --timezone Asia/Almaty
```
Expected: prints `Created tenant <uuid>`. Look up the UUID in Postgres:

```bash
docker compose -f docker/docker-compose.yml exec postgres \
  psql -U altegio -d altegio_ai -c "SELECT id, salon_name FROM tenants"
```

- [ ] **Step 9: Commit**

```bash
git add . && git commit -m "feat(cli): add add-salon, link-telegram, trigger-sync"
```

---

## Milestone 7 — Metrics + Template (Tasks 25-28)

### Task 25: MetricsService — getDailyReportData

**Files:**
- Create: `apps/api/src/modules/metrics/metrics.service.ts`, `apps/api/src/modules/metrics/metrics.module.ts`
- Test: `apps/api/test/metrics.int.spec.ts`

- [ ] **Step 1: Implement `metrics.service.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantsService } from '../tenants/tenants.service';
import type { DailyReportData } from '@altegio/shared';

@Injectable()
export class MetricsService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly tenants: TenantsService,
  ) {}

  /**
   * Build the full DailyReportData for `reportDate` (today from the scheduler's
   * perspective — yesterday = reportDate - 1).
   */
  async getDailyReportData(tenantId: string, reportDate: string /* YYYY-MM-DD */): Promise<DailyReportData> {
    const tenant = await this.tenants.findById(tenantId);
    if (!tenant) throw new Error(`Tenant ${tenantId} not found`);

    const yesterday = this.subtractDays(reportDate, 1);
    const weekStart = this.subtractDays(reportDate, 8);
    const weekEnd = this.subtractDays(reportDate, 2);

    const [yStats] = await this.ds.query(
      `SELECT revenue_total, visits_completed, visits_cancelled, avg_check, occupancy_pct
       FROM daily_metrics WHERE tenant_id = $1 AND date = $2`,
      [tenantId, yesterday],
    );

    const [baseline] = await this.ds.query(
      `SELECT
        COALESCE(AVG(revenue_total), 0)::numeric       AS avg_revenue,
        COALESCE(AVG(visits_completed), 0)::numeric    AS avg_visits,
        COALESCE(
          AVG(visits_cancelled::numeric
            / NULLIF(visits_completed + visits_cancelled, 0)),
          0
        )::numeric                                    AS avg_cancel_rate
       FROM daily_metrics
       WHERE tenant_id = $1 AND date BETWEEN $2 AND $3`,
      [tenantId, weekStart, weekEnd],
    );

    const topStaff = await this.ds.query(
      `SELECT sd.altegio_staff_id AS staff_id, s.name, sd.revenue::numeric, sd.visits
       FROM staff_daily sd
       JOIN staff s ON s.tenant_id = sd.tenant_id AND s.altegio_staff_id = sd.altegio_staff_id
       WHERE sd.tenant_id = $1 AND sd.date = $2 AND sd.visits > 0
       ORDER BY sd.revenue DESC LIMIT 3`,
      [tenantId, yesterday],
    );

    const strugglingStaff = await this.ds.query(
      `WITH w AS (
         SELECT altegio_staff_id,
                AVG(revenue::numeric) AS avg_7d
         FROM staff_daily
         WHERE tenant_id = $1 AND date BETWEEN $2 AND $3
         GROUP BY altegio_staff_id
       ),
       yest AS (
         SELECT altegio_staff_id, revenue::numeric AS rev
         FROM staff_daily WHERE tenant_id = $1 AND date = $4
       ),
       prev AS (
         SELECT altegio_staff_id, revenue::numeric AS rev
         FROM staff_daily WHERE tenant_id = $1 AND date = $5
       )
       SELECT y.altegio_staff_id AS staff_id, s.name,
              2 AS consecutive_days_below_avg
       FROM yest y
       JOIN w ON w.altegio_staff_id = y.altegio_staff_id
       LEFT JOIN prev p ON p.altegio_staff_id = y.altegio_staff_id
       JOIN staff s ON s.tenant_id = $1 AND s.altegio_staff_id = y.altegio_staff_id
       WHERE y.rev < w.avg_7d * 0.6
         AND COALESCE(p.rev, 0) < w.avg_7d * 0.6
       LIMIT 2`,
      [tenantId, weekStart, weekEnd, yesterday, this.subtractDays(yesterday, 1)],
    );

    const [cancelLoss] = await this.ds.query(
      `SELECT COALESCE(SUM(cost), 0)::numeric AS loss
       FROM records
       WHERE tenant_id = $1 AND attendance = -1 AND NOT deleted
         AND (datetime AT TIME ZONE $2)::date = $3`,
      [tenantId, tenant.timezone, yesterday],
    );

    const [todayLoad] = await this.ds.query(
      `SELECT
         COUNT(*) FILTER (WHERE NOT deleted) AS booked,
         COALESCE(SUM(seance_length) FILTER (WHERE NOT deleted), 0) AS total_seconds
       FROM records
       WHERE tenant_id = $1 AND (datetime AT TIME ZONE $2)::date = $3`,
      [tenantId, tenant.timezone, reportDate],
    );

    const [staffCountRow] = await this.ds.query(
      `SELECT COUNT(*)::int AS n FROM staff WHERE tenant_id = $1 AND NOT fired AND bookable`,
      [tenantId],
    );
    const staffCount = staffCountRow.n || 1;
    const workingSeconds = tenant.workingHoursPerDay * 3600;
    const occToday = Math.min(100, (Number(todayLoad.total_seconds) / (staffCount * workingSeconds)) * 100);

    const emptySlots = await this.computeEmptySlots(tenantId, reportDate, tenant.timezone);

    const clusters = await this.ds.query(
      `SELECT s.name AS staff_name, EXTRACT(HOUR FROM datetime AT TIME ZONE $2)::int AS hour, COUNT(*)::int AS count
       FROM records r
       JOIN staff s ON s.tenant_id = r.tenant_id AND s.altegio_staff_id = r.altegio_staff_id
       WHERE r.tenant_id = $1 AND r.attendance = -1 AND NOT r.deleted
         AND (r.datetime AT TIME ZONE $2)::date = $3
       GROUP BY s.name, hour
       ORDER BY count DESC LIMIT 3`,
      [tenantId, tenant.timezone, yesterday],
    );

    const completed = yStats ? Number(yStats.visits_completed) : 0;
    const cancelled = yStats ? Number(yStats.visits_cancelled) : 0;
    const cancelRate = completed + cancelled > 0 ? cancelled / (completed + cancelled) : 0;

    return {
      tenant: { id: tenant.id, salonName: tenant.salonName, timezone: tenant.timezone },
      date: yesterday,
      yesterday: {
        revenue: yStats ? Number(yStats.revenue_total) : 0,
        visitsCompleted: completed,
        visitsCancelled: cancelled,
        avgCheck: yStats ? Number(yStats.avg_check) : 0,
        cancelRate,
        cancellationLoss: Number(cancelLoss.loss),
      },
      baseline7d: {
        avgRevenue: Number(baseline.avg_revenue),
        avgVisits: Number(baseline.avg_visits),
        avgCancelRate: Number(baseline.avg_cancel_rate),
      },
      topStaff: topStaff.map((r: any) => ({
        staffId: Number(r.staff_id), name: r.name,
        revenue: Number(r.revenue), visits: Number(r.visits),
      })),
      strugglingStaff: strugglingStaff.map((r: any) => ({
        staffId: Number(r.staff_id), name: r.name,
        consecutiveDaysBelowAvg: Number(r.consecutive_days_below_avg),
      })),
      today: {
        bookedCount: Number(todayLoad.booked),
        occupancyPct: Math.round(occToday * 10) / 10,
        emptySlots,
      },
      cancelClusters: clusters.map((r: any) => ({
        staffName: r.staff_name, hour: Number(r.hour), count: Number(r.count),
      })),
    };
  }

  private subtractDays(date: string, n: number): string {
    const d = new Date(date + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  }

  private async computeEmptySlots(tenantId: string, date: string, tz: string): Promise<string[]> {
    // Simple heuristic: working window 10:00..19:59 local. Return hour strings with zero bookings.
    const hours: string[] = [];
    const rows = await this.ds.query(
      `SELECT DISTINCT EXTRACT(HOUR FROM datetime AT TIME ZONE $2)::int AS hour
       FROM records
       WHERE tenant_id = $1 AND NOT deleted
         AND (datetime AT TIME ZONE $2)::date = $3`,
      [tenantId, tz, date],
    );
    const busy = new Set(rows.map((r: any) => Number(r.hour)));
    for (let h = 10; h <= 19; h++) {
      if (!busy.has(h)) hours.push(`${String(h).padStart(2, '0')}:00`);
    }
    return hours;
  }
}
```

- [ ] **Step 2: Create `metrics.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { TenantsModule } from '../tenants/tenants.module';

@Module({
  imports: [TenantsModule],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
```

- [ ] **Step 3: Wire into AppModule**

Add `MetricsModule` to imports of `apps/api/src/app.module.ts`.

- [ ] **Step 4: Int test `apps/api/test/metrics.int.spec.ts`**

```ts
import { startTestDb, TestDb } from './helpers/test-db';
import { TenantEntity } from '../src/modules/tenants/tenant.entity';
import { TenantsService } from '../src/modules/tenants/tenants.service';
import { TokenCipher } from '../src/modules/tenants/token-cipher.service';
import { AggregatorService } from '../src/modules/sync/aggregator.service';
import { MetricsService } from '../src/modules/metrics/metrics.service';

describe('MetricsService (int)', () => {
  let db: TestDb;
  let tenants: TenantsService;
  let svc: MetricsService;
  let agg: AggregatorService;
  let tenantId: string;

  beforeAll(async () => {
    db = await startTestDb();
    tenants = new TenantsService(db.ds.getRepository(TenantEntity), new TokenCipher(process.env.APP_ENCRYPTION_KEY!));
    agg = new AggregatorService(db.ds);
    svc = new MetricsService(db.ds, tenants);

    const t = await tenants.create({ salonName: 'M', locationId: 1, altegioToken: 't', timezone: 'UTC' });
    tenantId = t.id;

    await db.ds.query(`INSERT INTO staff (tenant_id, altegio_staff_id, name, fired, bookable) VALUES
      ('${tenantId}', 1, 'Alice', false, true),
      ('${tenantId}', 2, 'Bob', false, true)`);

    // Seed records: 2 completed + 1 cancelled yesterday (2026-04-19), 1 today
    await db.ds.query(`INSERT INTO records (tenant_id, altegio_record_id, altegio_staff_id, datetime, seance_length, cost, attendance, paid_full, is_online, deleted) VALUES
      ('${tenantId}', 1, 1, '2026-04-19 10:00+00', 3600, 5000, 1, 1, false, false),
      ('${tenantId}', 2, 1, '2026-04-19 12:00+00', 3600, 7000, 1, 1, false, false),
      ('${tenantId}', 3, 2, '2026-04-19 15:00+00', 3600, 4000, -1, 0, false, false),
      ('${tenantId}', 4, 1, '2026-04-20 11:00+00', 3600, 3000, 0, 0, false, false)`);

    // Seed baseline-week daily_metrics directly for simplicity
    for (const day of ['2026-04-12','2026-04-13','2026-04-14','2026-04-15','2026-04-16','2026-04-17','2026-04-18']) {
      await db.ds.query(`INSERT INTO daily_metrics (tenant_id, date, revenue_total, visits_completed, visits_cancelled, avg_check, occupancy_pct, computed_at) VALUES ('${tenantId}', '${day}', 10000, 5, 1, 2000, 40, now())`);
    }
    await agg.recomputeDay(tenantId, '2026-04-19');
  });

  afterAll(async () => { await db.stop(); });

  it('produces DailyReportData with yesterday stats and top staff', async () => {
    const d = await svc.getDailyReportData(tenantId, '2026-04-20');
    expect(d.yesterday.revenue).toBe(12000);
    expect(d.yesterday.visitsCompleted).toBe(2);
    expect(d.yesterday.visitsCancelled).toBe(1);
    expect(d.yesterday.cancellationLoss).toBe(4000);
    expect(d.topStaff[0].name).toBe('Alice');
    expect(d.today.bookedCount).toBe(1);
  });
});
```

- [ ] **Step 5: Run and commit**

```bash
pnpm test:int test/metrics.int.spec.ts
git add . && git commit -m "feat(metrics): add MetricsService + int test"
```

---

### Task 26: Template renderer — happy path

**Files:**
- Create: `apps/api/src/modules/reports/template.renderer.ts`
- Test: `apps/api/src/modules/reports/template.renderer.spec.ts`

- [ ] **Step 1: Write test**

```ts
import { renderReport } from './template.renderer';
import type { DailyReportData } from '@altegio/shared';

const base: DailyReportData = {
  tenant: { id: 't', salonName: 'Салон №1', timezone: 'Asia/Almaty' },
  date: '2026-04-19',
  yesterday: {
    revenue: 2_340_000, visitsCompleted: 148, visitsCancelled: 41,
    avgCheck: 35_818, cancelRate: 41 / 189, cancellationLoss: 1_400_000,
  },
  baseline7d: { avgRevenue: 2_088_000, avgVisits: 140, avgCancelRate: 0.16 },
  topStaff: [
    { staffId: 1, name: 'Айгуль', revenue: 420_000, visits: 11 },
    { staffId: 2, name: 'Данияр', revenue: 380_000, visits: 9 },
    { staffId: 3, name: 'Асель', revenue: 310_000, visits: 12 },
  ],
  strugglingStaff: [{ staffId: 10, name: 'Марат', consecutiveDaysBelowAvg: 2 }],
  today: { bookedCount: 87, occupancyPct: 61, emptySlots: ['14:00', '18:00', '19:00'] },
  cancelClusters: [{ staffName: 'Айгуль', hour: 16, count: 6 }],
};

describe('renderReport', () => {
  it('renders the happy-path template with all sections', () => {
    const txt = renderReport(base);
    expect(txt).toContain('☀ Доброе утро!');
    expect(txt).toContain('Салон №1');
    expect(txt).toContain('Выручка:');
    expect(txt).toContain('2 340 000 ₸');
    expect(txt).toContain('+12% к среднему за неделю');
    expect(txt).toContain('🏆 Топ-3 мастера');
    expect(txt).toContain('1. Айгуль — 420 000 ₸ (11 визитов)');
    expect(txt).toContain('⚠ Требует внимания');
    expect(txt).toContain('📅 Сегодня');
    expect(txt).toContain('87 записей, загрузка 61%');
    expect(txt).toContain('Пустые слоты: 14:00, 18:00, 19:00');
  });

  it('hides attention section when no rule triggers', () => {
    const quiet = {
      ...base,
      yesterday: { ...base.yesterday, cancelRate: 0.15, cancellationLoss: 50_000 },
      strugglingStaff: [],
      today: { ...base.today, occupancyPct: 70 },
    };
    expect(renderReport(quiet)).not.toContain('⚠ Требует внимания');
  });

  it('omits delta text when |delta| < 3%', () => {
    const close = { ...base, baseline7d: { ...base.baseline7d, avgRevenue: base.yesterday.revenue * 1.01 } };
    const txt = renderReport(close);
    const line = txt.split('\n').find((l) => l.startsWith('• Выручка'))!;
    expect(line).not.toMatch(/[+−]\d+%/);
  });

  it('shows "визитов не было" on empty days', () => {
    const empty = {
      ...base,
      yesterday: { revenue: 0, visitsCompleted: 0, visitsCancelled: 0, avgCheck: 0, cancelRate: 0, cancellationLoss: 0 },
      topStaff: [],
    };
    expect(renderReport(empty)).toContain('визитов не было');
  });

  it('drops empty-slots line when none', () => {
    const noSlots = { ...base, today: { ...base.today, emptySlots: [] } };
    const txt = renderReport(noSlots);
    expect(txt).not.toContain('Пустые слоты:');
  });
});
```

- [ ] **Step 2: Implement `template.renderer.ts`**

```ts
import type { DailyReportData } from '@altegio/shared';

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
```

- [ ] **Step 3: Run test and commit**

```bash
pnpm test src/modules/reports/template.renderer.spec.ts
git add . && git commit -m "feat(reports): add template renderer + buildAttention rules"
```

---

### Task 27: buildAttention edge cases + matrix test

**Files:**
- Extend: `apps/api/src/modules/reports/template.renderer.spec.ts`

- [ ] **Step 1: Append matrix test**

```ts
describe('buildAttention rules matrix', () => {
  const base: DailyReportData = { /* copy base from prior test */ } as any;

  it('triggers cancel-spike bullet at 1.3x baseline', () => {
    const d = { ...base, baseline7d: { ...base.baseline7d, avgCancelRate: 0.10 } };
    // cancelRate 0.14 > 0.13 baseline threshold → triggers
    expect(buildAttention({
      ...d,
      yesterday: { ...d.yesterday, cancelRate: 0.14, visitsCancelled: 10, cancellationLoss: 300_000 },
    })[0]).toMatch(/Рост отмен/);
  });

  it('does not trigger struggling bullet when list is empty', () => {
    const d = { ...base, strugglingStaff: [] };
    expect(buildAttention(d).every((b) => !b.includes('день подряд'))).toBe(true);
  });

  it('caps bullets at 3', () => {
    const d = {
      ...base,
      baseline7d: { ...base.baseline7d, avgCancelRate: 0.05 },
      yesterday: { ...base.yesterday, cancelRate: 0.5, visitsCancelled: 80, cancellationLoss: 9e6 },
      strugglingStaff: [
        { staffId: 1, name: 'X', consecutiveDaysBelowAvg: 2 },
        { staffId: 2, name: 'Y', consecutiveDaysBelowAvg: 2 },
      ],
      today: { ...base.today, occupancyPct: 20 },
    };
    expect(buildAttention(d).length).toBe(3);
  });
});
```

(Reuse `base` fixture by extracting to `apps/api/src/modules/reports/__fixtures__/report-data.ts` and importing in both describe blocks to avoid duplication.)

- [ ] **Step 2: Run and commit**

```bash
pnpm test src/modules/reports/template.renderer.spec.ts
git add . && git commit -m "test(reports): add buildAttention rule matrix"
```

---

### Task 28: ReportsService (assembly, no AI yet, no delivery yet)

**Files:**
- Create: `apps/api/src/modules/reports/reports.service.ts`, `apps/api/src/modules/reports/reports.module.ts`

- [ ] **Step 1: Implement `reports.service.ts`** (skeleton that will grow in Task 30 and 33)

```ts
import { Injectable, Logger } from '@nestjs/common';
import { MetricsService } from '../metrics/metrics.service';
import { renderReport } from './template.renderer';

@Injectable()
export class ReportsService {
  private readonly log = new Logger(ReportsService.name);

  constructor(private readonly metrics: MetricsService) {}

  /**
   * Build report text (no AI, no delivery yet). Returns the plain text.
   */
  async buildText(tenantId: string, reportDate: string): Promise<string> {
    const data = await this.metrics.getDailyReportData(tenantId, reportDate);
    const text = renderReport(data);
    this.log.debug(`Report built for ${tenantId} ${reportDate}: ${text.length} chars`);
    return text;
  }
}
```

- [ ] **Step 2: Create `reports.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { MetricsModule } from '../metrics/metrics.module';
import { ReportsService } from './reports.service';

@Module({
  imports: [MetricsModule],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
```

- [ ] **Step 3: Wire into AppModule and commit**

```bash
# edit apps/api/src/app.module.ts → add ReportsModule
git add . && git commit -m "feat(reports): add ReportsService skeleton"
```

---

## Milestone 8 — AI insight (Tasks 29-30)

### Task 29: AI insight service with guardrails

**Files:**
- Create: `apps/api/src/modules/reports/ai-insight.service.ts`, `apps/api/src/modules/reports/entities/ai-insight-log.entity.ts` (exists from Task 10)
- Test: `apps/api/src/modules/reports/ai-insight.service.spec.ts`

- [ ] **Step 1: Install deps**

```bash
pnpm add -F @altegio/api @anthropic-ai/sdk bottleneck
```

- [ ] **Step 2: Write test**

```ts
import { AiInsightService, IAnthropicAdapter } from './ai-insight.service';
import type { DailyReportData } from '@altegio/shared';

function fakeAdapter(response: string | Error, delayMs = 0): IAnthropicAdapter {
  return {
    generate: async () => {
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      if (response instanceof Error) throw response;
      return response;
    },
  };
}

function repo() {
  const saved: any[] = [];
  return { save: jest.fn(async (x: any) => { saved.push(x); return x; }), _saved: saved } as any;
}

const sample: DailyReportData = {
  tenant: { id: 't', salonName: 'Test', timezone: 'Asia/Almaty' },
  date: '2026-04-19',
  yesterday: { revenue: 100000, visitsCompleted: 10, visitsCancelled: 3, avgCheck: 10000, cancelRate: 0.23, cancellationLoss: 30000 },
  baseline7d: { avgRevenue: 120000, avgVisits: 12, avgCancelRate: 0.15 },
  topStaff: [], strugglingStaff: [], today: { bookedCount: 5, occupancyPct: 40, emptySlots: [] },
  cancelClusters: [],
};

describe('AiInsightService', () => {
  it('returns text when model produces short, plausible insight', async () => {
    const svc = new AiInsightService(fakeAdapter('Отмены выросли до 23%. Возможная причина — переполненное расписание.'), repo() as any, { enabled: true });
    expect(await svc.getInsight(sample)).toMatch(/Отмены/);
  });

  it('returns null on timeout', async () => {
    const svc = new AiInsightService(fakeAdapter('too late', 200), repo() as any, { enabled: true, timeoutMs: 50 });
    expect(await svc.getInsight(sample)).toBeNull();
  });

  it('rejects responses longer than 280 chars', async () => {
    const svc = new AiInsightService(fakeAdapter('а'.repeat(500)), repo() as any, { enabled: true });
    expect(await svc.getInsight(sample)).toBeNull();
  });

  it('rejects responses with fabricated numbers', async () => {
    const svc = new AiInsightService(fakeAdapter('Выручка составила 99999 ₸.'), repo() as any, { enabled: true });
    expect(await svc.getInsight(sample)).toBeNull();
  });

  it('returns null when disabled', async () => {
    const svc = new AiInsightService(fakeAdapter('anything'), repo() as any, { enabled: false });
    expect(await svc.getInsight(sample)).toBeNull();
  });
});
```

- [ ] **Step 3: Implement `ai-insight.service.ts`**

```ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import Bottleneck from 'bottleneck';
import { AiInsightLogEntity } from './entities/ai-insight-log.entity';
import type { DailyReportData } from '@altegio/shared';
import { loadConfig } from '../../config/app.config';

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
      const status = err?.message === 'timeout' ? 'timeout' : 'api_error';
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
    await this.logs.save(this.logs.create({
      tenantId: data.tenant.id, date: data.date,
      promptHash, response, ms, status,
    }));
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
  const allowed = collectAllowedNumbers(data);
  const found = Array.from(text.matchAll(/\d+/g)).map((m) => Number(m[0]));
  for (const n of found) {
    if (n === 0 || n === 1 || n === 2 || n === 3) continue; // trivial
    if (!allowed.some((a) => a === n || (Math.abs(a - n) / Math.max(1, a)) < 0.02)) {
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

/** Production adapter wired to the real Anthropic client. */
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
```

- [ ] **Step 4: Wire into ReportsModule**

Edit `apps/api/src/modules/reports/reports.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MetricsModule } from '../metrics/metrics.module';
import { ReportsService } from './reports.service';
import { AiInsightService, AnthropicAdapter, IAnthropicAdapter } from './ai-insight.service';
import { AiInsightLogEntity } from './entities/ai-insight-log.entity';
import { loadConfig } from '../../config/app.config';

const ANTHROPIC_ADAPTER = 'ANTHROPIC_ADAPTER';

@Module({
  imports: [MetricsModule, TypeOrmModule.forFeature([AiInsightLogEntity])],
  providers: [
    ReportsService,
    {
      provide: ANTHROPIC_ADAPTER,
      useFactory: (): IAnthropicAdapter => {
        const cfg = loadConfig();
        if (!cfg.ANTHROPIC_API_KEY) {
          return { generate: async () => { throw new Error('ANTHROPIC_API_KEY not set'); } };
        }
        return new AnthropicAdapter(cfg.ANTHROPIC_API_KEY);
      },
    },
    {
      provide: AiInsightService,
      inject: [ANTHROPIC_ADAPTER, getRepositoryToken(AiInsightLogEntity)],
      useFactory: (adapter: IAnthropicAdapter, logs: Repository<AiInsightLogEntity>) => {
        const cfg = loadConfig();
        return new AiInsightService(adapter, logs, {
          enabled: Boolean(cfg.ANTHROPIC_API_KEY),
          timeoutMs: 3000,
          model: cfg.ANTHROPIC_MODEL,
        });
      },
    },
  ],
  exports: [ReportsService, AiInsightService],
})
export class ReportsModule {}
```

- [ ] **Step 5: Verify unit tests**

```bash
pnpm test src/modules/reports/ai-insight.service.spec.ts
```
Expected: 5/5 pass.

- [ ] **Step 6: Commit**

```bash
git add . && git commit -m "feat(reports): add AiInsightService with guardrails"
```

---

### Task 30: Extend ReportsService to include AI insight

**Files:**
- Modify: `apps/api/src/modules/reports/reports.service.ts`

- [ ] **Step 1: Update `reports.service.ts`**

```ts
import { Injectable, Logger } from '@nestjs/common';
import { MetricsService } from '../metrics/metrics.service';
import { renderReport } from './template.renderer';
import { AiInsightService } from './ai-insight.service';

@Injectable()
export class ReportsService {
  private readonly log = new Logger(ReportsService.name);

  constructor(
    private readonly metrics: MetricsService,
    private readonly ai: AiInsightService,
  ) {}

  async buildText(tenantId: string, reportDate: string): Promise<string> {
    const data = await this.metrics.getDailyReportData(tenantId, reportDate);
    const base = renderReport(data);
    const insight = await this.ai.getInsight(data);
    if (insight) {
      return `${base}\n\n💡 Главный инсайт\n${insight}`;
    }
    return base;
  }
}
```

- [ ] **Step 2: Add a unit test stubbing MetricsService + AI**

Create `apps/api/src/modules/reports/reports.service.spec.ts`:

```ts
import { ReportsService } from './reports.service';

describe('ReportsService', () => {
  const fakeMetrics = { getDailyReportData: jest.fn() };
  const fakeAi = { getInsight: jest.fn() };

  it('appends insight when AI returns text', async () => {
    fakeMetrics.getDailyReportData.mockResolvedValue({
      tenant: { id: 't', salonName: 'S', timezone: 'UTC' },
      date: '2026-04-19',
      yesterday: { revenue: 0, visitsCompleted: 0, visitsCancelled: 0, avgCheck: 0, cancelRate: 0, cancellationLoss: 0 },
      baseline7d: { avgRevenue: 0, avgVisits: 0, avgCancelRate: 0 },
      topStaff: [], strugglingStaff: [],
      today: { bookedCount: 0, occupancyPct: 0, emptySlots: [] },
      cancelClusters: [],
    });
    fakeAi.getInsight.mockResolvedValue('Главный факт.');
    const svc = new ReportsService(fakeMetrics as any, fakeAi as any);
    const text = await svc.buildText('t', '2026-04-20');
    expect(text).toContain('💡 Главный инсайт');
    expect(text).toContain('Главный факт.');
  });

  it('falls back gracefully when AI returns null', async () => {
    fakeMetrics.getDailyReportData.mockResolvedValue({
      tenant: { id: 't', salonName: 'S', timezone: 'UTC' },
      date: '2026-04-19',
      yesterday: { revenue: 0, visitsCompleted: 0, visitsCancelled: 0, avgCheck: 0, cancelRate: 0, cancellationLoss: 0 },
      baseline7d: { avgRevenue: 0, avgVisits: 0, avgCancelRate: 0 },
      topStaff: [], strugglingStaff: [],
      today: { bookedCount: 0, occupancyPct: 0, emptySlots: [] },
      cancelClusters: [],
    });
    fakeAi.getInsight.mockResolvedValue(null);
    const svc = new ReportsService(fakeMetrics as any, fakeAi as any);
    const text = await svc.buildText('t', '2026-04-20');
    expect(text).not.toContain('Главный инсайт');
  });
});
```

- [ ] **Step 3: Verify tests and commit**

```bash
pnpm test src/modules/reports/reports.service.spec.ts
git add . && git commit -m "feat(reports): integrate AI insight into ReportsService"
```

---

## Milestone 9 — Telegram delivery + end-to-end CLI (Tasks 31-33)

### Task 31: Telegram sender service

**Files:**
- Create: `apps/api/src/modules/telegram/telegram.service.ts`, `apps/api/src/modules/telegram/telegram.module.ts`

- [ ] **Step 1: Install deps**

```bash
pnpm add -F @altegio/api telegraf
```

- [ ] **Step 2: Implement `telegram.service.ts`**

```ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Telegraf } from 'telegraf';
import { loadConfig } from '../../config/app.config';

export interface ITelegramSender {
  sendReport(chatId: number, text: string): Promise<{ messageId: number }>;
}

@Injectable()
export class TelegramService implements ITelegramSender {
  private readonly log = new Logger(TelegramService.name);
  private readonly bot: Telegraf | null;

  constructor() {
    const cfg = loadConfig();
    this.bot = cfg.TELEGRAM_BOT_TOKEN ? new Telegraf(cfg.TELEGRAM_BOT_TOKEN) : null;
  }

  async sendReport(chatId: number, text: string): Promise<{ messageId: number }> {
    if (!this.bot) {
      this.log.warn(`[dry-run] Would send to ${chatId}:\n${text}`);
      return { messageId: 0 };
    }
    let attempts = 0;
    while (attempts < 2) {
      try {
        const msg = await this.bot.telegram.sendMessage(chatId, text, { disable_web_page_preview: true });
        return { messageId: msg.message_id };
      } catch (err: any) {
        attempts++;
        if (err?.response?.error_code === 403) throw err; // blocked — no retry
        if (attempts >= 2) throw err;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    throw new Error('unreachable');
  }
}
```

- [ ] **Step 3: Create `telegram.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';

@Module({
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
```

- [ ] **Step 4: Commit**

```bash
git add . && git commit -m "feat(telegram): add TelegramService sender"
```

---

### Task 32: Extend ReportsService to deliver + persist

**Files:**
- Modify: `apps/api/src/modules/reports/reports.service.ts`
- Modify: `apps/api/src/modules/reports/reports.module.ts`

- [ ] **Step 1: Update `reports.service.ts`**

```ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MetricsService } from '../metrics/metrics.service';
import { renderReport } from './template.renderer';
import { AiInsightService } from './ai-insight.service';
import { TelegramService } from '../telegram/telegram.service';
import { TenantsService } from '../tenants/tenants.service';
import { ReportDeliveryEntity } from './entities/report-delivery.entity';

@Injectable()
export class ReportsService {
  private readonly log = new Logger(ReportsService.name);

  constructor(
    private readonly metrics: MetricsService,
    private readonly ai: AiInsightService,
    private readonly telegram: TelegramService,
    private readonly tenants: TenantsService,
    @InjectRepository(ReportDeliveryEntity) private readonly deliveries: Repository<ReportDeliveryEntity>,
  ) {}

  async buildText(tenantId: string, reportDate: string): Promise<string> {
    const data = await this.metrics.getDailyReportData(tenantId, reportDate);
    const base = renderReport(data);
    const insight = await this.ai.getInsight(data);
    return insight ? `${base}\n\n💡 Главный инсайт\n${insight}` : base;
  }

  /**
   * Idempotent delivery. If (tenant, date) already has a 'sent' row, skip.
   */
  async generateAndDeliver(tenantId: string, reportDate: string): Promise<void> {
    // Yesterday is what the report is about; use it as the delivery date key
    const deliveryDate = this.subtractDays(reportDate, 1);

    const existing = await this.deliveries.findOne({ where: { tenantId, date: deliveryDate } });
    if (existing?.status === 'sent') {
      this.log.log(`Report already sent for ${tenantId} ${deliveryDate}, skip`);
      return;
    }

    const tenant = await this.tenants.findById(tenantId);
    if (!tenant) throw new Error(`Tenant ${tenantId} not found`);
    if (!tenant.telegramChatId) throw new Error(`Tenant ${tenantId} has no telegram_chat_id`);

    const text = await this.buildText(tenantId, reportDate);

    try {
      const { messageId } = await this.telegram.sendReport(Number(tenant.telegramChatId), text);
      await this.deliveries.upsert(
        { tenantId, date: deliveryDate, messageId: messageId || null, sentAt: new Date(), status: 'sent', error: null },
        ['tenantId', 'date'],
      );
      this.log.log(`Report delivered to ${tenant.salonName} (${deliveryDate})`);
    } catch (err: any) {
      await this.deliveries.upsert(
        { tenantId, date: deliveryDate, status: 'failed', error: String(err?.message ?? err).slice(0, 2000) },
        ['tenantId', 'date'],
      );
      throw err;
    }
  }

  private subtractDays(date: string, n: number): string {
    const d = new Date(date + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  }
}
```

- [ ] **Step 2: Update `reports.module.ts`**

Add imports: `TelegramModule`, `TenantsModule`, and `TypeOrmModule.forFeature([ReportDeliveryEntity, AiInsightLogEntity])`.

- [ ] **Step 3: Commit**

```bash
git add . && git commit -m "feat(reports): add generateAndDeliver with idempotency"
```

---

### Task 33: CLI `trigger-report` + end-to-end dry run

**Files:**
- Create: `apps/cli/src/commands/trigger-report.ts`
- Modify: `apps/cli/src/main.ts`

- [ ] **Step 1: Create command**

```ts
import { Command } from 'commander';
import { bootstrapApp } from '../bootstrap';
import { ReportsService } from '../../../api/src/modules/reports/reports.service';

export function triggerReportCommand(): Command {
  return new Command('trigger-report')
    .description('Build and deliver a morning report for a tenant')
    .requiredOption('--tenant <id>', 'Tenant UUID')
    .option('--date <yyyy-mm-dd>', 'Report date (today if omitted)', new Date().toISOString().slice(0, 10))
    .option('--dry-run', 'Print message only, skip Telegram send')
    .action(async (opts) => {
      const app = await bootstrapApp();
      const svc = app.get(ReportsService);
      if (opts.dryRun) {
        const txt = await svc.buildText(opts.tenant, opts.date);
        console.log('---8<---\n' + txt + '\n---8<---');
      } else {
        await svc.generateAndDeliver(opts.tenant, opts.date);
        console.log('Delivered.');
      }
      await app.close();
    });
}
```

- [ ] **Step 2: Register in `main.ts`**

Add `program.addCommand(triggerReportCommand());`.

- [ ] **Step 3: Run end-to-end dry run against BrowUp**

```bash
pnpm cli trigger-sync --tenant <uuid> --days 30
pnpm cli trigger-report --tenant <uuid> --date 2026-04-20 --dry-run
```
Expected: prints a formatted Russian-language morning report using real BrowUp data.

- [ ] **Step 4: Commit**

```bash
git add . && git commit -m "feat(cli): add trigger-report with dry-run"
```

---

## Milestone 10 — Scheduler + Reports processor (Tasks 34-35)

### Task 34: Reports processor (BullMQ consumer)

**Files:**
- Create: `apps/api/src/modules/reports/reports.processor.ts`

- [ ] **Step 1: Create processor**

```ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ReportsService } from './reports.service';

export interface ReportJobData {
  tenantId: string;
  reportDate: string;
}

@Processor('reports', { concurrency: 4 })
export class ReportsProcessor extends WorkerHost {
  private readonly log = new Logger(ReportsProcessor.name);

  constructor(private readonly reports: ReportsService) {
    super();
  }

  async process(job: Job<ReportJobData>): Promise<void> {
    const { tenantId, reportDate } = job.data;
    this.log.log(`Report job start: tenant=${tenantId} date=${reportDate}`);
    await this.reports.generateAndDeliver(tenantId, reportDate);
    this.log.log(`Report job done: tenant=${tenantId} date=${reportDate}`);
  }
}
```

- [ ] **Step 2: Register processor in `reports.module.ts`**

Add to providers: `ReportsProcessor`. Import `BullModule.registerQueue({ name: 'reports' })` in the same module (or reuse `QueuesModule`).

- [ ] **Step 3: Commit**

```bash
git add . && git commit -m "feat(reports): add BullMQ processor"
```

---

### Task 35: Scheduler — per-tenant cron

**Files:**
- Create: `apps/api/src/modules/scheduler/scheduler.service.ts`, `apps/api/src/modules/scheduler/scheduler.module.ts`

- [ ] **Step 1: Install scheduler**

```bash
pnpm add -F @altegio/api @nestjs/schedule
```

- [ ] **Step 2: Create `scheduler.service.ts`**

```ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TenantsService } from '../tenants/tenants.service';

@Injectable()
export class SchedulerService {
  private readonly log = new Logger(SchedulerService.name);

  constructor(
    private readonly tenants: TenantsService,
    @InjectQueue('reports') private readonly reportsQueue: Queue,
    @InjectQueue('sync') private readonly syncQueue: Queue,
  ) {}

  /** Every minute — check which tenants should have their morning report kicked off now. */
  @Cron('0 * * * * *')
  async tickReports(): Promise<void> {
    const tenants = await this.tenants.findEnabled();
    const now = new Date();
    for (const t of tenants) {
      if (!t.telegramChatId) continue;
      const local = this.localTimeHHMM(now, t.timezone);
      if (local !== t.reportTime.slice(0, 5)) continue;
      const reportDate = this.localDate(now, t.timezone);
      await this.reportsQueue.add(
        'generate-report',
        { tenantId: t.id, reportDate },
        { jobId: `${t.id}:${reportDate}`, removeOnComplete: true, removeOnFail: false },
      );
      this.log.log(`Enqueued report for ${t.salonName} (${reportDate})`);
    }
  }

  /** Every 6 hours on the hour — sync all enabled tenants. */
  @Cron('0 0 */6 * * *')
  async tickSync(): Promise<void> {
    const tenants = await this.tenants.findEnabled();
    for (const t of tenants) {
      await this.syncQueue.add(
        'sync',
        { tenantId: t.id, days: 3 },
        { jobId: `sync:${t.id}:${Date.now()}`, removeOnComplete: true, removeOnFail: 10 },
      );
    }
    this.log.log(`Enqueued sync for ${tenants.length} tenants`);
  }

  private localTimeHHMM(d: Date, tz: string): string {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(d);
  }

  private localDate(d: Date, tz: string): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(d);
  }
}
```

- [ ] **Step 3: Create `scheduler.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { SchedulerService } from './scheduler.service';
import { TenantsModule } from '../tenants/tenants.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    BullModule.registerQueue({ name: 'reports' }, { name: 'sync' }),
    TenantsModule,
  ],
  providers: [SchedulerService],
})
export class SchedulerModule {}
```

- [ ] **Step 4: Wire into AppModule**

Add `SchedulerModule` to `AppModule` imports.

- [ ] **Step 5: Commit**

```bash
git add . && git commit -m "feat(scheduler): add per-minute cron that enqueues reports"
```

---

## Milestone 11 — Health, observability, deployment (Tasks 36-40)

### Task 36: Health endpoint + Sentry

**Files:**
- Create: `apps/api/src/modules/health/health.controller.ts`, `apps/api/src/modules/health/health.module.ts`
- Modify: `apps/api/src/main.ts`

- [ ] **Step 1: Install Sentry**

```bash
pnpm add -F @altegio/api @sentry/node
```

- [ ] **Step 2: Create `health.controller.ts`**

```ts
import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  @Get()
  async get(): Promise<{ status: string; db: 'up' | 'down'; uptime: number }> {
    let db: 'up' | 'down' = 'up';
    try {
      await this.ds.query('SELECT 1');
    } catch {
      db = 'down';
    }
    return { status: db === 'up' ? 'ok' : 'degraded', db, uptime: Math.round(process.uptime()) };
  }
}
```

- [ ] **Step 3: Create `health.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

@Module({ controllers: [HealthController] })
export class HealthModule {}
```

- [ ] **Step 4: Wire Sentry into `main.ts`**

```ts
import 'reflect-metadata';
import * as Sentry from '@sentry/node';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  if (process.env.SENTRY_DSN) {
    Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV });
  }

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  Logger.log(`API listening on :${port}`, 'Bootstrap');

  process.on('unhandledRejection', (err) => Sentry.captureException(err));
  process.on('uncaughtException', (err) => Sentry.captureException(err));
}

void bootstrap();
```

- [ ] **Step 5: Test**

```bash
curl http://localhost:3000/health
```
Expected: `{"status":"ok","db":"up","uptime":N}`

- [ ] **Step 6: Commit**

```bash
git add . && git commit -m "feat(health): add /health endpoint and Sentry wiring"
```

---

### Task 37: Production Dockerfile + entrypoint

**Files:**
- Create: `apps/api/Dockerfile`, `apps/api/entrypoint.sh`

- [ ] **Step 1: Create `apps/api/Dockerfile`**

```dockerfile
# ---- build ----
FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/tsconfig.json apps/api/nest-cli.json ./apps/api/
COPY apps/cli/package.json apps/cli/tsconfig.json ./apps/cli/
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
RUN pnpm install --frozen-lockfile

COPY packages/shared ./packages/shared
RUN pnpm -F @altegio/shared build

COPY apps/api ./apps/api
COPY apps/cli ./apps/cli
RUN pnpm -F @altegio/api build && pnpm -F @altegio/cli build

RUN pnpm deploy --filter=@altegio/api --prod /app/deploy
# Copy built CLI into the deploy tree so the runtime image has both
RUN mkdir -p /app/deploy/cli && cp -R apps/cli/dist /app/deploy/cli/dist

# ---- runtime ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/deploy ./
COPY apps/api/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
```

- [ ] **Step 2: Create `apps/api/entrypoint.sh`**

```bash
#!/bin/sh
set -e

echo "Running migrations..."
node node_modules/typeorm/cli.js migration:run -d dist/db/data-source.js

echo "Starting API..."
exec node dist/main.js
```

- [ ] **Step 3: Build locally to verify**

```bash
docker build -f apps/api/Dockerfile -t altegio-ai/api:dev .
```
Expected: builds successfully.

- [ ] **Step 4: Commit**

```bash
git add . && git commit -m "chore(docker): add production Dockerfile and entrypoint"
```

---

### Task 38: Production docker-compose + nginx

**Files:**
- Create: `docker/docker-compose.prod.yml`, `deploy/nginx.conf`, `deploy/vps-setup.sh`, `deploy/deploy.sh`

- [ ] **Step 1: Create `docker/docker-compose.prod.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    restart: always
    environment:
      POSTGRES_DB: altegio_ai
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d altegio_ai"]
      interval: 10s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: always
    volumes:
      - redisdata:/data

  api:
    image: ghcr.io/${GHCR_OWNER}/altegio-ai-api:latest
    restart: always
    env_file: ../.env
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_started }
    ports:
      - "127.0.0.1:3000:3000"

  nginx:
    image: nginx:alpine
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ../deploy/nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
    depends_on: [api]

volumes:
  pgdata:
  redisdata:
```

- [ ] **Step 2: Create `deploy/nginx.conf`**

```nginx
server {
    listen 80;
    server_name api.altegio-ai.example;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.altegio-ai.example;

    ssl_certificate /etc/letsencrypt/live/api.altegio-ai.example/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.altegio-ai.example/privkey.pem;

    client_max_body_size 4m;

    location /health {
        proxy_pass http://api:3000;
        access_log off;
    }

    location / {
        proxy_pass http://api:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

Note: replace `api.altegio-ai.example` with the real domain before running.

- [ ] **Step 3: Create `deploy/vps-setup.sh`** (run once on a fresh VPS)

```bash
#!/bin/bash
set -e

echo "Installing Docker..."
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

echo "Installing certbot..."
apt-get update && apt-get install -y certbot python3-certbot-nginx

echo "Creating app user..."
useradd -m -s /bin/bash altegio || true
usermod -aG docker altegio

echo "Cloning repo..."
sudo -u altegio git clone https://github.com/azamat02/altegio-ai.git /home/altegio/altegio-ai

echo "Copy .env from template; fill secrets manually."
sudo -u altegio cp /home/altegio/altegio-ai/.env.example /home/altegio/altegio-ai/.env
echo "Done. Next: edit /home/altegio/altegio-ai/.env and run deploy/deploy.sh"
```

- [ ] **Step 4: Create `deploy/deploy.sh`**

```bash
#!/bin/bash
set -e

cd /home/altegio/altegio-ai
git pull origin main
docker compose -f docker/docker-compose.prod.yml pull
docker compose -f docker/docker-compose.prod.yml up -d
docker image prune -f
echo "Deploy complete."
```

- [ ] **Step 5: Commit**

```bash
chmod +x deploy/*.sh apps/api/entrypoint.sh
git add . && git commit -m "chore(deploy): add prod compose, nginx, vps-setup, deploy scripts"
```

---

### Task 39: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create `ci.yml`**

```yaml
name: CI

on:
  push: { branches: [main] }
  pull_request:

jobs:
  lint-test-build:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: altegio_test
        options: >-
          --health-cmd "pg_isready -U test" --health-interval 5s --health-retries 5
        ports: ['5432:5432']
      redis:
        image: redis:7-alpine
        ports: ['6379:6379']
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm -F @altegio/shared build
      - run: pnpm -F @altegio/api test
      - env:
          DATABASE_URL: postgresql://test:test@localhost:5432/altegio_test
          REDIS_URL: redis://localhost:6379
          ALTEGIO_PARTNER_TOKEN: test
          APP_ENCRYPTION_KEY: ${{ github.sha }}0000000000000000000000000000000000000000000000000000
        run: pnpm -F @altegio/api test:int
      - run: pnpm -F @altegio/api build

  publish-image:
    needs: lint-test-build
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    permissions: { contents: read, packages: write }
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v5
        with:
          context: .
          file: apps/api/Dockerfile
          push: true
          tags: ghcr.io/${{ github.repository_owner }}/altegio-ai-api:latest
```

- [ ] **Step 2: Commit**

```bash
git add . && git commit -m "ci: add GitHub Actions workflow"
```

---

### Task 40: First live run — BrowUp onboarding and verification

**Files:**
- None new

- [ ] **Step 1: Fill the `.env` on VPS**

```bash
ssh altegio@<vps-host>
cd /home/altegio/altegio-ai
nano .env   # paste real tokens, DB password, encryption key, Sentry DSN
```

- [ ] **Step 2: Run initial deploy**

```bash
./deploy/deploy.sh
```

Expected: `altegio_ai_api`, `postgres`, `redis`, `nginx` containers are up. `docker compose ps` shows all healthy.

- [ ] **Step 3: Seed BrowUp tenant**

From the VPS:

```bash
docker compose -f docker/docker-compose.prod.yml exec api \
  node cli/dist/main.js add-salon \
    --name "Салон №1, Алматы" \
    --location-id 198823 \
    --token 3nhhg28zsrc6wx84e8xk \
    --timezone Asia/Almaty
```

The CLI is bundled into the same image (see Task 37 Dockerfile — `cli/dist` directory).

Record the resulting tenant UUID.

- [ ] **Step 4: Link Telegram**

Start a conversation with `@AltegioAIBot` from the owner's Telegram account, then find the chat ID (via `getUpdates`):

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getUpdates" | jq '.result[].message.chat.id'
```

```bash
docker compose -f docker/docker-compose.prod.yml exec api \
  node cli/dist/main.js link-telegram --tenant <uuid> --chat <chat_id> --enable
```

- [ ] **Step 5: Backfill 30 days + dry run**

```bash
docker compose -f docker/docker-compose.prod.yml exec api \
  node cli/dist/main.js trigger-sync --tenant <uuid> --days 30
docker compose -f docker/docker-compose.prod.yml exec api \
  node cli/dist/main.js trigger-report --tenant <uuid> --date $(date +%F) --dry-run
```

Expected: a fully-formatted Russian morning report prints, with real numbers.

- [ ] **Step 6: Trigger real delivery**

```bash
docker compose -f docker/docker-compose.prod.yml exec api \
  node cli/dist/main.js trigger-report --tenant <uuid> --date $(date +%F)
```

Expected: a Telegram message arrives in the owner's chat.

- [ ] **Step 7: Verify idempotency**

Run the same command again.

Expected: log says `Report already sent for ... skip`; no second Telegram message arrives.

- [ ] **Step 8: Verify scheduler will fire tomorrow at 09:00 Almaty**

Inspect the cron-enqueued jobs:

```bash
docker compose -f docker/docker-compose.prod.yml logs -f api | grep -i scheduler
```

Wait until 09:00 Almaty; a new `report_deliveries` row should appear:

```bash
docker compose -f docker/docker-compose.prod.yml exec postgres \
  psql -U altegio -d altegio_ai -c "SELECT tenant_id, date, status, sent_at FROM report_deliveries ORDER BY sent_at DESC LIMIT 5"
```

- [ ] **Step 9: Capture acceptance evidence**

Record:
- Screenshot of the Telegram message
- `SELECT` output from step 8
- Sentry dashboard shows zero errors

Commit a brief write-up to `docs/superpowers/plans/2026-04-20-altegio-ai-phase-1-acceptance.md` with these artifacts referenced.

- [ ] **Step 10: Phase 1 complete — tag release**

```bash
git tag v0.1.0-phase1
git push origin v0.1.0-phase1
```

---

## Running totals

- Tasks: 40
- Migrations: 5 (`pgcrypto`, `tenants`, `raw`, `facts`, `aggregates`, `infra` — 6 if you count pgcrypto separately)
- Services with tests: `TokenCipher`, `TenantsService`, `AltegioClient`, `RawWriter`, parsers (records/staff/services/clients), `Aggregator` (int), `SyncService` (int), `MetricsService` (int), `template.renderer`, `buildAttention`, `AiInsightService`, `ReportsService`

## Self-review (to be done after writing)

Checked for:
- Placeholder scan
- Type consistency across tasks (e.g. `DailyReportData` shape matches between Task 12 definition and Task 25 producer, Task 26 consumer)
- Spec coverage (each section of the spec maps to at least one task)

<!-- plan complete -->
