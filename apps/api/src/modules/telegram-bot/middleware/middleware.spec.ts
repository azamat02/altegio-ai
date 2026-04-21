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
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('владелец'));
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
