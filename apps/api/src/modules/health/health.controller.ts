import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  @Get()
  async get(): Promise<{ status: string; db: 'up' | 'down'; uptime: number }> {
    let db: 'up' | 'down' = 'up';
    try {
      await this.ds.query('SELECT 1');
    } catch {
      db = 'down';
    }
    return { status: db === 'up' ? 'ok' : 'degraded', db, uptime: Math.round(process.uptime()) };
  }
}
