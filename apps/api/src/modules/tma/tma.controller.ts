import { Controller, Get, Param, ParseIntPipe, Query, Req, UseGuards } from '@nestjs/common';
import { TmaAuthGuard } from './tma-auth.guard';
import { TmaService } from './tma.service';

@Controller('tma')
@UseGuards(TmaAuthGuard)
export class TmaController {
  constructor(private readonly tma: TmaService) {}

  @Get('summary')
  summary(@Req() req: any, @Query('date') date?: string) {
    return this.tma.summary(req.tma.tenantId, date);
  }

  @Get('staff')
  staff(@Req() req: any, @Query('from') from: string, @Query('to') to: string) {
    return this.tma.staff(req.tma.tenantId, from, to);
  }

  @Get('staff/:id/trend')
  async trend(@Req() req: any, @Param('id', ParseIntPipe) id: number, @Query('days') days?: string) {
    const series = await this.tma.staffTrend(req.tma.tenantId, id, days ? Number(days) : 30);
    return { series };
  }
}
