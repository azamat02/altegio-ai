import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { loadConfig } from '../config/app.config';

@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: () => {
        const cfg = loadConfig();
        const url = new URL(cfg.REDIS_URL);
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port || 6379),
            password: url.password || undefined,
          },
        };
      },
    }),
    BullModule.registerQueue(
      { name: 'sync' },
      { name: 'backfill' },
      { name: 'reports' },
    ),
  ],
  exports: [BullModule],
})
export class QueuesModule {}
