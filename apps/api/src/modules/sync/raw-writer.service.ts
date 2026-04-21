import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AltegioRawRecordEntity } from './entities/altegio-raw-record.entity';
import { AltegioRawClientEntity } from './entities/altegio-raw-client.entity';
import { AltegioRawStaffEntity } from './entities/altegio-raw-staff.entity';
import { AltegioRawServiceEntity } from './entities/altegio-raw-service.entity';
import { AltegioRecordDto } from '../altegio/dto/record.dto';
import { AltegioClientDto } from '../altegio/dto/client.dto';
import { AltegioStaffDto } from '../altegio/dto/staff.dto';
import { AltegioServiceDto } from '../altegio/dto/service.dto';
import { ResourceRow } from './parsers/resources.parser';
import { ResourceScheduleRow } from './parsers/timetable.parser';
import { ServiceCategoryRow } from './parsers/service-categories.parser';

@Injectable()
export class RawWriterService {
  constructor(
    @InjectRepository(AltegioRawRecordEntity) private readonly recs: Repository<AltegioRawRecordEntity>,
    @InjectRepository(AltegioRawClientEntity) private readonly cli: Repository<AltegioRawClientEntity>,
    @InjectRepository(AltegioRawStaffEntity) private readonly stf: Repository<AltegioRawStaffEntity>,
    @InjectRepository(AltegioRawServiceEntity) private readonly svc: Repository<AltegioRawServiceEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
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

  async upsertResources(rows: ResourceRow[]): Promise<void> {
    if (!rows.length) return;
    await this.dataSource.query(
      `INSERT INTO resources (tenant_id, altegio_id, title)
       SELECT * FROM unnest($1::uuid[], $2::bigint[], $3::text[])
       ON CONFLICT (tenant_id, altegio_id)
       DO UPDATE SET title = EXCLUDED.title, fetched_at = now()`,
      [
        rows.map(r => r.tenantId),
        rows.map(r => r.altegioId),
        rows.map(r => r.title),
      ],
    );
  }

  async upsertResourceSchedule(rows: ResourceScheduleRow[]): Promise<void> {
    if (!rows.length) return;
    await this.dataSource.query(
      `INSERT INTO resource_schedule (tenant_id, resource_altegio_id, date, working_minutes)
       SELECT * FROM unnest($1::uuid[], $2::bigint[], $3::date[], $4::int[])
       ON CONFLICT (tenant_id, resource_altegio_id, date)
       DO UPDATE SET working_minutes = EXCLUDED.working_minutes, fetched_at = now()`,
      [
        rows.map(r => r.tenantId),
        rows.map(r => r.resourceAltegioId),
        rows.map(r => r.date),
        rows.map(r => r.workingMinutes),
      ],
    );
  }

  async upsertServiceCategories(rows: ServiceCategoryRow[]): Promise<void> {
    if (!rows.length) return;
    await this.dataSource.query(
      `INSERT INTO service_categories (tenant_id, altegio_category_id, title)
       SELECT * FROM unnest($1::uuid[], $2::bigint[], $3::text[])
       ON CONFLICT (tenant_id, altegio_category_id)
       DO UPDATE SET title = EXCLUDED.title, fetched_at = now()`,
      [
        rows.map(r => r.tenantId),
        rows.map(r => r.altegioCategoryId),
        rows.map(r => r.title),
      ],
    );
  }
}
