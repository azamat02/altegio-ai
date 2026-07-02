import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { TenantChatsService } from '../telegram-bot/tenant-chats.service';
import { validateInitData } from './init-data';

const MAX_AGE_SEC = 86400;

@Injectable()
export class TmaAuthGuard implements CanActivate {
  private readonly log = new Logger(TmaAuthGuard.name);

  constructor(private readonly tenantChats: TenantChatsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    const initData = header?.startsWith('tma ') ? header.slice(4) : undefined;
    if (!initData) {
      // Empty string after "tma " = the Telegram client did not provide initData
      // (seen with the native macOS client). Log the reason to make 401s diagnosable.
      this.log.warn(`401 missing/empty initData (auth header ${header ? 'present' : 'absent'})`);
      throw new UnauthorizedException('missing initData');
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new UnauthorizedException('server not configured');

    const parsed = validateInitData(initData, token, MAX_AGE_SEC);
    if (!parsed) {
      this.log.warn('401 invalid initData (bad signature, expired auth_date, or malformed user)');
      throw new UnauthorizedException('invalid initData');
    }

    const links = await this.tenantChats.listTenantsForChat(parsed.userId);
    if (!links.length) {
      this.log.warn(`403 no linked salon for user ${parsed.userId}`);
      throw new ForbiddenException('no linked salon');
    }
    const chosen = links.find((l) => l.role === 'owner') ?? links[0];

    req.tma = { tenantId: chosen.tenantId, role: chosen.role, chatId: parsed.userId };
    return true;
  }
}
