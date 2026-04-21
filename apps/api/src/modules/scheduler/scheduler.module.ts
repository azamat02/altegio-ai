import { DynamicModule} from '@nestjs/common';
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { SchedulerService } from './scheduler.service';
import { TenantsModule } from '../tenants/tenants.module';

@Module({})
export class SchedulerModule {
  static forRoot(): DynamicModule {
    if (process.env.SCHEDULER_ENABLED !== 'true') {
      return { module: SchedulerModule };
    }
    return {
      module: SchedulerModule,
      imports: [
        ScheduleModule.forRoot(),
        BullModule.registerQueue({ name: 'reports' }, { name: 'sync' }),
        TenantsModule,
      ],
      providers: [SchedulerService],
    };
  }
}
