import { RawWriterService } from './raw-writer.service';

type AnyRepo = { upsert: jest.Mock };

function repo(): AnyRepo {
  return { upsert: jest.fn().mockResolvedValue(undefined) };
}

function ds() {
  return { query: jest.fn().mockResolvedValue(undefined) };
}

describe('RawWriterService', () => {
  it('upserts records by (tenantId, altegioRecordId)', async () => {
    const rec = repo(); const cli = repo(); const stf = repo(); const svc = repo();
    const w = new RawWriterService(rec as any, cli as any, stf as any, svc as any, ds() as any);
    await w.writeRecords('t-1', [{ id: 10, foo: 'bar' } as any, { id: 20, x: 1 } as any]);
    expect(rec.upsert).toHaveBeenCalledWith(
      [
        { tenantId: 't-1', altegioRecordId: 10, payload: { id: 10, foo: 'bar' } },
        { tenantId: 't-1', altegioRecordId: 20, payload: { id: 20, x: 1 } },
      ],
      { conflictPaths: ['tenantId', 'altegioRecordId'], skipUpdateIfNoValuesChanged: false },
    );
  });

  it('is a no-op for empty arrays', async () => {
    const rec = repo(); const cli = repo(); const stf = repo(); const svc = repo();
    const w = new RawWriterService(rec as any, cli as any, stf as any, svc as any, ds() as any);
    await w.writeRecords('t-1', []);
    expect(rec.upsert).not.toHaveBeenCalled();
  });

  it('upserts clients, staff, services by their respective keys', async () => {
    const rec = repo(); const cli = repo(); const stf = repo(); const svc = repo();
    const w = new RawWriterService(rec as any, cli as any, stf as any, svc as any, ds() as any);

    await w.writeClients('t-1', [{ id: 100 } as any]);
    expect(cli.upsert).toHaveBeenCalledWith(
      [{ tenantId: 't-1', altegioClientId: 100, payload: { id: 100 } }],
      { conflictPaths: ['tenantId', 'altegioClientId'], skipUpdateIfNoValuesChanged: false },
    );

    await w.writeStaff('t-1', [{ id: 5 } as any]);
    expect(stf.upsert).toHaveBeenCalledWith(
      [{ tenantId: 't-1', altegioStaffId: 5, payload: { id: 5 } }],
      { conflictPaths: ['tenantId', 'altegioStaffId'], skipUpdateIfNoValuesChanged: false },
    );

    await w.writeServices('t-1', [{ id: 7 } as any]);
    expect(svc.upsert).toHaveBeenCalledWith(
      [{ tenantId: 't-1', altegioServiceId: 7, payload: { id: 7 } }],
      { conflictPaths: ['tenantId', 'altegioServiceId'], skipUpdateIfNoValuesChanged: false },
    );
  });

  it('upsertResources calls dataSource.query with unnest arrays', async () => {
    const dataSource = ds();
    const w = new RawWriterService(repo() as any, repo() as any, repo() as any, repo() as any, dataSource as any);
    await w.upsertResources([
      { tenantId: 'tid-1', altegioId: 42, title: 'Room A' },
      { tenantId: 'tid-1', altegioId: 43, title: 'Room B' },
    ]);
    expect(dataSource.query).toHaveBeenCalledTimes(1);
    const [sql, params] = dataSource.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO resources');
    expect(params[0]).toEqual(['tid-1', 'tid-1']);
    expect(params[1]).toEqual([42, 43]);
    expect(params[2]).toEqual(['Room A', 'Room B']);
  });

  it('upsertResources is a no-op for empty arrays', async () => {
    const dataSource = ds();
    const w = new RawWriterService(repo() as any, repo() as any, repo() as any, repo() as any, dataSource as any);
    await w.upsertResources([]);
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('upsertResourceSchedule calls dataSource.query with unnest arrays', async () => {
    const dataSource = ds();
    const w = new RawWriterService(repo() as any, repo() as any, repo() as any, repo() as any, dataSource as any);
    await w.upsertResourceSchedule([
      { tenantId: 'tid-1', resourceAltegioId: 42, date: '2026-04-21', workingMinutes: 480 },
    ]);
    expect(dataSource.query).toHaveBeenCalledTimes(1);
    const [sql, params] = dataSource.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO resource_schedule');
    expect(params[0]).toEqual(['tid-1']);
    expect(params[1]).toEqual([42]);
    expect(params[2]).toEqual(['2026-04-21']);
    expect(params[3]).toEqual([480]);
  });

  it('upsertResourceSchedule is a no-op for empty arrays', async () => {
    const dataSource = ds();
    const w = new RawWriterService(repo() as any, repo() as any, repo() as any, repo() as any, dataSource as any);
    await w.upsertResourceSchedule([]);
    expect(dataSource.query).not.toHaveBeenCalled();
  });
});
