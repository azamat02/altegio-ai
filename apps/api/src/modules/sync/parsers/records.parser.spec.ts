import { RecordsParser } from './records.parser';
import { AltegioRecordDto } from '../../altegio/dto/record.dto';

describe('RecordsParser', () => {
  const parser = new RecordsParser();
  const tenantId = 't-1';

  it('maps basic fields including attendance and cost', () => {
    const dto: AltegioRecordDto = {
      id: 42,
      date: '2026-04-19 14:00:00',
      datetime: '2026-04-19T14:00:00+05:00',
      staff_id: 7,
      client: { id: 11 },
      services: [{ id: 1, title: 's', cost: 5000 }],
      cost: 5000,
      attendance: 1,
      paid_full: 1,
      online: true,
      seance_length: 3600,
      deleted: false,
    };
    const row = parser.toRecordRow(tenantId, dto);
    expect(row).toMatchObject({
      tenantId: 't-1',
      altegioRecordId: 42,
      altegioStaffId: 7,
      altegioClientId: 11,
      cost: 5000,
      attendance: 1,
      paidFull: 1,
      isOnline: true,
      seanceLength: 3600,
      deleted: false,
    });
    expect(row.datetime).toBeInstanceOf(Date);
  });

  it('preserves deleted=true', () => {
    const dto = { id: 1, date: '2026-04-01', datetime: '2026-04-01T10:00:00Z', staff_id: 1, services: [], cost: 0, attendance: 0, paid_full: 0, online: false, seance_length: 0, deleted: true } as AltegioRecordDto;
    expect(parser.toRecordRow('t', dto).deleted).toBe(true);
  });

  it('handles null client gracefully', () => {
    const dto = { id: 2, date: '2026-04-01', datetime: '2026-04-01T10:00:00Z', staff_id: 3, client: null, services: [], cost: 0, attendance: 0, paid_full: 0, online: false, seance_length: 0, deleted: false } as AltegioRecordDto;
    expect(parser.toRecordRow('t', dto).altegioClientId).toBeNull();
  });

  it('sums services[].cost * amount when top-level cost is missing', () => {
    const dto = {
      id: 99,
      datetime: '2026-04-20T10:00:00Z',
      staff_id: 1,
      services: [
        { id: 1, title: 'a', cost: 5000, amount: 1 },
        { id: 2, title: 'b', cost: 2000, amount: 2 },
      ],
      attendance: 1,
      paid_full: 1,
      online: false,
      seance_length: 3600,
      deleted: false,
    } as any;
    expect(parser.toRecordRow('t', dto).cost).toBe(9000);
  });

  it('prefers top-level cost when provided and positive', () => {
    const dto = {
      id: 100,
      datetime: '2026-04-20T10:00:00Z',
      staff_id: 1,
      services: [{ id: 1, title: 'a', cost: 2000, amount: 1 }],
      cost: 5000,
      attendance: 1,
      paid_full: 1,
      online: false,
      seance_length: 3600,
      deleted: false,
    } as any;
    expect(parser.toRecordRow('t', dto).cost).toBe(5000);
  });

  it('picks the first service id as altegioServiceId', () => {
    const dto: AltegioRecordDto = {
      id: 99, staff_id: 7, services: [{ id: 5001, title: 's' }, { id: 5002, title: 's2' }],
      datetime: '2026-04-19T10:00:00+05:00', attendance: 1,
      cost: 0, seance_length: 0, paid_full: 0, deleted: false,
    };
    expect(parser.toRecordRow('t', dto).altegioServiceId).toBe(5001);
  });

  it('leaves altegioServiceId null when services is empty', () => {
    const dto: AltegioRecordDto = {
      id: 100, staff_id: 7, services: [],
      datetime: '2026-04-19T10:00:00+05:00', attendance: 1,
      cost: 0, seance_length: 0, paid_full: 0, deleted: false,
    };
    expect(parser.toRecordRow('t', dto).altegioServiceId).toBeNull();
  });

  it('maps record_from to recordSource and treats empty string as null', () => {
    const make = (record_from: string | undefined): AltegioRecordDto => ({
      id: 1, staff_id: 1, services: [], datetime: '2026-04-19T10:00:00Z',
      attendance: 1, cost: 0, seance_length: 0, paid_full: 0, deleted: false,
      record_from,
    });
    expect(parser.toRecordRow('t', make('Online widget')).recordSource).toBe('Online widget');
    expect(parser.toRecordRow('t', make('')).recordSource).toBeNull();
    expect(parser.toRecordRow('t', make(undefined)).recordSource).toBeNull();
  });

  it('prefers record.length over service.seance_length and carries resource ids', () => {
    const dto: AltegioRecordDto = {
      id: 1, staff_id: 11, services: [{ id: 100, title: 's' }],
      datetime: '2026-04-19T10:00:00+05:00',
      attendance: 1, cost: 10000, paid_full: 0, deleted: false,
      seance_length: 1800, length: 2400,
      resource_instance_ids: [135733],
    };

    const row = parser.toRecordRow('t', dto);
    expect(row.seanceLength).toBe(2400);
    expect(row.resourceInstanceIds).toEqual([135733]);
  });
});
