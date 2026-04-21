import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BotLogsService } from './bot-logs.service';
import { TelegramBotLogEntity } from './entities/telegram-bot-log.entity';

describe('BotLogsService', () => {
  let service: BotLogsService;
  let repo: Partial<Repository<TelegramBotLogEntity>>;
  let qb: any;

  beforeEach(async () => {
    qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
    };
    repo = {
      save: jest.fn(async (x: any) => x) as any,
      createQueryBuilder: jest.fn().mockReturnValue(qb),
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
    qb.getCount.mockResolvedValue(0);
    const ok = await service.isAllowed({ chatId: 1, command: '/report', max: 1, windowMs: 600_000 });
    expect(ok).toBe(true);
  });

  it('isAllowed returns false when at limit', async () => {
    qb.getCount.mockResolvedValue(1);
    const ok = await service.isAllowed({ chatId: 1, command: '/report', max: 1, windowMs: 600_000 });
    expect(ok).toBe(false);
  });
});
