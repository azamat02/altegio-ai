import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { AltegioRawRecordEntity } from './entities/altegio-raw-record.entity';
import { AltegioRawClientEntity } from './entities/altegio-raw-client.entity';
import { AltegioRawStaffEntity } from './entities/altegio-raw-staff.entity';
import { AltegioRawServiceEntity } from './entities/altegio-raw-service.entity';
import type { AltegioRecordDto } from '../altegio/dto/record.dto';
import type { AltegioClientDto } from '../altegio/dto/client.dto';
import type { AltegioStaffDto } from '../altegio/dto/staff.dto';
import type { AltegioServiceDto } from '../altegio/dto/service.dto';

@Injectable()
export class RawWriterService {
  constructor(
    @InjectRepository(AltegioRawRecordEntity) private readonly recs: Repository<AltegioRawRecordEntity>,
    @InjectRepository(AltegioRawClientEntity) private readonly cli: Repository<AltegioRawClientEntity>,
    @InjectRepository(AltegioRawStaffEntity) private readonly stf: Repository<AltegioRawStaffEntity>,
    @InjectRepository(AltegioRawServiceEntity) private readonly svc: Repository<AltegioRawServiceEntity>,
  ) {}

  async writeRecords(tenantId: string, batch: AltegioRecordDto[]): Promise<void> {
    if (batch.length === 0) return;
    await this.recs.upsert(
      batch.map((r) => ({ tenantId, altegioRecordId: r.id, payload: r })),
      { conflictPaths: ['tenantId', 'altegioRecordId'], skipUpdateIfNoValuesChanged: false },
    );
  }

  async writeClients(tenantId: string, batch: AltegioClientDto[]): Promise<void> {
    if (batch.length === 0) return;
    await this.cli.upsert(
      batch.map((c) => ({ tenantId, altegioClientId: c.id, payload: c })),
      { conflictPaths: ['tenantId', 'altegioClientId'], skipUpdateIfNoValuesChanged: false },
    );
  }

  async writeStaff(tenantId: string, batch: AltegioStaffDto[]): Promise<void> {
    if (batch.length === 0) return;
    await this.stf.upsert(
      batch.map((s) => ({ tenantId, altegioStaffId: s.id, payload: s })),
      { conflictPaths: ['tenantId', 'altegioStaffId'], skipUpdateIfNoValuesChanged: false },
    );
  }

  async writeServices(tenantId: string, batch: AltegioServiceDto[]): Promise<void> {
    if (batch.length === 0) return;
    await this.svc.upsert(
      batch.map((s) => ({ tenantId, altegioServiceId: s.id, payload: s })),
      { conflictPaths: ['tenantId', 'altegioServiceId'], skipUpdateIfNoValuesChanged: false },
    );
  }
}
