import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { TenantsService } from '../tenants/tenants.service';
import { RawWriterService } from './raw-writer.service';
import { AggregatorService } from './aggregator.service';
import { RecordsParser, RecordRow } from './parsers/records.parser';
import { StaffParser, StaffRow } from './parsers/staff.parser';
import { ServicesParser, ServiceRow } from './parsers/services.parser';
import { ClientsParser, ClientRow } from './parsers/clients.parser';
import { parseStaffSchedule } from './parsers/timetable.parser';
import { parseServiceCategories } from './parsers/service-categories.parser';
import { RecordsEndpoint } from '../altegio/endpoints/records';
import { ClientsEndpoint } from '../altegio/endpoints/clients';
import { StaffEndpoint } from '../altegio/endpoints/staff';
import { ServicesEndpoint } from '../altegio/endpoints/services';
import { ResourcesEndpoint } from '../altegio/endpoints/resources';
import { TimetableEndpoint } from '../altegio/endpoints/timetable';
import { ServiceCategoriesEndpoint } from '../altegio/endpoints/service-categories';
import { SyncJobEntity } from './entities/sync-job.entity';
import { loadConfig } from '../../config/app.config';

interface SyncOptions {
  days?: number;
}

@Injectable()
export class SyncService {
  private readonly log = new Logger(SyncService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(SyncJobEntity) private readonly jobs: Repository<SyncJobEntity>,
    private readonly tenants: TenantsService,
    private readonly rawWriter: RawWriterService,
    private readonly aggregator: AggregatorService,
    private readonly recParser: RecordsParser,
    private readonly stfParser: StaffParser,
    private readonly svcParser: ServicesParser,
    private readonly cliParser: ClientsParser,
    private readonly recEp: RecordsEndpoint,
    private readonly cliEp: ClientsEndpoint,
    private readonly stfEp: StaffEndpoint,
    private readonly svcEp: ServicesEndpoint,
    private readonly _resEp: ResourcesEndpoint,
    private readonly ttEp: TimetableEndpoint,
    private readonly svcCatEp: ServiceCategoriesEndpoint,
  ) {}

  async syncTenant(tenantId: string, opts: SyncOptions = {}): Promise<void> {
    const tenant = await this.tenants.findById(tenantId);
    if (!tenant) throw new Error(`Tenant ${tenantId} not found`);

    const job = await this.jobs.save(this.jobs.create({ tenantId, status: 'running' }));
    const partnerToken = await this.tenants.getAltegioToken(tenantId);
    const userToken = loadConfig().ALTEGIO_USER_TOKEN;
    const auth = { partnerToken, userToken, locationId: Number(tenant.locationId) };

    const days = opts.days ?? 3;
    const end = new Date();
    const start = new Date(Date.now() - days * 86_400_000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    let total = 0;
    const touchedDates = new Set<string>();

    try {
      // 1) Snapshots (staff, services)
      const staff = await this.stfEp.fetchAll(auth);
      await this.rawWriter.writeStaff(tenantId, staff);
      await this.upsertStaff(tenantId, staff.map((s) => this.stfParser.toRow(tenantId, s)));

      const services = await this.svcEp.fetchAll(auth);
      await this.rawWriter.writeServices(tenantId, services);
      await this.upsertServices(tenantId, services.map((s) => this.svcParser.toRow(tenantId, s)));

      // 2) Records delta
      for await (const batch of this.recEp.fetchAll(auth, { start: fmt(start), end: fmt(end) })) {
        await this.rawWriter.writeRecords(tenantId, batch);
        const rows = batch.map((r) => this.recParser.toRecordRow(tenantId, r));
        await this.upsertRecords(rows);
        rows.forEach((r) => touchedDates.add(this.localDate(r.datetime, tenant.timezone)));
        total += batch.length;
      }

      // 3) Clients delta (page 1 only for Phase 1)
      const cliBatch = await this.cliEp.fetchPage(auth, 1, 200);
      await this.rawWriter.writeClients(tenantId, cliBatch);
      await this.upsertClients(tenantId, cliBatch.map((c) => this.cliParser.toRow(tenantId, c)));

      // 4) Service categories
      const categories = await this.svcCatEp.fetchAll(auth);
      await this.rawWriter.upsertServiceCategories(parseServiceCategories(tenantId, categories));

      // 5) Staff schedule (single call for entire date range)
      const scheduleStart = fmt(new Date(Date.now() - days * 86_400_000));
      const scheduleEnd = fmt(new Date(Date.now() + 86_400_000)); // include tomorrow
      const schedule = await this.ttEp.fetchStaffSchedule(auth, scheduleStart, scheduleEnd);
      await this.rawWriter.upsertResourceSchedule(parseStaffSchedule(tenantId, schedule));

      // 6) Aggregate every touched date
      for (const d of touchedDates) {
        await this.aggregator.recomputeDay(tenantId, d);
      }

      await this.jobs.update({ id: job.id }, {
        status: 'success',
        finishedAt: new Date(),
        recordsFetched: total,
      });
      this.log.log(`[${tenant.salonName}] sync ok — ${total} records, ${touchedDates.size} dates`);
    } catch (err: any) {
      await this.jobs.update({ id: job.id }, {
        status: 'failed',
        finishedAt: new Date(),
        error: String(err?.message ?? err).slice(0, 2000),
      });
      throw err;
    }
  }

  private localDate(d: Date, tz: string): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(d);
  }

  private async upsertRecords(rows: RecordRow[]): Promise<void> {
    if (rows.length === 0) return;
    // Per-row VALUES approach (unnest with bigint[][] doesn't work in pg driver).
    // Column 13 (resource_instance_ids) is cast explicitly to bigint[].
    const COLS = 13;
    const values = rows
      .map((_, i) => {
        const base = i * COLS;
        const params = Array.from({ length: COLS }, (__, j) => {
          const pos = base + j + 1;
          return j === 12 ? `$${pos}::bigint[]` : `$${pos}`;
        });
        return `(${params.join(', ')})`;
      })
      .join(', ');
    const params = rows.flatMap((r) => [
      r.tenantId, r.altegioRecordId, r.altegioStaffId, r.altegioClientId,
      r.altegioServiceId, r.datetime, r.seanceLength, r.cost, r.attendance, r.paidFull,
      r.isOnline, r.deleted, r.resourceInstanceIds,
    ]);
    await this.ds.query(
      `
      INSERT INTO records
        (tenant_id, altegio_record_id, altegio_staff_id, altegio_client_id, altegio_service_id,
         datetime, seance_length, cost, attendance, paid_full, is_online, deleted, resource_instance_ids)
      VALUES ${values}
      ON CONFLICT (tenant_id, altegio_record_id) DO UPDATE SET
        altegio_staff_id = EXCLUDED.altegio_staff_id,
        altegio_client_id = EXCLUDED.altegio_client_id,
        altegio_service_id = EXCLUDED.altegio_service_id,
        datetime = EXCLUDED.datetime,
        seance_length = EXCLUDED.seance_length,
        cost = EXCLUDED.cost,
        attendance = EXCLUDED.attendance,
        paid_full = EXCLUDED.paid_full,
        is_online = EXCLUDED.is_online,
        deleted = EXCLUDED.deleted,
        resource_instance_ids = EXCLUDED.resource_instance_ids,
        updated_at = now()
      `,
      params,
    );
  }

  private async upsertStaff(tenantId: string, rows: StaffRow[]): Promise<void> {
    if (rows.length === 0) return;
    for (const r of rows) {
      await this.ds.query(
        `
        INSERT INTO staff (tenant_id, altegio_staff_id, name, specialization, position_title, fired, bookable)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (tenant_id, altegio_staff_id) DO UPDATE SET
          name = EXCLUDED.name,
          specialization = EXCLUDED.specialization,
          position_title = EXCLUDED.position_title,
          fired = EXCLUDED.fired,
          bookable = EXCLUDED.bookable,
          updated_at = now()
        `,
        [tenantId, r.altegioStaffId, r.name, r.specialization, r.positionTitle, r.fired, r.bookable],
      );
    }
  }

  private async upsertServices(tenantId: string, rows: ServiceRow[]): Promise<void> {
    if (rows.length === 0) return;
    for (const r of rows) {
      await this.ds.query(
        `
        INSERT INTO services (tenant_id, altegio_service_id, title, category_id, price_min, price_max, active)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (tenant_id, altegio_service_id) DO UPDATE SET
          title = EXCLUDED.title, category_id = EXCLUDED.category_id,
          price_min = EXCLUDED.price_min, price_max = EXCLUDED.price_max,
          active = EXCLUDED.active, updated_at = now()
        `,
        [tenantId, r.altegioServiceId, r.title, r.categoryId, r.priceMin, r.priceMax, r.active],
      );
    }
  }

  private async upsertClients(tenantId: string, rows: ClientRow[]): Promise<void> {
    if (rows.length === 0) return;
    for (const r of rows) {
      await this.ds.query(
        `
        INSERT INTO clients (tenant_id, altegio_client_id, name, phone, visits_count, last_visit_date, spent)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (tenant_id, altegio_client_id) DO UPDATE SET
          name = EXCLUDED.name, phone = EXCLUDED.phone,
          visits_count = EXCLUDED.visits_count, last_visit_date = EXCLUDED.last_visit_date,
          spent = EXCLUDED.spent, updated_at = now()
        `,
        [tenantId, r.altegioClientId, r.name, r.phone, r.visitsCount, r.lastVisitDate, r.spent],
      );
    }
  }
}
