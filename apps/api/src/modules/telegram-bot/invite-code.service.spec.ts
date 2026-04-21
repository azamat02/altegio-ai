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
      save: jest.fn(async (x: any) => x) as any,
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
