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
      save: jest.fn(async (x: any) => x) as any,
      update: jest.fn(async () => ({ affected: 1 } as any)),
      createQueryBuilder: jest.fn().mockReturnValue({
        insert: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        orUpdate: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({}),
      }),
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

  it('listSubscribedChats filters to subscribed=true', async () => {
    (repo.find as jest.Mock).mockResolvedValue([
      { tenantId: 't1', chatId: 1, role: 'owner', subscribed: true },
    ]);
    const out = await service.listSubscribedChats('t1');
    expect(repo.find).toHaveBeenCalledWith({ where: { tenantId: 't1', subscribed: true } });
    expect(out).toHaveLength(1);
  });

  it('linkMember inserts as member/subscribed', async () => {
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
