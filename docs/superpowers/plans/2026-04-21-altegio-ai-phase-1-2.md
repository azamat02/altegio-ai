# Phase 1.2 — Telegram Bot Commands & Multi-Chat Subscriptions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить in-bot команды (`/start`, `/help`, `/link`, `/report`, `/status`, `/subscribe`, `/unsubscribe`, `/invite`, `/sync`), поддержку нескольких подписанных чатов на тенант и мульти-тенант подписку на один чат.

**Architecture:** Новый Nest-модуль `apps/api/src/modules/telegram-bot/` поднимает Telegraf long-polling в `onModuleInit`, защищённый postgres advisory lock. N:M-связь `tenant_chats` заменяет логику одного chat на тенант. PK `report_deliveries` расширяется до `(tenant_id, date, message_kind, chat_id)` для per-chat идемпотентности fan-out.

**Tech Stack:** NestJS, TypeORM, Telegraf 4, BullMQ, PostgreSQL, Jest, testcontainers. Target Node 20.

**Spec:** `docs/superpowers/specs/2026-04-21-phase-1-2-bot-commands-design.md`

---

## File Structure

**New files:**
```
apps/api/src/db/migrations/
  1700000011000-CreateTenantChats.ts
  1700000012000-CreateTelegramInviteCodes.ts
  1700000013000-CreateTelegramBotLogs.ts
  1700000014000-ExtendReportDeliveriesPk.ts

apps/api/src/modules/telegram-bot/
  telegram-bot.module.ts
  telegram-bot.service.ts
  invite-code.service.ts
  invite-code.service.spec.ts
  tenant-chats.service.ts
  tenant-chats.service.spec.ts
  bot-logs.service.ts
  bot-logs.service.spec.ts
  entities/
    tenant-chat.entity.ts
    telegram-invite-code.entity.ts
    telegram-bot-log.entity.ts
  middleware/
    resolve-chat.middleware.ts
    require-linked.middleware.ts
    require-owner.middleware.ts
    rate-limit.middleware.ts
    middleware.spec.ts
  commands/
    start.handler.ts
    help.handler.ts
    link.handler.ts
    report.handler.ts
    status.handler.ts
    subscribe.handler.ts
    unsubscribe.handler.ts
    invite.handler.ts
    sync.handler.ts
    commands.spec.ts
  utils/
    tenant-picker.ts
    context.ts
```

**Modified:**
- `apps/api/src/modules/reports/entities/report-delivery.entity.ts` — add `chatId` primary column.
- `apps/api/src/modules/reports/reports.service.ts` — fan-out по `tenant_chats`.
- `apps/api/src/modules/reports/reports.service.spec.ts` — new cases for fan-out.
- `apps/api/src/modules/reports/reports.module.ts` — inject `TenantChatsService`.
- `apps/api/src/app.module.ts` — register `TelegramBotModule`.
- `apps/api/src/config/app.config.ts` — add `BOT_ENABLED`, `BOT_USERNAME`.
- `apps/cli/src/commands/link-telegram.ts` — дубль-write в `tenant_chats`.

---

## Task 1: Entity — TenantChatEntity

**Files:**
- Create: `apps/api/src/modules/telegram-bot/entities/tenant-chat.entity.ts`

- [ ] **Step 1: Create entity**

```typescript
import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

export type TenantChatRole = 'owner' | 'member';

@Entity('tenant_chats')
export class TenantChatEntity {
  @PrimaryColumn('uuid', { name: 'tenant_id' })
  tenantId!: string;

  @PrimaryColumn('bigint', { name: 'chat_id' })
  chatId!: number;

  @Column({ type: 'text' })
  role!: TenantChatRole;

  @Column({ type: 'boolean', default: true })
  subscribed!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/telegram-bot/entities/tenant-chat.entity.ts
git commit -m "feat(telegram-bot): add TenantChatEntity"
```

---

## Task 2: Migration — CreateTenantChats

**Files:**
- Create: `apps/api/src/db/migrations/1700000011000-CreateTenantChats.ts`
- Test: `apps/api/src/db/migrations/__tests__/CreateTenantChats.spec.ts`

- [ ] **Step 1: Write the failing integration test**

Migrations в репо тестируются через testcontainers. Если этого файла ещё нет — создать:

```typescript
import { DataSource } from 'typeorm';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { buildDataSourceOptions } from '../../config/typeorm';

describe('CreateTenantChats1700000011000', () => {
  let container: StartedPostgreSqlContainer;
  let ds: DataSource;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16').start();
    ds = new DataSource({
      type: 'postgres',
      url: container.getConnectionUri(),
      entities: [],
      migrations: ['apps/api/src/db/migrations/*.ts'],
      migrationsRun: false,
    });
    await ds.initialize();
  }, 60000);

  afterAll(async () => {
    await ds.destroy();
    await container.stop();
  });

  it('creates tenant_chats table with correct schema and backfills from tenants.telegram_chat_id', async () => {
    await ds.runMigrations();
    const columns = await ds.query(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'tenant_chats' ORDER BY ordinal_position
    `);
    expect(columns.map((c: any) => c.column_name)).toEqual([
      'tenant_id', 'chat_id', 'role', 'subscribed', 'created_at',
    ]);
    const pk = await ds.query(`
      SELECT a.attname FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = 'tenant_chats'::regclass AND i.indisprimary
      ORDER BY a.attname
    `);
    expect(pk.map((r: any) => r.attname).sort()).toEqual(['chat_id', 'tenant_id']);
  });
});
```

- [ ] **Step 2: Run the test, expect fail**

```bash
pnpm --filter @altegio/api test -- --testPathPattern='CreateTenantChats'
```

Expected: FAIL — migration file not found.

- [ ] **Step 3: Write migration**

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTenantChats1700000011000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE tenant_chats (
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        chat_id bigint NOT NULL,
        role text NOT NULL,
        subscribed boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (tenant_id, chat_id),
        CONSTRAINT chk_tenant_chats_role CHECK (role IN ('owner','member'))
      )
    `);
    await qr.query(`CREATE INDEX idx_tenant_chats_chat_id ON tenant_chats (chat_id)`);
    await qr.query(`
      INSERT INTO tenant_chats (tenant_id, chat_id, role, subscribed)
      SELECT id, telegram_chat_id, 'owner', true
      FROM tenants
      WHERE telegram_chat_id IS NOT NULL
      ON CONFLICT DO NOTHING
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query('DROP TABLE IF EXISTS tenant_chats');
  }
}
```

- [ ] **Step 4: Run test, expect pass**

```bash
pnpm --filter @altegio/api test -- --testPathPattern='CreateTenantChats'
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/db/migrations/1700000011000-CreateTenantChats.ts \
        apps/api/src/db/migrations/__tests__/CreateTenantChats.spec.ts
git commit -m "feat(db): create tenant_chats with backfill from tenants.telegram_chat_id"
```

---

## Task 3: Entity + Migration — TelegramInviteCodeEntity

**Files:**
- Create: `apps/api/src/modules/telegram-bot/entities/telegram-invite-code.entity.ts`
- Create: `apps/api/src/db/migrations/1700000012000-CreateTelegramInviteCodes.ts`

- [ ] **Step 1: Create entity**

```typescript
import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('telegram_invite_codes')
@Index(['tenantId', 'expiresAt'])
export class TelegramInviteCodeEntity {
  @PrimaryColumn({ type: 'varchar', length: 6 })
  code!: string;

  @Column('uuid', { name: 'tenant_id' })
  tenantId!: string;

  @Column('bigint', { name: 'created_by_chat_id' })
  createdByChatId!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @Column('timestamptz', { name: 'expires_at' })
  expiresAt!: Date;

  @Column('bigint', { name: 'used_by_chat_id', nullable: true })
  usedByChatId!: number | null;

  @Column('timestamptz', { name: 'used_at', nullable: true })
  usedAt!: Date | null;
}
```

- [ ] **Step 2: Create migration**

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTelegramInviteCodes1700000012000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE telegram_invite_codes (
        code varchar(6) PRIMARY KEY,
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        created_by_chat_id bigint NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL,
        used_by_chat_id bigint NULL,
        used_at timestamptz NULL
      )
    `);
    await qr.query(`
      CREATE INDEX idx_telegram_invite_codes_tenant_expires
        ON telegram_invite_codes (tenant_id, expires_at)
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query('DROP TABLE IF EXISTS telegram_invite_codes');
  }
}
```

- [ ] **Step 3: Run existing migration harness**

```bash
pnpm --filter @altegio/api test -- --testPathPattern='migrations'
```

Expected: PASS (harness just runs all migrations up+down).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/telegram-bot/entities/telegram-invite-code.entity.ts \
        apps/api/src/db/migrations/1700000012000-CreateTelegramInviteCodes.ts
git commit -m "feat(db): create telegram_invite_codes"
```

---

## Task 4: Entity + Migration — TelegramBotLogEntity

**Files:**
- Create: `apps/api/src/modules/telegram-bot/entities/telegram-bot-log.entity.ts`
- Create: `apps/api/src/db/migrations/1700000013000-CreateTelegramBotLogs.ts`

- [ ] **Step 1: Entity**

```typescript
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('telegram_bot_logs')
@Index(['chatId', 'command', 'respondedAt'])
export class TelegramBotLogEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column('bigint', { name: 'chat_id' })
  chatId!: number;

  @Column('uuid', { name: 'tenant_id', nullable: true })
  tenantId!: string | null;

  @Column({ type: 'varchar', length: 32 })
  command!: string;

  @Column({ type: 'jsonb', default: '{}' })
  args!: Record<string, unknown>;

  @CreateDateColumn({ name: 'responded_at' })
  respondedAt!: Date;
}
```

- [ ] **Step 2: Migration**

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTelegramBotLogs1700000013000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE telegram_bot_logs (
        id bigserial PRIMARY KEY,
        chat_id bigint NOT NULL,
        tenant_id uuid NULL REFERENCES tenants(id) ON DELETE SET NULL,
        command varchar(32) NOT NULL,
        args jsonb NOT NULL DEFAULT '{}'::jsonb,
        responded_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await qr.query(`
      CREATE INDEX idx_telegram_bot_logs_chat_command_time
        ON telegram_bot_logs (chat_id, command, responded_at DESC)
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query('DROP TABLE IF EXISTS telegram_bot_logs');
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/telegram-bot/entities/telegram-bot-log.entity.ts \
        apps/api/src/db/migrations/1700000013000-CreateTelegramBotLogs.ts
git commit -m "feat(db): create telegram_bot_logs"
```

---

## Task 5: Migration + Entity update — extend report_deliveries PK with chat_id

**Files:**
- Modify: `apps/api/src/modules/reports/entities/report-delivery.entity.ts`
- Create: `apps/api/src/db/migrations/1700000014000-ExtendReportDeliveriesPk.ts`

- [ ] **Step 1: Write failing migration test**

Create `apps/api/src/db/migrations/__tests__/ExtendReportDeliveriesPk.spec.ts`:

```typescript
import { DataSource } from 'typeorm';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';

describe('ExtendReportDeliveriesPk1700000014000', () => {
  let container: StartedPostgreSqlContainer;
  let ds: DataSource;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16').start();
    ds = new DataSource({
      type: 'postgres',
      url: container.getConnectionUri(),
      entities: [],
      migrations: ['apps/api/src/db/migrations/*.ts'],
      migrationsRun: false,
    });
    await ds.initialize();
  }, 60000);

  afterAll(async () => {
    await ds.destroy();
    await container.stop();
  });

  it('adds chat_id column NOT NULL and uses it in PK, backfilling from tenants', async () => {
    await ds.runMigrations({ transaction: 'each' });

    const [{ column_default }] = await ds.query(`
      SELECT is_nullable, column_default FROM information_schema.columns
      WHERE table_name='report_deliveries' AND column_name='chat_id'
    `);
    expect(column_default).toBeNull();

    const pk = await ds.query(`
      SELECT a.attname FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = 'report_deliveries'::regclass AND i.indisprimary
    `);
    expect(pk.map((r: any) => r.attname).sort()).toEqual(['chat_id', 'date', 'message_kind', 'tenant_id']);
  });
});
```

- [ ] **Step 2: Run, expect fail**

```bash
pnpm --filter @altegio/api test -- --testPathPattern='ExtendReportDeliveriesPk'
```

Expected: FAIL — migration not found.

- [ ] **Step 3: Write migration**

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExtendReportDeliveriesPk1700000014000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE report_deliveries ADD COLUMN chat_id bigint NULL`);
    await qr.query(`
      UPDATE report_deliveries rd
      SET chat_id = t.telegram_chat_id
      FROM tenants t
      WHERE rd.tenant_id = t.id
    `);
    // Defensive: drop orphaned rows where tenant has no chat_id.
    await qr.query(`DELETE FROM report_deliveries WHERE chat_id IS NULL`);
    await qr.query(`ALTER TABLE report_deliveries ALTER COLUMN chat_id SET NOT NULL`);
    await qr.query(`ALTER TABLE report_deliveries DROP CONSTRAINT IF EXISTS report_deliveries_pkey`);
    await qr.query(`
      ALTER TABLE report_deliveries
      ADD CONSTRAINT report_deliveries_pkey
      PRIMARY KEY (tenant_id, date, message_kind, chat_id)
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`
      DELETE FROM report_deliveries rd
      USING tenants t
      WHERE rd.tenant_id = t.id AND rd.chat_id <> t.telegram_chat_id
    `);
    await qr.query(`ALTER TABLE report_deliveries DROP CONSTRAINT IF EXISTS report_deliveries_pkey`);
    await qr.query(`
      ALTER TABLE report_deliveries
      ADD CONSTRAINT report_deliveries_pkey
      PRIMARY KEY (tenant_id, date, message_kind)
    `);
    await qr.query(`ALTER TABLE report_deliveries DROP COLUMN IF EXISTS chat_id`);
  }
}
```

- [ ] **Step 4: Update entity**

Edit `apps/api/src/modules/reports/entities/report-delivery.entity.ts` — add `chatId` as fourth primary column AFTER `messageKind`:

```typescript
import { Column, Entity, PrimaryColumn } from 'typeorm';

export type ReportDeliveryStatus = 'pending' | 'sent' | 'failed';

@Entity('report_deliveries')
export class ReportDeliveryEntity {
  @PrimaryColumn('uuid', { name: 'tenant_id' })
  tenantId!: string;

  @PrimaryColumn('date')
  date!: string;

  @PrimaryColumn({ type: 'text', name: 'message_kind' })
  messageKind!: 'yesterday' | 'today';

  @PrimaryColumn({ type: 'bigint', name: 'chat_id' })
  chatId!: number;

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

- [ ] **Step 5: Run test, expect pass**

```bash
pnpm --filter @altegio/api test -- --testPathPattern='ExtendReportDeliveriesPk'
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/db/migrations/1700000014000-ExtendReportDeliveriesPk.ts \
        apps/api/src/db/migrations/__tests__/ExtendReportDeliveriesPk.spec.ts \
        apps/api/src/modules/reports/entities/report-delivery.entity.ts
git commit -m "feat(db): extend report_deliveries PK with chat_id"
```

---

## Task 6: InviteCodeService

**Files:**
- Create: `apps/api/src/modules/telegram-bot/invite-code.service.ts`
- Test: `apps/api/src/modules/telegram-bot/invite-code.service.spec.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InviteCodeService } from './invite-code.service';
import { TelegramInviteCodeEntity } from './entities/telegram-invite-code.entity';

describe('InviteCodeService', () => {
  let service: InviteCodeService;
  let repo: Partial<Repository<TelegramInviteCodeEntity>>;

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      save: jest.fn(async (x) => x as any),
      update: jest.fn(async () => ({ affected: 1 } as any)),
    };
    const mod = await Test.createTestingModule({
      providers: [
        InviteCodeService,
        { provide: getRepositoryToken(TelegramInviteCodeEntity), useValue: repo },
      ],
    }).compile();
    service = mod.get(InviteCodeService);
  });

  it('generates 6-digit numeric code with 24h TTL', async () => {
    (repo.findOne as jest.Mock).mockResolvedValue(null);
    const out = await service.generate('tenant-1', 12345);
    expect(out.code).toMatch(/^\d{6}$/);
    expect(out.expiresAt.getTime()).toBeGreaterThan(Date.now() + 23 * 3600_000);
    expect(repo.save).toHaveBeenCalled();
  });

  it('retries on code collision', async () => {
    (repo.findOne as jest.Mock)
      .mockResolvedValueOnce({ code: '111111' })
      .mockResolvedValueOnce(null);
    const out = await service.generate('tenant-1', 1);
    expect(out.code).toMatch(/^\d{6}$/);
    expect(repo.findOne).toHaveBeenCalledTimes(2);
  });

  it('consume returns null on expired code', async () => {
    (repo.findOne as jest.Mock).mockResolvedValue({
      code: '384027',
      tenantId: 't1',
      expiresAt: new Date(Date.now() - 1000),
      usedByChatId: null,
    });
    const result = await service.consume('384027', 777);
    expect(result).toBeNull();
  });

  it('consume returns null on already-used code', async () => {
    (repo.findOne as jest.Mock).mockResolvedValue({
      code: '384027',
      expiresAt: new Date(Date.now() + 10_000),
      usedByChatId: 999,
    });
    const result = await service.consume('384027', 777);
    expect(result).toBeNull();
  });

  it('consume marks valid code used and returns tenantId', async () => {
    (repo.findOne as jest.Mock).mockResolvedValue({
      code: '384027',
      tenantId: 't1',
      expiresAt: new Date(Date.now() + 10_000),
      usedByChatId: null,
    });
    const result = await service.consume('384027', 777);
    expect(result).toEqual({ tenantId: 't1' });
    expect(repo.update).toHaveBeenCalledWith(
      { code: '384027', usedByChatId: expect.anything() },
      expect.objectContaining({ usedByChatId: 777, usedAt: expect.any(Date) }),
    );
  });
});
```

- [ ] **Step 2: Run test, expect fail**

```bash
pnpm --filter @altegio/api test -- --testPathPattern='invite-code.service'
```

Expected: FAIL — service not implemented.

- [ ] **Step 3: Implement service**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { randomInt } from 'crypto';
import { TelegramInviteCodeEntity } from './entities/telegram-invite-code.entity';

const TTL_MS = 24 * 3600 * 1000;
const MAX_COLLISION_RETRIES = 5;

@Injectable()
export class InviteCodeService {
  private readonly log = new Logger(InviteCodeService.name);

  constructor(
    @InjectRepository(TelegramInviteCodeEntity)
    private readonly repo: Repository<TelegramInviteCodeEntity>,
  ) {}

  async generate(tenantId: string, createdByChatId: number): Promise<{ code: string; expiresAt: Date }> {
    for (let i = 0; i < MAX_COLLISION_RETRIES; i++) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const existing = await this.repo.findOne({ where: { code } });
      if (existing) continue;
      const expiresAt = new Date(Date.now() + TTL_MS);
      await this.repo.save({
        code,
        tenantId,
        createdByChatId,
        expiresAt,
        usedByChatId: null,
        usedAt: null,
      } as TelegramInviteCodeEntity);
      return { code, expiresAt };
    }
    throw new Error('Failed to generate unique invite code after retries');
  }

  async consume(code: string, chatId: number): Promise<{ tenantId: string } | null> {
    const row = await this.repo.findOne({ where: { code } });
    if (!row) return null;
    if (row.expiresAt.getTime() <= Date.now()) return null;
    if (row.usedByChatId != null) return null;

    const result = await this.repo.update(
      { code, usedByChatId: IsNull() as any },
      { usedByChatId: chatId, usedAt: new Date() },
    );
    if (!result.affected) return null;
    return { tenantId: row.tenantId };
  }
}
```

- [ ] **Step 4: Run test, expect pass**

```bash
pnpm --filter @altegio/api test -- --testPathPattern='invite-code.service'
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/telegram-bot/invite-code.service.ts \
        apps/api/src/modules/telegram-bot/invite-code.service.spec.ts
git commit -m "feat(telegram-bot): add InviteCodeService with TTL + retry-on-collision"
```

---

## Task 7: TenantChatsService

**Files:**
- Create: `apps/api/src/modules/telegram-bot/tenant-chats.service.ts`
- Test: `apps/api/src/modules/telegram-bot/tenant-chats.service.spec.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantChatsService } from './tenant-chats.service';
import { TenantChatEntity } from './entities/tenant-chat.entity';

describe('TenantChatsService', () => {
  let service: TenantChatsService;
  let repo: Partial<Repository<TenantChatEntity>>;

  beforeEach(async () => {
    repo = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(async (x) => x as any),
      update: jest.fn(async () => ({ affected: 1 } as any)),
    };
    const mod = await Test.createTestingModule({
      providers: [
        TenantChatsService,
        { provide: getRepositoryToken(TenantChatEntity), useValue: repo },
      ],
    }).compile();
    service = mod.get(TenantChatsService);
  });

  it('listTenantsForChat returns empty for unknown chat', async () => {
    (repo.find as jest.Mock).mockResolvedValue([]);
    expect(await service.listTenantsForChat(999)).toEqual([]);
  });

  it('listSubscribedChats returns only subscribed chats for tenant', async () => {
    (repo.find as jest.Mock).mockResolvedValue([
      { tenantId: 't1', chatId: 1, role: 'owner', subscribed: true },
    ]);
    const out = await service.listSubscribedChats('t1');
    expect(repo.find).toHaveBeenCalledWith({ where: { tenantId: 't1', subscribed: true } });
    expect(out).toHaveLength(1);
  });

  it('linkMember inserts new (tenant, chat) as member/subscribed', async () => {
    await service.linkMember('t1', 555);
    expect(repo.save).toHaveBeenCalledWith({
      tenantId: 't1', chatId: 555, role: 'member', subscribed: true,
    });
  });

  it('setSubscribed updates subscribed flag', async () => {
    await service.setSubscribed('t1', 555, false);
    expect(repo.update).toHaveBeenCalledWith(
      { tenantId: 't1', chatId: 555 },
      { subscribed: false },
    );
  });

  it('findRole returns role when link exists', async () => {
    (repo.findOne as jest.Mock).mockResolvedValue({ role: 'owner' });
    expect(await service.findRole('t1', 555)).toBe('owner');
  });

  it('findRole returns null when link missing', async () => {
    (repo.findOne as jest.Mock).mockResolvedValue(null);
    expect(await service.findRole('t1', 555)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test, expect fail**

```bash
pnpm --filter @altegio/api test -- --testPathPattern='tenant-chats.service'
```

Expected: FAIL.

- [ ] **Step 3: Implement service**

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantChatEntity, TenantChatRole } from './entities/tenant-chat.entity';

@Injectable()
export class TenantChatsService {
  constructor(
    @InjectRepository(TenantChatEntity)
    private readonly repo: Repository<TenantChatEntity>,
  ) {}

  listTenantsForChat(chatId: number): Promise<TenantChatEntity[]> {
    return this.repo.find({ where: { chatId } });
  }

  listSubscribedChats(tenantId: string): Promise<TenantChatEntity[]> {
    return this.repo.find({ where: { tenantId, subscribed: true } });
  }

  async linkMember(tenantId: string, chatId: number): Promise<void> {
    await this.repo.save({ tenantId, chatId, role: 'member', subscribed: true } as TenantChatEntity);
  }

  async linkOwner(tenantId: string, chatId: number): Promise<void> {
    // Upsert owner — used by CLI link-telegram.
    await this.repo
      .createQueryBuilder()
      .insert()
      .values({ tenantId, chatId, role: 'owner', subscribed: true })
      .orUpdate(['role', 'subscribed'], ['tenant_id', 'chat_id'])
      .execute();
  }

  async setSubscribed(tenantId: string, chatId: number, subscribed: boolean): Promise<void> {
    await this.repo.update({ tenantId, chatId }, { subscribed });
  }

  async findRole(tenantId: string, chatId: number): Promise<TenantChatRole | null> {
    const row = await this.repo.findOne({ where: { tenantId, chatId } });
    return row ? row.role : null;
  }
}
```

- [ ] **Step 4: Run test, expect pass**

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/telegram-bot/tenant-chats.service.ts \
        apps/api/src/modules/telegram-bot/tenant-chats.service.spec.ts
git commit -m "feat(telegram-bot): add TenantChatsService"
```

---

## Task 8: BotLogsService with rate-limit check

**Files:**
- Create: `apps/api/src/modules/telegram-bot/bot-logs.service.ts`
- Test: `apps/api/src/modules/telegram-bot/bot-logs.service.spec.ts`

- [ ] **Step 1: Failing test**

```typescript
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BotLogsService } from './bot-logs.service';
import { TelegramBotLogEntity } from './entities/telegram-bot-log.entity';

describe('BotLogsService', () => {
  let service: BotLogsService;
  let repo: Partial<Repository<TelegramBotLogEntity>>;

  beforeEach(async () => {
    repo = {
      save: jest.fn(async (x) => x as any),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getCount: jest.fn(async () => 0),
      }),
    };
    const mod = await Test.createTestingModule({
      providers: [
        BotLogsService,
        { provide: getRepositoryToken(TelegramBotLogEntity), useValue: repo },
      ],
    }).compile();
    service = mod.get(BotLogsService);
  });

  it('log writes entry', async () => {
    await service.log({ chatId: 1, tenantId: 't1', command: '/help', args: { x: 1 } });
    expect(repo.save).toHaveBeenCalled();
  });

  it('isAllowed returns true when under limit', async () => {
    (repo.createQueryBuilder() as any).getCount.mockResolvedValue(0);
    const ok = await service.isAllowed({ chatId: 1, command: '/report', max: 1, windowMs: 600_000 });
    expect(ok).toBe(true);
  });

  it('isAllowed returns false when at limit', async () => {
    (repo.createQueryBuilder() as any).getCount.mockResolvedValue(1);
    const ok = await service.isAllowed({ chatId: 1, command: '/report', max: 1, windowMs: 600_000 });
    expect(ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run, expect fail.**

- [ ] **Step 3: Implement**

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TelegramBotLogEntity } from './entities/telegram-bot-log.entity';

export interface RateLimitQuery {
  chatId: number;
  command: string;
  max: number;
  windowMs: number;
  tenantId?: string;
}

@Injectable()
export class BotLogsService {
  constructor(
    @InjectRepository(TelegramBotLogEntity)
    private readonly repo: Repository<TelegramBotLogEntity>,
  ) {}

  async log(entry: { chatId: number; tenantId: string | null; command: string; args?: Record<string, unknown> }): Promise<void> {
    await this.repo.save({
      chatId: entry.chatId,
      tenantId: entry.tenantId,
      command: entry.command,
      args: entry.args ?? {},
    } as TelegramBotLogEntity);
  }

  async isAllowed(q: RateLimitQuery): Promise<boolean> {
    const since = new Date(Date.now() - q.windowMs);
    const qb = this.repo
      .createQueryBuilder('l')
      .where('l.chat_id = :chatId', { chatId: q.chatId })
      .andWhere('l.command = :command', { command: q.command })
      .andWhere('l.responded_at >= :since', { since });
    if (q.tenantId) qb.andWhere('l.tenant_id = :tenantId', { tenantId: q.tenantId });
    const count = await qb.getCount();
    return count < q.max;
  }
}
```

- [ ] **Step 4: Run, expect pass.**

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/telegram-bot/bot-logs.service.ts \
        apps/api/src/modules/telegram-bot/bot-logs.service.spec.ts
git commit -m "feat(telegram-bot): add BotLogsService with rate-limit check"
```

---

## Task 9: Context types + tenant-picker util

**Files:**
- Create: `apps/api/src/modules/telegram-bot/utils/context.ts`
- Create: `apps/api/src/modules/telegram-bot/utils/tenant-picker.ts`

- [ ] **Step 1: Context types**

```typescript
import type { Context } from 'telegraf';
import type { TenantChatEntity } from '../entities/tenant-chat.entity';

export interface BotContext extends Context {
  state: {
    chatId: number;
    tenants: TenantChatEntity[]; // все (tenant, role) для этого chat
  };
}

export function hasLinkedTenants(ctx: BotContext): boolean {
  return ctx.state.tenants.length > 0;
}

export function isOwner(ctx: BotContext, tenantId: string): boolean {
  return ctx.state.tenants.some((t) => t.tenantId === tenantId && t.role === 'owner');
}
```

- [ ] **Step 2: Tenant picker**

```typescript
import type { InlineKeyboardButton } from 'telegraf/typings/core/types/typegram';
import type { TenantChatEntity } from '../entities/tenant-chat.entity';

export interface TenantOption {
  tenantId: string;
  label: string;
}

export function buildTenantPickerKeyboard(options: TenantOption[], actionPrefix: string): InlineKeyboardButton[][] {
  return options.map((o) => [
    { text: o.label, callback_data: `${actionPrefix}:${o.tenantId}` } as InlineKeyboardButton,
  ]);
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/telegram-bot/utils/
git commit -m "feat(telegram-bot): context types and tenant picker util"
```

---

## Task 10: Middleware — resolveChat, requireLinked, requireOwner, rate-limit

**Files:**
- Create: `apps/api/src/modules/telegram-bot/middleware/resolve-chat.middleware.ts`
- Create: `apps/api/src/modules/telegram-bot/middleware/require-linked.middleware.ts`
- Create: `apps/api/src/modules/telegram-bot/middleware/require-owner.middleware.ts`
- Create: `apps/api/src/modules/telegram-bot/middleware/rate-limit.middleware.ts`
- Test: `apps/api/src/modules/telegram-bot/middleware/middleware.spec.ts`

- [ ] **Step 1: Failing test** (covers all 4)

```typescript
import { resolveChatMiddleware } from './resolve-chat.middleware';
import { requireLinkedMiddleware } from './require-linked.middleware';
import { requireOwnerMiddleware } from './require-owner.middleware';
import { rateLimitMiddleware } from './rate-limit.middleware';

function makeCtx(overrides: any = {}) {
  return {
    chat: { id: 100 },
    state: {},
    reply: jest.fn(),
    ...overrides,
  };
}

describe('resolveChat', () => {
  it('attaches tenants + chatId to state', async () => {
    const ctx: any = makeCtx();
    const tenants = { listTenantsForChat: jest.fn().mockResolvedValue([{ tenantId: 't1', role: 'owner' }]) };
    const next = jest.fn();
    await resolveChatMiddleware(tenants as any)(ctx, next);
    expect(ctx.state.chatId).toBe(100);
    expect(ctx.state.tenants).toHaveLength(1);
    expect(next).toHaveBeenCalled();
  });
});

describe('requireLinked', () => {
  it('rejects unlinked chat with helpful message', async () => {
    const ctx: any = makeCtx({ state: { chatId: 100, tenants: [] } });
    const next = jest.fn();
    await requireLinkedMiddleware()(ctx, next);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('/link'));
    expect(next).not.toHaveBeenCalled();
  });
  it('passes linked chat', async () => {
    const ctx: any = makeCtx({ state: { chatId: 100, tenants: [{ tenantId: 't1', role: 'owner' }] } });
    const next = jest.fn();
    await requireLinkedMiddleware()(ctx, next);
    expect(next).toHaveBeenCalled();
  });
});

describe('requireOwner', () => {
  it('rejects member-only chat', async () => {
    const ctx: any = makeCtx({ state: { chatId: 100, tenants: [{ tenantId: 't1', role: 'member' }] } });
    const next = jest.fn();
    await requireOwnerMiddleware()(ctx, next);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('только владелец'));
    expect(next).not.toHaveBeenCalled();
  });
  it('passes owner chat', async () => {
    const ctx: any = makeCtx({ state: { chatId: 100, tenants: [{ tenantId: 't1', role: 'owner' }] } });
    const next = jest.fn();
    await requireOwnerMiddleware()(ctx, next);
    expect(next).toHaveBeenCalled();
  });
});

describe('rateLimit', () => {
  it('blocks when over limit', async () => {
    const logs = { isAllowed: jest.fn().mockResolvedValue(false) };
    const ctx: any = makeCtx({ state: { chatId: 100, tenants: [] } });
    const next = jest.fn();
    await rateLimitMiddleware(logs as any, { command: '/report', max: 1, windowMs: 60_000 })(ctx, next);
    expect(next).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('часто'));
  });
  it('allows under limit', async () => {
    const logs = { isAllowed: jest.fn().mockResolvedValue(true) };
    const ctx: any = makeCtx({ state: { chatId: 100, tenants: [] } });
    const next = jest.fn();
    await rateLimitMiddleware(logs as any, { command: '/report', max: 1, windowMs: 60_000 })(ctx, next);
    expect(next).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, expect fail.**

- [ ] **Step 3: Implement — resolve-chat.middleware.ts**

```typescript
import type { BotContext } from '../utils/context';
import type { TenantChatsService } from '../tenant-chats.service';

export function resolveChatMiddleware(tenantChats: TenantChatsService) {
  return async (ctx: BotContext, next: () => Promise<void>): Promise<void> => {
    const chatId = ctx.chat?.id;
    if (!chatId) return next();
    const tenants = await tenantChats.listTenantsForChat(chatId);
    ctx.state = { ...(ctx.state || {}), chatId, tenants } as any;
    return next();
  };
}
```

- [ ] **Step 4: Implement — require-linked.middleware.ts**

```typescript
import type { BotContext } from '../utils/context';

export function requireLinkedMiddleware() {
  return async (ctx: BotContext, next: () => Promise<void>): Promise<void> => {
    if (ctx.state?.tenants && ctx.state.tenants.length > 0) return next();
    await ctx.reply(
      'Чат не привязан к салону. Попроси владельца команду /invite и пришли сюда /link <код>.',
    );
  };
}
```

- [ ] **Step 5: Implement — require-owner.middleware.ts**

```typescript
import type { BotContext } from '../utils/context';

export function requireOwnerMiddleware() {
  return async (ctx: BotContext, next: () => Promise<void>): Promise<void> => {
    const hasOwner = ctx.state?.tenants?.some((t) => t.role === 'owner');
    if (hasOwner) return next();
    await ctx.reply('Эту команду может использовать только владелец салона.');
  };
}
```

- [ ] **Step 6: Implement — rate-limit.middleware.ts**

```typescript
import type { BotContext } from '../utils/context';
import type { BotLogsService } from '../bot-logs.service';

export interface RateLimitConfig {
  command: string;
  max: number;
  windowMs: number;
  perTenant?: boolean; // если true — лимит на (chat, command, tenant)
}

export function rateLimitMiddleware(logs: BotLogsService, cfg: RateLimitConfig) {
  return async (ctx: BotContext, next: () => Promise<void>): Promise<void> => {
    const chatId = ctx.state?.chatId;
    if (!chatId) return next();
    // Для perTenant используем первый tenant — handler обычно уже выбрал
    const tenantId = cfg.perTenant ? ctx.state?.tenants?.[0]?.tenantId : undefined;
    const ok = await logs.isAllowed({ chatId, command: cfg.command, max: cfg.max, windowMs: cfg.windowMs, tenantId });
    if (!ok) {
      const seconds = Math.ceil(cfg.windowMs / 1000);
      await ctx.reply(`Слишком часто. Подожди ~${seconds} сек и попробуй снова.`);
      return;
    }
    return next();
  };
}
```

- [ ] **Step 7: Run test, expect pass.**

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/telegram-bot/middleware/
git commit -m "feat(telegram-bot): middleware (resolveChat, requireLinked, requireOwner, rateLimit)"
```

---

## Task 11: Handler — /start + /help

**Files:**
- Create: `apps/api/src/modules/telegram-bot/commands/start.handler.ts`
- Create: `apps/api/src/modules/telegram-bot/commands/help.handler.ts`

- [ ] **Step 1: Implement /start**

```typescript
import type { Telegraf } from 'telegraf';
import type { BotContext } from '../utils/context';
import type { BotLogsService } from '../bot-logs.service';

export function registerStart(bot: Telegraf<BotContext>, logs: BotLogsService): void {
  bot.start(async (ctx) => {
    await logs.log({ chatId: ctx.state.chatId, tenantId: null, command: '/start' });
    const linked = ctx.state.tenants.length > 0;
    if (linked) {
      await ctx.reply(
        'С возвращением. Бот активен. /help — список команд.',
      );
    } else {
      await ctx.reply(
        'Привет! Это бот аналитики салона.\n\n' +
        'Если владелец салона прислал тебе код — введи:\n`/link 123456`\n\n' +
        '/help — список команд.',
        { parse_mode: 'Markdown' },
      );
    }
  });
}
```

- [ ] **Step 2: Implement /help**

```typescript
import type { Telegraf } from 'telegraf';
import type { BotContext } from '../utils/context';
import type { BotLogsService } from '../bot-logs.service';

export function registerHelp(bot: Telegraf<BotContext>, logs: BotLogsService): void {
  bot.help(async (ctx) => {
    await logs.log({ chatId: ctx.state.chatId, tenantId: null, command: '/help' });
    const tenants = ctx.state.tenants;
    const isLinked = tenants.length > 0;
    const isOwner = tenants.some((t) => t.role === 'owner');

    const lines: string[] = ['*Команды*', ''];
    lines.push('/start — приветствие');
    lines.push('/help — эта справка');
    lines.push('/link <код> — подключить чат к салону');
    if (isLinked) {
      lines.push('/report [YYYY-MM-DD] — отчёт (по умолчанию сегодня)');
      lines.push('/status — статус подписки');
      lines.push('/subscribe — включить автоотчёт');
      lines.push('/unsubscribe — выключить автоотчёт');
    }
    if (isOwner) {
      lines.push('/invite — сгенерировать код для второго чата');
      lines.push('/sync — запустить синхронизацию с Altegio');
    }
    await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/telegram-bot/commands/start.handler.ts \
        apps/api/src/modules/telegram-bot/commands/help.handler.ts
git commit -m "feat(telegram-bot): /start and /help handlers"
```

---

## Task 12: Handler — /link

**Files:**
- Create: `apps/api/src/modules/telegram-bot/commands/link.handler.ts`

- [ ] **Step 1: Implement**

```typescript
import type { Telegraf } from 'telegraf';
import type { BotContext } from '../utils/context';
import type { InviteCodeService } from '../invite-code.service';
import type { TenantChatsService } from '../tenant-chats.service';
import type { TenantsService } from '../../tenants/tenants.service';
import type { BotLogsService } from '../bot-logs.service';

export function registerLink(
  bot: Telegraf<BotContext>,
  deps: {
    codes: InviteCodeService;
    chats: TenantChatsService;
    tenants: TenantsService;
    logs: BotLogsService;
  },
): void {
  bot.command('link', async (ctx) => {
    const chatId = ctx.state.chatId;
    const text = (ctx.message && 'text' in ctx.message ? ctx.message.text : '') as string;
    const parts = text.trim().split(/\s+/);
    const code = parts[1];

    await deps.logs.log({ chatId, tenantId: null, command: '/link', args: { code: code ?? null } });

    if (!code || !/^\d{6}$/.test(code)) {
      await ctx.reply('Формат: /link 123456 (6 цифр)');
      return;
    }

    const result = await deps.codes.consume(code, chatId);
    if (!result) {
      await ctx.reply('Код не найден, истёк или уже использован.');
      return;
    }

    const tenant = await deps.tenants.findById(result.tenantId);
    await deps.chats.linkMember(result.tenantId, chatId);
    await ctx.reply(`Подключено к салону «${tenant?.salonName ?? result.tenantId}». Автоотчёт включён, /unsubscribe чтобы выключить.`);
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/telegram-bot/commands/link.handler.ts
git commit -m "feat(telegram-bot): /link handler"
```

---

## Task 13: Refactor — ReportsService fan-out by tenant_chats

**Files:**
- Modify: `apps/api/src/modules/reports/reports.service.ts`
- Modify: `apps/api/src/modules/reports/reports.module.ts`
- Modify: `apps/api/src/modules/reports/reports.service.spec.ts`

- [ ] **Step 1: Failing test for fan-out**

Append к `reports.service.spec.ts`:

```typescript
describe('ReportsService fan-out', () => {
  it('sends to every subscribed chat and writes per-chat delivery row', async () => {
    // Arrange: mock tenantChats.listSubscribedChats to return 2 chats
    const chats = [
      { chatId: 111, role: 'owner', subscribed: true },
      { chatId: 222, role: 'member', subscribed: true },
    ];
    const tenantChats = { listSubscribedChats: jest.fn().mockResolvedValue(chats), setSubscribed: jest.fn() };
    const telegram = { sendReport: jest.fn().mockResolvedValue({ messageId: 42 }) };
    const deliveries = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn(async (x) => x),
    };
    // ... см. фикстуру в существующем spec для metrics/ai/tenants
    const service = buildServiceWith({ tenantChats, telegram, deliveries });

    await service.generateAndDeliver('t1', '2026-04-22');

    expect(telegram.sendReport).toHaveBeenCalledTimes(4); // 2 chats × 2 kinds
    expect(deliveries.save).toHaveBeenCalledWith(expect.objectContaining({ chatId: 111 }));
    expect(deliveries.save).toHaveBeenCalledWith(expect.objectContaining({ chatId: 222 }));
  });

  it('auto-unsubscribes member on 403 forbidden but not owner', async () => {
    const chats = [
      { chatId: 111, role: 'owner', subscribed: true },
      { chatId: 222, role: 'member', subscribed: true },
    ];
    const tenantChats = { listSubscribedChats: jest.fn().mockResolvedValue(chats), setSubscribed: jest.fn() };
    const err = Object.assign(new Error('blocked'), { response: { error_code: 403 } });
    const telegram = {
      sendReport: jest.fn()
        .mockImplementation((chatId: number) => chatId === 222 ? Promise.reject(err) : Promise.resolve({ messageId: 1 })),
    };
    const deliveries = { findOne: jest.fn().mockResolvedValue(null), save: jest.fn(async (x) => x) };
    const service = buildServiceWith({ tenantChats, telegram, deliveries });

    await service.generateAndDeliver('t1', '2026-04-22');

    expect(tenantChats.setSubscribed).toHaveBeenCalledWith('t1', 222, false);
    expect(tenantChats.setSubscribed).not.toHaveBeenCalledWith('t1', 111, expect.anything());
  });

  it('skips kind+chat when delivery row status=sent', async () => {
    const chats = [{ chatId: 111, role: 'owner', subscribed: true }];
    const tenantChats = { listSubscribedChats: jest.fn().mockResolvedValue(chats), setSubscribed: jest.fn() };
    const telegram = { sendReport: jest.fn().mockResolvedValue({ messageId: 1 }) };
    const deliveries = {
      findOne: jest.fn().mockImplementation((q: any) =>
        q.where.messageKind === 'yesterday' ? { status: 'sent' } : null,
      ),
      save: jest.fn(async (x) => x),
    };
    const service = buildServiceWith({ tenantChats, telegram, deliveries });

    await service.generateAndDeliver('t1', '2026-04-22');

    expect(telegram.sendReport).toHaveBeenCalledTimes(1); // today only
  });
});

// helper — подгони под уже используемую в реальном spec; сохрани совместимость с существующими фикстурами metrics/ai/tenants
function buildServiceWith({ tenantChats, telegram, deliveries }: any) {
  const metrics = { buildDailyReportData: jest.fn().mockResolvedValue({ yesterday: { aiInsight: null }, today: {} }) };
  const ai = { getInsight: jest.fn().mockResolvedValue('') };
  const tenants = { findById: jest.fn().mockResolvedValue({ id: 't1', salonName: 'BrowUp', telegramChatId: 111 }) };
  const svc = new (require('./reports.service')).ReportsService(metrics, ai, telegram, tenants, deliveries, tenantChats);
  return svc;
}
```

- [ ] **Step 2: Run test, expect fail** (сигнатура изменилась + fan-out не реализован).

- [ ] **Step 3: Update constructor + fan-out**

Replace `ReportsService` с fan-out:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MetricsService } from '../metrics/metrics.service';
import { renderYesterdayMessage, renderTodayMessage } from './template.renderer';
import { AiInsightService } from './ai-insight.service';
import { TelegramService } from '../telegram/telegram.service';
import { TenantsService } from '../tenants/tenants.service';
import { ReportDeliveryEntity } from './entities/report-delivery.entity';
import { TenantChatsService } from '../telegram-bot/tenant-chats.service';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

@Injectable()
export class ReportsService {
  private readonly log = new Logger(ReportsService.name);

  constructor(
    private readonly metrics: MetricsService,
    private readonly ai: AiInsightService,
    private readonly telegram: TelegramService,
    private readonly tenants: TenantsService,
    @InjectRepository(ReportDeliveryEntity) private readonly deliveries: Repository<ReportDeliveryEntity>,
    private readonly tenantChats: TenantChatsService,
  ) {}

  async generateAndDeliver(tenantId: string, reportDate: string): Promise<void> {
    const yesterdayDateString = this.subtractDays(reportDate, 1);
    const data = await this.metrics.buildDailyReportData(tenantId, reportDate);
    data.yesterday.aiInsight = await this.ai.getInsight(tenantId, data);

    const tenant = await this.tenants.findById(tenantId);
    if (!tenant) throw new Error(`Tenant ${tenantId} not found`);

    const chats = await this.tenantChats.listSubscribedChats(tenantId);
    if (chats.length === 0) {
      this.log.warn(`Tenant ${tenantId} has no subscribed chats, skip delivery`);
      return;
    }

    const kinds = ['yesterday', 'today'] as const;
    const renderers = {
      yesterday: () => renderYesterdayMessage(data),
      today: () => renderTodayMessage(data),
    };

    for (const kind of kinds) {
      const text = renderers[kind]();
      for (const chat of chats) {
        const chatId = Number(chat.chatId);
        const already = await this.deliveries.findOne({
          where: { tenantId, date: yesterdayDateString, messageKind: kind, chatId, status: 'sent' },
        });
        if (already) continue;

        try {
          const { messageId } = await this.telegram.sendReport(chatId, text);
          await this.deliveries.save({
            tenantId, date: yesterdayDateString, messageKind: kind, chatId,
            messageId: messageId || null, sentAt: new Date(), status: 'sent', error: null,
          });
        } catch (err: any) {
          const code = err?.response?.error_code;
          await this.deliveries.save({
            tenantId, date: yesterdayDateString, messageKind: kind, chatId,
            messageId: null, sentAt: null, status: 'failed',
            error: String(err?.message ?? err).slice(0, 2000),
          });
          if ((code === 403 || code === 400) && chat.role === 'member') {
            await this.tenantChats.setSubscribed(tenantId, chatId, false);
            this.log.warn(`Auto-unsubscribed member chat=${chatId} tenant=${tenantId} (code=${code})`);
          }
          // другие ошибки — не прерываем fan-out, идём дальше
        }
        await sleep(250); // мягкий rate-limit против Telegram 30/s
      }
      if (kind === 'yesterday') await sleep(1000); // порядок сообщений
    }
  }

  async buildMessages(tenantId: string, reportDate: string): Promise<{ yesterday: string; today: string }> {
    const data = await this.metrics.buildDailyReportData(tenantId, reportDate);
    data.yesterday.aiInsight = await this.ai.getInsight(tenantId, data);
    return { yesterday: renderYesterdayMessage(data), today: renderTodayMessage(data) };
  }

  private subtractDays(date: string, n: number): string {
    const d = new Date(date + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  }
}
```

- [ ] **Step 4: Wire TenantChatsService into ReportsModule**

In `reports.module.ts` — imports add `TelegramBotModule` (которого пока нет → создадим в Task 17 и потом wire; временно делаем forwardRef или inline-регистрацию). Для бесконфликтности сразу создаём минимальный `TelegramBotModule` с экспортом `TenantChatsService`:

Создать **заглушку модуля** `apps/api/src/modules/telegram-bot/telegram-bot.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantChatsService } from './tenant-chats.service';
import { InviteCodeService } from './invite-code.service';
import { BotLogsService } from './bot-logs.service';
import { TenantChatEntity } from './entities/tenant-chat.entity';
import { TelegramInviteCodeEntity } from './entities/telegram-invite-code.entity';
import { TelegramBotLogEntity } from './entities/telegram-bot-log.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TenantChatEntity, TelegramInviteCodeEntity, TelegramBotLogEntity])],
  providers: [TenantChatsService, InviteCodeService, BotLogsService],
  exports: [TenantChatsService, InviteCodeService, BotLogsService],
})
export class TelegramBotModule {}
```

Update `reports.module.ts`:

```typescript
import { TelegramBotModule } from '../telegram-bot/telegram-bot.module';
// в imports добавить TelegramBotModule
```

- [ ] **Step 5: Run tests, expect pass**

```bash
pnpm --filter @altegio/api test -- --testPathPattern='reports.service'
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/reports/ apps/api/src/modules/telegram-bot/telegram-bot.module.ts
git commit -m "refactor(reports): fan-out by tenant_chats subscriptions; per-chat delivery idempotency"
```

---

## Task 14: Handler — /report

**Files:**
- Create: `apps/api/src/modules/telegram-bot/commands/report.handler.ts`

- [ ] **Step 1: Implement**

```typescript
import type { Telegraf } from 'telegraf';
import type { BotContext } from '../utils/context';
import type { ReportsService } from '../../reports/reports.service';
import type { TenantsService } from '../../tenants/tenants.service';
import type { BotLogsService } from '../bot-logs.service';
import { buildTenantPickerKeyboard } from '../utils/tenant-picker';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function registerReport(
  bot: Telegraf<BotContext>,
  deps: { reports: ReportsService; tenants: TenantsService; logs: BotLogsService },
): void {
  bot.command('report', async (ctx) => {
    const chatId = ctx.state.chatId;
    const parts = ((ctx.message && 'text' in ctx.message ? ctx.message.text : '') as string).trim().split(/\s+/);
    const arg = parts[1];
    await deps.logs.log({ chatId, tenantId: null, command: '/report', args: { arg: arg ?? null } });

    if (ctx.state.tenants.length > 1) {
      const options = await Promise.all(
        ctx.state.tenants.map(async (t) => ({
          tenantId: t.tenantId,
          label: (await deps.tenants.findById(t.tenantId))?.salonName ?? t.tenantId,
        })),
      );
      await ctx.reply('Выбери салон:', {
        reply_markup: { inline_keyboard: buildTenantPickerKeyboard(options, `report:${arg ?? ''}`) },
      });
      return;
    }

    const tenantId = ctx.state.tenants[0].tenantId;
    await runReport(ctx, deps, tenantId, arg);
  });

  bot.action(/^report:(\S*):(\S+)$/, async (ctx) => {
    const [, arg, tenantId] = ctx.match;
    await ctx.answerCbQuery();
    await runReport(ctx as unknown as BotContext, deps, tenantId, arg || undefined);
  });
}

async function runReport(
  ctx: BotContext,
  deps: { reports: ReportsService; tenants: TenantsService },
  tenantId: string,
  dateArg?: string,
): Promise<void> {
  const tenant = await deps.tenants.findById(tenantId);
  if (!tenant) { await ctx.reply('Салон не найден.'); return; }

  const todayInTz = nowInTz(tenant.timezone);
  const reportDate = dateArg ?? todayInTz;
  if (!ISO_DATE.test(reportDate)) {
    await ctx.reply('Формат даты: YYYY-MM-DD. Пример: /report 2026-04-20');
    return;
  }
  const createdDay = tenant.createdAt.toISOString().slice(0, 10);
  if (reportDate > todayInTz || reportDate < createdDay) {
    await ctx.reply(`Нет данных на эту дату. Доступно: ${createdDay} – ${todayInTz}.`);
    return;
  }

  await ctx.reply('⏳ Готовлю отчёт…');
  try {
    // Manual /report: используем buildMessages (без записи в deliveries),
    // отправляем только в инициатор — fan-out не нужен.
    const msgs = await deps.reports.buildMessages(tenantId, reportDate);
    await ctx.reply(msgs.yesterday);
    await ctx.reply(msgs.today);
  } catch (err: any) {
    await ctx.reply(`Ошибка: ${String(err?.message ?? err).slice(0, 200)}`);
  }
}

function nowInTz(tz: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(new Date()); // YYYY-MM-DD
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/telegram-bot/commands/report.handler.ts
git commit -m "feat(telegram-bot): /report handler with tenant picker and date validation"
```

---

## Task 15: Handlers — /status, /subscribe, /unsubscribe

**Files:**
- Create: `apps/api/src/modules/telegram-bot/commands/status.handler.ts`
- Create: `apps/api/src/modules/telegram-bot/commands/subscribe.handler.ts`
- Create: `apps/api/src/modules/telegram-bot/commands/unsubscribe.handler.ts`

- [ ] **Step 1: /status**

```typescript
import type { Telegraf } from 'telegraf';
import type { BotContext } from '../utils/context';
import type { TenantsService } from '../../tenants/tenants.service';
import type { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import type { ReportDeliveryEntity } from '../../reports/entities/report-delivery.entity';
import type { BotLogsService } from '../bot-logs.service';

export function registerStatus(
  bot: Telegraf<BotContext>,
  deps: { tenants: TenantsService; deliveries: Repository<ReportDeliveryEntity>; logs: BotLogsService },
): void {
  bot.command('status', async (ctx) => {
    await deps.logs.log({ chatId: ctx.state.chatId, tenantId: null, command: '/status' });
    const lines: string[] = [];
    for (const link of ctx.state.tenants) {
      const t = await deps.tenants.findById(link.tenantId);
      if (!t) continue;
      const last = await deps.deliveries.findOne({
        where: { tenantId: link.tenantId, chatId: ctx.state.chatId, status: 'sent' },
        order: { sentAt: 'DESC' } as any,
      });
      lines.push(
        `*${t.salonName}*\n` +
        `• роль: ${link.role}\n` +
        `• автоотчёт: ${link.subscribed ? 'включён' : 'выключен'}\n` +
        `• время рассылки: ${t.reportTime} (${t.timezone})\n` +
        `• последняя доставка: ${last?.sentAt?.toISOString() ?? 'нет'}`,
      );
    }
    await ctx.reply(lines.join('\n\n'), { parse_mode: 'Markdown' });
  });
}
```

- [ ] **Step 2: /subscribe + /unsubscribe**

```typescript
// subscribe.handler.ts
import type { Telegraf } from 'telegraf';
import type { BotContext } from '../utils/context';
import type { TenantChatsService } from '../tenant-chats.service';
import type { BotLogsService } from '../bot-logs.service';
import type { TenantsService } from '../../tenants/tenants.service';
import { buildTenantPickerKeyboard } from '../utils/tenant-picker';

export function registerSubscribe(
  bot: Telegraf<BotContext>,
  deps: { chats: TenantChatsService; tenants: TenantsService; logs: BotLogsService },
): void {
  for (const [cmd, value, verb] of [['subscribe', true, 'включён'], ['unsubscribe', false, 'выключен']] as const) {
    bot.command(cmd, async (ctx) => {
      await deps.logs.log({ chatId: ctx.state.chatId, tenantId: null, command: `/${cmd}` });
      const links = ctx.state.tenants;
      if (links.length === 0) return;
      if (links.length === 1) {
        await deps.chats.setSubscribed(links[0].tenantId, ctx.state.chatId, value);
        await ctx.reply(`Автоотчёт ${verb}.`);
        return;
      }
      const options = await Promise.all(links.map(async (l) => ({
        tenantId: l.tenantId, label: (await deps.tenants.findById(l.tenantId))?.salonName ?? l.tenantId,
      })));
      await ctx.reply(`Выбери салон чтобы ${cmd}:`, {
        reply_markup: { inline_keyboard: buildTenantPickerKeyboard(options, `sub:${value ? '1' : '0'}`) },
      });
    });
  }

  bot.action(/^sub:([01]):(\S+)$/, async (ctx) => {
    const [, flag, tenantId] = ctx.match;
    const subscribed = flag === '1';
    await ctx.answerCbQuery();
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    await deps.chats.setSubscribed(tenantId, chatId, subscribed);
    await ctx.reply(`Автоотчёт ${subscribed ? 'включён' : 'выключен'}.`);
  });
}
```

(Создай `unsubscribe.handler.ts` как re-export `registerSubscribe` — либо объедини в один файл и переименуй).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/telegram-bot/commands/status.handler.ts \
        apps/api/src/modules/telegram-bot/commands/subscribe.handler.ts
git commit -m "feat(telegram-bot): /status, /subscribe, /unsubscribe handlers"
```

---

## Task 16: Handler — /invite

**Files:**
- Create: `apps/api/src/modules/telegram-bot/commands/invite.handler.ts`

- [ ] **Step 1: Implement**

```typescript
import type { Telegraf } from 'telegraf';
import type { BotContext } from '../utils/context';
import type { InviteCodeService } from '../invite-code.service';
import type { BotLogsService } from '../bot-logs.service';
import type { TenantsService } from '../../tenants/tenants.service';
import { buildTenantPickerKeyboard } from '../utils/tenant-picker';

export function registerInvite(
  bot: Telegraf<BotContext>,
  deps: { codes: InviteCodeService; tenants: TenantsService; logs: BotLogsService },
): void {
  bot.command('invite', async (ctx) => {
    await deps.logs.log({ chatId: ctx.state.chatId, tenantId: null, command: '/invite' });
    const ownerLinks = ctx.state.tenants.filter((t) => t.role === 'owner');
    if (ownerLinks.length === 1) {
      return handle(ctx, deps, ownerLinks[0].tenantId);
    }
    const options = await Promise.all(ownerLinks.map(async (l) => ({
      tenantId: l.tenantId,
      label: (await deps.tenants.findById(l.tenantId))?.salonName ?? l.tenantId,
    })));
    await ctx.reply('Выбери салон для инвайта:', {
      reply_markup: { inline_keyboard: buildTenantPickerKeyboard(options, 'invite') },
    });
  });

  bot.action(/^invite:(\S+)$/, async (ctx) => {
    const [, tenantId] = ctx.match;
    await ctx.answerCbQuery();
    await handle(ctx as unknown as BotContext, deps, tenantId);
  });
}

async function handle(ctx: BotContext, deps: any, tenantId: string) {
  const { code, expiresAt } = await deps.codes.generate(tenantId, ctx.state?.chatId ?? ctx.chat?.id);
  const hours = Math.round((expiresAt.getTime() - Date.now()) / 3600_000);
  await ctx.reply(
    `Код: *${code}*\n\nПерешли второму чату и пусть введут:\n\`/link ${code}\`\n\nИстекает через ~${hours} ч.`,
    { parse_mode: 'Markdown' },
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/telegram-bot/commands/invite.handler.ts
git commit -m "feat(telegram-bot): /invite handler"
```

---

## Task 17: Handler — /sync (async + follow-up)

**Files:**
- Create: `apps/api/src/modules/telegram-bot/commands/sync.handler.ts`

Предпосылка: существует `sync` pipeline в `apps/api/src/modules/sync/` (использовался `trigger-sync` CLI). Нужна точка вхождения `SyncService.runFullSync(tenantId): Promise<{ inserted: number }>`. Если сигнатура другая — адаптировать вызов.

- [ ] **Step 1: Implement**

```typescript
import type { Telegraf } from 'telegraf';
import type { BotContext } from '../utils/context';
import type { SyncService } from '../../sync/sync.service';
import type { TelegramService } from '../../telegram/telegram.service';
import type { BotLogsService } from '../bot-logs.service';
import { Logger } from '@nestjs/common';

const log = new Logger('SyncHandler');
const inFlight = new Map<string, Promise<any>>(); // per tenantId

export function registerSync(
  bot: Telegraf<BotContext>,
  deps: { sync: SyncService; telegram: TelegramService; logs: BotLogsService },
): void {
  bot.command('sync', async (ctx) => {
    await deps.logs.log({ chatId: ctx.state.chatId, tenantId: null, command: '/sync' });
    const ownerLinks = ctx.state.tenants.filter((t) => t.role === 'owner');
    if (ownerLinks.length === 0) return; // middleware должен был отрезать; defensive
    // Multi-tenant owner — в MVP берём первый; при нескольких — TODO отдельный picker.
    const tenantId = ownerLinks[0].tenantId;
    const chatId = ctx.state.chatId;

    if (inFlight.has(tenantId)) {
      await ctx.reply('⏳ Синк уже идёт для этого салона. Дождись завершения.');
      return;
    }

    await ctx.reply('⏳ Синхронизация запущена. Пришлю сообщение когда закончится.');

    const task = (async () => {
      try {
        const result = await deps.sync.runFullSync(tenantId);
        await deps.telegram.sendReport(chatId, `✅ Синк готов. Новых записей: ${result.inserted ?? 0}.`);
      } catch (err: any) {
        log.error(`Sync failed for ${tenantId}: ${err?.message}`);
        await deps.telegram.sendReport(chatId, `❌ Синк упал: ${String(err?.message ?? err).slice(0, 200)}`);
      } finally {
        inFlight.delete(tenantId);
      }
    })();
    inFlight.set(tenantId, task);
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/telegram-bot/commands/sync.handler.ts
git commit -m "feat(telegram-bot): /sync handler async + follow-up"
```

---

## Task 18: TelegramBotService — lifecycle, advisory lock, wire handlers

**Files:**
- Modify: `apps/api/src/modules/telegram-bot/telegram-bot.module.ts`
- Create: `apps/api/src/modules/telegram-bot/telegram-bot.service.ts`
- Modify: `apps/api/src/config/app.config.ts`

- [ ] **Step 1: Add config flags**

Edit `apps/api/src/config/app.config.ts` — добавить `BOT_ENABLED` (default false) и `BOT_USERNAME` (optional) в loadConfig().

- [ ] **Step 2: Implement TelegramBotService**

```typescript
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Telegraf } from 'telegraf';
import { loadConfig } from '../../config/app.config';
import { TenantChatsService } from './tenant-chats.service';
import { InviteCodeService } from './invite-code.service';
import { BotLogsService } from './bot-logs.service';
import { TenantsService } from '../tenants/tenants.service';
import { ReportsService } from '../reports/reports.service';
import { SyncService } from '../sync/sync.service';
import { TelegramService } from '../telegram/telegram.service';
import { ReportDeliveryEntity } from '../reports/entities/report-delivery.entity';
import { resolveChatMiddleware } from './middleware/resolve-chat.middleware';
import { requireLinkedMiddleware } from './middleware/require-linked.middleware';
import { requireOwnerMiddleware } from './middleware/require-owner.middleware';
import { rateLimitMiddleware } from './middleware/rate-limit.middleware';
import { registerStart } from './commands/start.handler';
import { registerHelp } from './commands/help.handler';
import { registerLink } from './commands/link.handler';
import { registerReport } from './commands/report.handler';
import { registerStatus } from './commands/status.handler';
import { registerSubscribe } from './commands/subscribe.handler';
import { registerInvite } from './commands/invite.handler';
import { registerSync } from './commands/sync.handler';
import type { BotContext } from './utils/context';

const LOCK_KEY = 8823911; // arbitrary stable int; hashtext('telegram_bot_polling') could also work
const LOCK_RETRY_MS = 30_000;

@Injectable()
export class TelegramBotService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(TelegramBotService.name);
  private bot: Telegraf<BotContext> | null = null;
  private lockConn: any = null;
  private retryTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly ds: DataSource,
    private readonly tenantChats: TenantChatsService,
    private readonly codes: InviteCodeService,
    private readonly logs: BotLogsService,
    private readonly tenants: TenantsService,
    private readonly reports: ReportsService,
    private readonly sync: SyncService,
    private readonly telegram: TelegramService,
    @InjectRepository(ReportDeliveryEntity) private readonly deliveries: Repository<ReportDeliveryEntity>,
  ) {}

  async onModuleInit(): Promise<void> {
    const cfg = loadConfig();
    if (!cfg.BOT_ENABLED || !cfg.TELEGRAM_BOT_TOKEN) {
      this.log.warn('Bot disabled (BOT_ENABLED=false or TELEGRAM_BOT_TOKEN missing)');
      return;
    }
    await this.tryLaunch(cfg.TELEGRAM_BOT_TOKEN);
  }

  private async tryLaunch(token: string): Promise<void> {
    const acquired = await this.acquireLock();
    if (!acquired) {
      this.log.warn(`Advisory lock busy, retrying in ${LOCK_RETRY_MS}ms`);
      this.retryTimer = setTimeout(() => this.tryLaunch(token), LOCK_RETRY_MS);
      return;
    }

    this.bot = new Telegraf<BotContext>(token);
    this.bot.use(resolveChatMiddleware(this.tenantChats));

    registerStart(this.bot, this.logs);
    registerHelp(this.bot, this.logs);
    this.bot.use(async (ctx, next) => {
      const text = ((ctx.message && 'text' in ctx.message ? ctx.message.text : '') as string) || '';
      if (text.startsWith('/link ') || text === '/link' || text === '/start' || text === '/help') return next();
      return requireLinkedMiddleware()(ctx, next);
    });

    registerLink(this.bot, { codes: this.codes, chats: this.tenantChats, tenants: this.tenants, logs: this.logs });
    registerReport(this.bot, { reports: this.reports, tenants: this.tenants, logs: this.logs });
    registerStatus(this.bot, { tenants: this.tenants, deliveries: this.deliveries, logs: this.logs });
    registerSubscribe(this.bot, { chats: this.tenantChats, tenants: this.tenants, logs: this.logs });

    // owner-only под гардом:
    const ownerGuard = requireOwnerMiddleware();
    this.bot.command(['invite', 'sync'], async (ctx, next) => ownerGuard(ctx, next));
    registerInvite(this.bot, { codes: this.codes, tenants: this.tenants, logs: this.logs });
    registerSync(this.bot, { sync: this.sync, telegram: this.telegram, logs: this.logs });

    this.bot.launch({ dropPendingUpdates: false })
      .catch((err) => this.log.error(`bot.launch failed: ${err?.message}`));
    this.log.log('Telegram bot polling started');
  }

  private async acquireLock(): Promise<boolean> {
    this.lockConn = await this.ds.driver.obtainMasterConnection();
    try {
      const res = await this.lockConn.query(`SELECT pg_try_advisory_lock($1) AS got`, [LOCK_KEY]);
      return res?.[0]?.got === true;
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    try { this.bot?.stop('SIGTERM'); } catch {}
    try {
      if (this.lockConn) {
        await this.lockConn.query(`SELECT pg_advisory_unlock($1)`, [LOCK_KEY]);
        await this.ds.driver.releaseMasterConnection?.(this.lockConn);
      }
    } catch {}
  }
}
```

- [ ] **Step 3: Update TelegramBotModule**

```typescript
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantChatsService } from './tenant-chats.service';
import { InviteCodeService } from './invite-code.service';
import { BotLogsService } from './bot-logs.service';
import { TelegramBotService } from './telegram-bot.service';
import { TenantChatEntity } from './entities/tenant-chat.entity';
import { TelegramInviteCodeEntity } from './entities/telegram-invite-code.entity';
import { TelegramBotLogEntity } from './entities/telegram-bot-log.entity';
import { ReportDeliveryEntity } from '../reports/entities/report-delivery.entity';
import { TenantsModule } from '../tenants/tenants.module';
import { TelegramModule } from '../telegram/telegram.module';
import { SyncModule } from '../sync/sync.module';
import { ReportsModule } from '../reports/reports.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TenantChatEntity, TelegramInviteCodeEntity, TelegramBotLogEntity, ReportDeliveryEntity,
    ]),
    TenantsModule,
    TelegramModule,
    SyncModule,
    forwardRef(() => ReportsModule),
  ],
  providers: [TenantChatsService, InviteCodeService, BotLogsService, TelegramBotService],
  exports: [TenantChatsService, InviteCodeService, BotLogsService],
})
export class TelegramBotModule {}
```

ReportsModule тоже оборачивает импорт TelegramBotModule через `forwardRef` (цикл из-за fan-out inject).

- [ ] **Step 4: Register in AppModule**

`apps/api/src/app.module.ts` — add `TelegramBotModule` to imports.

- [ ] **Step 5: Smoke test (manual)**

```bash
pnpm --filter @altegio/api start:dev
# в .env.local: BOT_ENABLED=true, TELEGRAM_BOT_TOKEN=<test bot>
# отправь /start в test-бот — должен ответить
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/telegram-bot/ apps/api/src/config/app.config.ts apps/api/src/app.module.ts
git commit -m "feat(telegram-bot): lifecycle with advisory lock, wire all command handlers"
```

---

## Task 19: CLI dual-write — link-telegram pishet v tenant_chats

**Files:**
- Modify: `apps/cli/src/commands/link-telegram.ts`

- [ ] **Step 1: Update CLI**

```typescript
import { Command } from 'commander';
import { bootstrapApp } from '../bootstrap';
import { TenantsService } from '../../../api/src/modules/tenants/tenants.service';
import { TenantChatsService } from '../../../api/src/modules/telegram-bot/tenant-chats.service';

export function linkTelegramCommand(): Command {
  return new Command('link-telegram')
    .description('Attach a Telegram chat to a tenant as owner')
    .requiredOption('--tenant <id>', 'Tenant UUID')
    .requiredOption('--chat <id>', 'Telegram chat/user ID', (v) => Number(v))
    .option('--enable', 'Enable report_enabled', false)
    .action(async (opts) => {
      const app = await bootstrapApp();
      const tenants = app.get(TenantsService);
      const chats = app.get(TenantChatsService);
      await tenants.setTelegramChat(opts.tenant, opts.chat);
      await chats.linkOwner(opts.tenant, opts.chat);
      if (opts.enable) await tenants.setReportEnabled(opts.tenant, true);
      console.log(`Linked chat ${opts.chat} to tenant ${opts.tenant} as owner, enabled=${Boolean(opts.enable)}`);
      await app.close();
    });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/cli/src/commands/link-telegram.ts
git commit -m "feat(cli): link-telegram dual-writes to tenant_chats as owner"
```

---

## Task 20: Integration — smoke test on local postgres

**Files:**
- Create: `apps/api/src/modules/telegram-bot/telegram-bot.integration.spec.ts`

- [ ] **Step 1: Write scenarios**

```typescript
// Сценарии (используй существующий testcontainers harness из других integration spec):
// 1. После migrations тенант с telegram_chat_id = 111 имеет row в tenant_chats(role='owner', subscribed=true).
// 2. InviteCodeService.generate → TenantChatsService.linkMember через consume → listSubscribedChats возвращает оба чата.
// 3. ReportsService.generateAndDeliver пишет 2 чата × 2 kind = 4 строки в report_deliveries; повторный вызов — 0 новых sends.
// 4. Если telegram.sendReport для member бросает 403 — setSubscribed(member, false).
```

(Полный код — скопировать паттерн из существующего `reports.service.spec.ts` с postgres-контейнером; псевдокод выше описывает ассерты.)

- [ ] **Step 2: Run, expect pass**

```bash
pnpm --filter @altegio/api test -- --testPathPattern='telegram-bot.integration'
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/telegram-bot/telegram-bot.integration.spec.ts
git commit -m "test(telegram-bot): integration scenarios (invite/link/fan-out/auto-unsubscribe)"
```

---

## Task 21: Docs + rollout notes

**Files:**
- Modify: `HANDOFF.md`
- Create: `docs/superpowers/plans/2026-04-20-altegio-ai-phase-1-acceptance.md` (append Phase 1.2 block после acceptance)

- [ ] **Step 1: Add `.env` keys to README / HANDOFF**

Append to `HANDOFF.md`:

```markdown
## Phase 1.2 rollout

- `.env` on VPS: `BOT_ENABLED=true`.
- После `deploy.sh` проверить логи: «Telegram bot polling started».
- Smoke: `/start` в owner-чат BrowUp → ответ; `/invite` → код; из тестового второго чата `/link <код>` → подтверждение; `/report` оттуда же → два сообщения.
```

- [ ] **Step 2: Commit**

```bash
git add HANDOFF.md
git commit -m "docs: Phase 1.2 rollout notes"
```

---

## Acceptance Checklist (post-deploy)

- [ ] Все 4 миграции применены на VPS (`SELECT * FROM migrations`).
- [ ] В `tenant_chats` одна строка для BrowUp (`role='owner'`, `subscribed=true`).
- [ ] `/start` / `/help` отвечают в owner-чате.
- [ ] `/invite` возвращает 6-цифровой код; через 24ч — `expired`.
- [ ] Второй тестовый чат после `/link <code>` получает scheduled report на следующий день.
- [ ] `/unsubscribe` во втором чате → на следующий день получает только owner.
- [ ] Блокировка бота вторым чатом → auto-unsubscribe (проверка в `tenant_chats.subscribed=false` и записи `status='failed'` в `report_deliveries`).
- [ ] `/report 2020-01-01` → «нет данных на эту дату».
- [ ] `/report 2099-01-01` → «нет данных на эту дату».
- [ ] Rate-limit `/report` — второй вызов в пределах 10 мин отвергается.
- [ ] `/sync` — ack сразу, follow-up через N секунд с «Готово, +N записей».

---

## Notes

- **Цикл модулей:** `ReportsModule` ↔ `TelegramBotModule` резолвится через `forwardRef`. Если Nest жалуется на cycles при старте — убедись что обе стороны используют `forwardRef(() => ...)`.
- **Advisory lock key:** `8823911` — произвольный стабильный int. Альтернатива: `pg_try_advisory_lock(hashtext('telegram_bot_polling'))`.
- **Telegraf types:** `BotContext extends Context` с `state: {chatId, tenants}` — через `Telegraf<BotContext>` тайпится всё цепочкой.
- **Multi-tenant owner для `/sync`:** MVP берёт первый tenant у owner. Если у пользователя несколько салонов с ролью owner — надо picker (TODO в бэклог Phase 1.3).
