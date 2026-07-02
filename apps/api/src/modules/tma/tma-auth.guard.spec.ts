// apps/api/src/modules/tma/tma-auth.guard.spec.ts
import * as crypto from 'crypto';
import { ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { TmaAuthGuard } from './tma-auth.guard';

const BOT_TOKEN = '123:ABC';
function sign(fields: Record<string, string>): string {
  const dataCheck = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const hash = crypto.createHmac('sha256', secret).update(dataCheck).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}
function ctx(authHeader?: string): { context: ExecutionContext; req: any } {
  const req: any = { headers: authHeader ? { authorization: authHeader } : {} };
  const context = { switchToHttp: () => ({ getRequest: () => req }) } as ExecutionContext;
  return { context, req };
}

describe('TmaAuthGuard', () => {
  const now = Math.floor(Date.now() / 1000);
  beforeAll(() => { process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN; });

  function guardWith(tenants: any) {
    return new TmaAuthGuard(tenants);
  }

  it('attaches tenant on a valid owner', async () => {
    const initData = sign({ auth_date: String(now), user: JSON.stringify({ id: 42 }) });
    const tenants = { listTenantsForChat: jest.fn().mockResolvedValue([{ tenantId: 't1', chatId: 42, role: 'owner' }]) };
    const { context, req } = ctx(`tma ${initData}`);
    await expect(guardWith(tenants).canActivate(context)).resolves.toBe(true);
    expect(req.tma).toEqual({ tenantId: 't1', role: 'owner', chatId: 42 });
  });

  it('401 on missing header', async () => {
    const { context } = ctx(undefined);
    await expect(guardWith({}).canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('401 on tampered signature', async () => {
    const initData = sign({ auth_date: String(now), user: JSON.stringify({ id: 42 }) }) + 'ff';
    const { context } = ctx(`tma ${initData}`);
    await expect(guardWith({}).canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('403 when the user is linked to no tenant', async () => {
    const initData = sign({ auth_date: String(now), user: JSON.stringify({ id: 42 }) });
    const tenants = { listTenantsForChat: jest.fn().mockResolvedValue([]) };
    const { context } = ctx(`tma ${initData}`);
    await expect(guardWith(tenants).canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('prefers the owner tenant when several are linked', async () => {
    const initData = sign({ auth_date: String(now), user: JSON.stringify({ id: 42 }) });
    const tenants = { listTenantsForChat: jest.fn().mockResolvedValue([
      { tenantId: 'm', chatId: 42, role: 'member' }, { tenantId: 'o', chatId: 42, role: 'owner' },
    ]) };
    const { context, req } = ctx(`tma ${initData}`);
    await guardWith(tenants).canActivate(context);
    expect(req.tma.tenantId).toBe('o');
  });
});
