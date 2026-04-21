import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { AltegioRawRecordEntity } from './entities/altegio-raw-record.entity';
import { AltegioRawClientEntity } from './entities/altegio-raw-client.entity';
import { AltegioRawStaffEntity } from './entities/altegio-raw-staff.entity';
import { AltegioRawServiceEntity } from './entities/altegio-raw-service.entity';
import { SyncJobEntity } from './entities/sync-job.entity';
import { RawWriterService } from './raw-writer.service';
import { AggregatorService } from './aggregator.service';
import { RecordsParser } from './parsers/records.parser';
import { StaffParser } from './parsers/staff.parser';
import { ServicesParser } from './parsers/services.parser';
import { ClientsParser } from './parsers/clients.parser';
import { SyncService } from './sync.service';
import { SyncProcessor } from './sync.processor';
import { ResourceAffinityService } from './resource-affinity.service';
import { TenantsModule } from '../tenants/tenants.module';
import { AltegioModule } from '../altegio/altegio.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AltegioRawRecordEntity,
      AltegioRawClientEntity,
      AltegioRawStaffEntity,
      AltegioRawServiceEntity,
      SyncJobEntity,
    ]),
    BullModule.registerQueue({ name: 'sync' }),
    TenantsModule,
    AltegioModule,
  ],
  providers: [
    RawWriterService, AggregatorService, ResourceAffinityService,
    RecordsParser, StaffParser, ServicesParser, ClientsParser,
    SyncService,
    SyncProcessor,
  ],
  exports: [SyncService, AggregatorService, ResourceAffinityService],
})
export class SyncModule {}
