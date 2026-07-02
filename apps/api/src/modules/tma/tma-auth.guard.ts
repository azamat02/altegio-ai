import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { TenantChatsService } from '../telegram-bot/tenant-chats.service';
import { validateInitData } from './init-data';

const MAX_AGE_SEC = 86400;

@Injectable()
export class TmaAuthGuard implements CanActivate {
  constructor(private readonly tenantChats: TenantChatsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    const initData = header?.startsWith('tma ') ? header.slice(4) : undefined;
    if (!initData) throw new UnauthorizedException('missing initData');

    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new UnauthorizedException('server not configured');

    const parsed = validateInitData(initData, token, MAX_AGE_SEC);
    if (!parsed) throw new UnauthorizedException('invalid initData');

    const links = await this.tenantChats.listTenantsForChat(parsed.userId);
    if (!links.length) throw new ForbiddenException('no linked salon');
    const chosen = links.find((l) => l.role === 'owner') ?? links[0];

    req.tma = { tenantId: chosen.tenantId, role: chosen.role, chatId: parsed.userId };
    return true;
  }
}
