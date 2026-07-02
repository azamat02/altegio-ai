import { Controller, Get } from '@nestjs/common';

@Controller('tma')
export class TmaController {
  @Get('ping')
  ping() {
    return { ok: true };
  }
}
